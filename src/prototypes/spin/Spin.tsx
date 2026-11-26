import { useEffect, useRef, useState } from 'react'
import { TUNE, TUNING } from './tune'
import TunePanel from './TunePanel'

const DOTS = 24 // shapes on the ring (and detents per turn)
const SCALE = [0, 2, 4, 7, 9] // major pentatonic: every combination sounds consonant
const RIPPLE_LIFE = 0.9 // seconds a ripple lives on the ring: as long as the pluck and its single echo ring
const clampPan = (x: number) => Math.max(-1, Math.min(1, x))
// one ripple's swell at t seconds: a fast rise and a slow fall. The sound's pluck and echoes are timed from the same curve
const rippleRise = (t: number) => (t > 0 ? (1 - Math.exp(-t * 40)) * Math.exp(-t * 3.4) : 0)
const RIPPLE_ECHOES = [[0.2, 0.4]] as const // [seconds later, level]: used by both the sound and the ring
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

type Voice = 'bowl' | 'kalimba' | 'marimba' | 'drops' | 'ripple'
// one instrument on the screen: its own angle, speed, dots and notes. Several rings can be on screen at once, each spun on its own
type Ring = {
  voice: Voice; rot: number; w: number; pulse: Float32Array; pop: Float32Array; pv: Float32Array; hold: Float32Array; n: number; step: number; lastNote: number
  dragging: boolean; pid: number; lastA: number; lastT: number
  R: number; alpha: number; leaving: boolean
}
const newRing = (voice: Voice, w = 0): Ring => ({
  voice, rot: 0, w, pulse: new Float32Array(72), pop: new Float32Array(72), pv: new Float32Array(72), hold: new Float32Array(72), n: DOTS, step: (Math.PI * 2) / DOTS, lastNote: 0,
  dragging: false, pid: -1, lastA: 0, lastT: 0, R: 0, alpha: 0, leaving: false,
})
// a detent: Ripple reads `pulse` (it fades linearly), every other shape springs: `hold` keeps the spring's target at 1 for a moment, then it settles back to 0
const trigger = (r: Ring, i: number) => { r.pulse[i] = 1; r.hold[i] = TUNE.popHold / 1000 }
// step every bead's spring (position `pop`, velocity `pv`). Sub-steps keep the integration stable however short the settle time is, and a bead hit again mid-motion keeps its speed
const stepPops = (r: Ring, dt: number) => {
  const w = (Math.PI * 2) / Math.max(0.05, TUNE.popSettle), k = w * w, c = 2 * Math.max(0.2, 1 - TUNE.popBounce) * w
  const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps
  for (let i = 0; i < r.n; i++) {
    const held = r.hold[i] > 0; r.hold[i] = Math.max(0, r.hold[i] - dt)
    if (!held && r.pop[i] === 0 && r.pv[i] === 0) continue
    let x = r.pop[i], v = r.pv[i]
    for (let s = 0; s < steps; s++) { v += (-k * (x - (held ? 1 : 0)) - c * v) * h; x += v * h }
    if (!held && Math.abs(x) < 0.002 && Math.abs(v) < 0.02) { x = 0; v = 0 }
    r.pop[i] = x; r.pv[i] = v
  }
}
const RINGS_KEY = 'spin-rings'
const readRings = (): Voice[] => { // the instruments that were on last time
  try {
    const j = JSON.parse(localStorage.getItem(RINGS_KEY) || '[]')
    const v = VOICES.filter((x) => Array.isArray(j) && j.includes(x))
    return v.length ? v : ['bowl']
  } catch { return ['bowl'] }
}
type SpinState = { rings: Ring[]; th: Theme; fbT: number; muted: boolean; cyFrac: number; W: number; H: number }
type LayerName = 'pad' | 'sub' | 'vinyl'
const LAYERS: LayerName[] = ['pad', 'sub', 'vinyl']
const LAYER_LABELS: Record<LayerName, string> = { pad: 'Pad', sub: 'Sub hum', vinyl: 'Vinyl' }
const DEFAULT_LEVEL = 0.6 // a layer's volume is 0 to 1; at this level it plays at the loudness it was designed for
const LEVELS_KEY = 'spin-levels'
const readLevels = (): Record<LayerName, number> => {
  const d = { pad: DEFAULT_LEVEL, sub: DEFAULT_LEVEL, vinyl: DEFAULT_LEVEL }
  try {
    const j = JSON.parse(localStorage.getItem(LEVELS_KEY) || '{}')
    for (const n of LAYERS) if (typeof j[n] === 'number' && j[n] >= 0 && j[n] <= 1) d[n] = j[n]
  } catch { /* private mode */ }
  return d
}
type AudioBits = { ctx: AudioContext; master: GainNode; fb: GainNode; bus: Record<LayerName, GainNode> } // fb = how much of each echo feeds the next; bus = one volume knob per layer
// readable icon colour on a coloured disc: dark on light colours (yellow), white on the rest
const onColour = (hex: string) => { const n = parseInt(hex.slice(1), 16), l = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); return l > 150 ? '#141414' : '#ffffff' }
const VOICES: Voice[] = ['bowl', 'kalimba', 'marimba', 'ripple', 'drops']
const RING_ORDER: Voice[] = VOICES // biggest ring first: Bowl outside, Drops (the bass) inside
// several rings at once: where each instrument sits in the scale (steps from its solo pitch) and how fast it runs relative to the others
const VOICE_BAND: Record<Voice, number> = { bowl: -5, marimba: -2, kalimba: 0, drops: 3, ripple: 5 }
const VOICE_GAP: Record<Voice, number> = { bowl: 1.5, marimba: 1.15, kalimba: 0.9, drops: 1.7, ripple: 1.3 }
const VOICE_LABELS:Record<Voice, string> = { bowl: 'Bowl', kalimba: 'Kalimba', marimba: 'Marimba', drops: 'Bass', ripple: 'Ripple' }
// ---- looks you can try: palette, dot count, dot shape, font
type Theme = {
  name: string; bg: string; ink: string; ring: string; dust: [string, string, string]; hub: string
  pill: string; pillBorder: string; pillText: string; pressed: string; onAccent: string; accents: Record<Voice, string>
}
const THEMES = {
  mono: { name: 'Mono', bg: '#0d0d0d', ink: '#f4f4f4', ring: '#333333', dust: ['#3a3a3a', '#2c2c2c', '#222222'], hub: '#666666',
    pill: '#171717', pillBorder: '#2a2a2a', pillText: '#9a9a9a', pressed: '#222222', onAccent: '#0d0d0d',
    accents: { bowl: '#ffd60a', kalimba: '#2fe07a', marimba: '#ff4f9a', drops: '#2e9bff', ripple: '#ff8a00' } }, // one vivid colour per ring
  chalk: { name: 'Chalk', bg: '#f4f4f2', ink: '#141414', ring: '#cfcfcb', dust: ['#c4c4c0', '#d2d2ce', '#dcdcd8'], hub: '#9a9a96',
    pill: '#eaeae6', pillBorder: '#d6d6d1', pillText: '#6a6a66', pressed: '#e2e2de', onAccent: '#f4f4f2',
    accents: { bowl: '#f0b400', kalimba: '#0fb35a', marimba: '#ee2f86', drops: '#1a73ff', ripple: '#ff6a00' } },
} satisfies Record<string, Theme>
type ThemeId = keyof typeof THEMES
// relative size of the five scale degrees' shapes (Kalimba tines and Marimba bars shorten up the scale, Drops dots are biggest on the first)
const KEYS = [1.15, 0.95, 0.6, 1.05, 0.8] as const
const THEME_IDS = Object.keys(THEMES) as ThemeId[]
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
const dotSize = (n: number) => Math.max(3, Math.min(10, 21 / Math.sqrt(n))) // fewer dots are bigger, more dots smaller
const LOOK_KEY = 'spin-look'
const readLook = (): ThemeId => {
  const osLight = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'chalk' : 'mono' // first visit follows the device
  try {
    const j = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')
    return j.theme in THEMES ? j.theme : osLight
  } catch { return osLight }
}
// the Ripple outline is sampled at this many points per frame: kept outside the frame loop so nothing is allocated while it runs
const RIPPLE_SEG = 360
const RX = new Float32Array(RIPPLE_SEG + 1), RY = new Float32Array(RIPPLE_SEG + 1), RG = new Float32Array(RIPPLE_SEG + 1)
const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const SoundIcon = ({ off }: { off: boolean }) => (
  <svg {...iconProps}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    {off ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <><path d="M15.5 9a4 4 0 010 6" /><path d="M18 6.5a8 8 0 010 11" opacity=".6" /></>}
  </svg>
)
const vIcon = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
// the Ripple shape from the canvas, simplified for 16px: a ring with eight even crests
const RIPPLE_ICON = Array.from({ length: 193 }, (_, k) => {
  const th = (k / 192) * Math.PI * 2, r = 8.2 + 1.1 * Math.cos(th * 8)
  return `${k ? 'L' : 'M'}${(12 + Math.cos(th) * r).toFixed(2)} ${(12 + Math.sin(th) * r).toFixed(2)}`
}).join('') + 'Z'
const VOICE_ICONS: Record<Voice, React.ReactElement> = {
  bowl: <svg {...vIcon}><path d="M4 10h16a8 8 0 0 1-16 0z" /><path d="M9 21h6" opacity=".6" /></svg>,
  kalimba: <svg {...vIcon}><path d="M8 4.5v6.5M12 3v8M16 6v5" /><rect x="4.5" y="11" width="15" height="9.5" rx="3" /><circle cx="12" cy="15.8" r="1.1" fill="currentColor" stroke="none" /></svg>,
  marimba: <svg {...vIcon}><rect x="3" y="4" width="18" height="4" rx="2" /><rect x="5" y="10" width="14" height="4" rx="2" /><rect x="7" y="16" width="10" height="4" rx="2" /></svg>,
  drops: <svg {...vIcon} fill="currentColor" stroke="none">{Array.from({ length: 9 }, (_, i) => <circle key={i} cx={(12 + Math.cos((i / 9) * Math.PI * 2 - Math.PI / 2) * 7.6).toFixed(2)} cy={(12 + Math.sin((i / 9) * Math.PI * 2 - Math.PI / 2) * 7.6).toFixed(2)} r="2" />)}</svg>,
  ripple: <svg {...vIcon}><path d={RIPPLE_ICON} /></svg>,
}
const PanelIcon = () => <svg {...iconProps}><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M3.5 13.5h17" /><path d="M8 16.5h8" opacity=".6" /></svg>
const LookIcon = () => <svg {...iconProps}><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.1-.4-1.2.3-2.4 1.6-2.4H17a3.5 3.5 0 0 0 3.5-3.6C20.5 7.2 16.8 3.5 12 3.5z" /><circle cx="7.8" cy="11.2" r=".9" fill="currentColor" stroke="none" /><circle cx="10.4" cy="7.4" r=".9" fill="currentColor" stroke="none" /><circle cx="14.8" cy="7.6" r=".9" fill="currentColor" stroke="none" /></svg>
const LAYER_ICONS: Record<LayerName, React.ReactElement> = {
  pad: <svg {...iconProps}><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></svg>,
  sub: <svg {...iconProps}><rect x="6" y="3" width="12" height="18" rx="3.2" /><circle cx="12" cy="14.5" r="3.6" /><circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none" /></svg>,
  vinyl: <svg {...iconProps}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.4" /><path d="M7.2 8.2a6 6 0 0 1 4-2.4" opacity=".6" /></svg>,
}
const iconBtn = (on: boolean): React.CSSProperties => ({
  width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, borderRadius: 22, color: 'var(--ink)',
  background: on ? 'var(--pressed)' : 'transparent', transition: 'background .15s ease-out, scale .15s ease-out, opacity .5s',
})
const CSS = `
.sp-spin{position:absolute;inset:0}
.sp-spin:focus{outline:none}
.sp-spin:focus-visible{outline:2px solid var(--ink);outline-offset:-4px}
.sp-btn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
fieldset.sp-fs{border:0;margin:0;padding:0;min-width:0}
.sp-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;padding:0}
.sp-pills{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
.sp-pill{position:relative;display:block;cursor:pointer}
.sp-pill::after{content:'';position:absolute;inset:-4px} /* 36px pill, 44px touch target */
.sp-pill input{position:absolute;opacity:0;width:1px;height:1px}
.sp-pill span{display:flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:999px;font-size:13px;letter-spacing:.3px;text-transform:capitalize;color:var(--pillt);background:var(--pill);border:1px solid var(--pillb);transition:background .15s ease-out,color .15s ease-out,border-color .15s ease-out,scale .15s ease-out}
.sp-pill input:checked + span{background:var(--accent);color:var(--onaccent);border-color:transparent}
.sp-pill.sw span{padding:0;width:36px;justify-content:center;background:transparent}
.sp-pill.sw input:checked + span{background:transparent;border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)}
.sp-pill svg{flex:none}
.sp-sw{width:20px;height:20px;border-radius:50%;display:block}
.sp-pill input:focus-visible + span{outline:2px solid var(--ink);outline-offset:2px}
.sp-cap{height:14px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--pillt);white-space:nowrap}
.sp-insrow{position:relative;display:flex;gap:8px}
.sp-ins{position:relative;display:block;width:44px;height:44px;cursor:pointer}
.sp-ins input{position:absolute;opacity:0;width:1px;height:1px}
.sp-ins .ic{position:relative;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;color:var(--pillt);transition:color .15s ease-out,background .15s ease-out,scale .15s ease-out}
.sp-ins svg{width:20px;height:20px}
.sp-ins input:checked + .ic{color:var(--onvc,var(--onaccent));background:var(--vc,var(--accent))}
.sp-ins:active .ic{scale:.96}
.sp-ins input:focus-visible + .ic{outline:2px solid var(--ink);outline-offset:2px}
.sp-lay{position:relative;width:44px;height:44px;padding:0;border-radius:50%;border:1px solid var(--pillb);background:var(--pill);color:var(--pillt);display:grid;place-items:center;touch-action:none;cursor:pointer;transition:background .15s ease-out,color .15s ease-out,scale .15s ease-out}
.sp-lay[aria-checked=true]{color:var(--ink);background:var(--pressed)}
.sp-lay svg.ic{width:20px;height:20px}
.sp-lay svg.ring{position:absolute;left:-1px;top:-1px;width:44px;height:44px;pointer-events:none;transform:rotate(-90deg)}
.sp-lay:active{scale:.96}
.sp-lay:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.sp-row{display:flex;align-items:center;justify-content:center;gap:8px}
.sp-rowl{width:52px;flex:none;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--pillt)}
.sp-pill:active span,.sp-btn:active{scale:.96}
.sp-root[data-switching] *,.sp-root[data-switching] *::before{transition:none !important}
/* reduced motion: nothing slides or scales, but colour and opacity still cross-fade, so every change of state stays visible */
@media (prefers-reduced-motion: reduce){
  .sp-dock{transform:none !important;transition:opacity .2s linear,visibility 0s linear .2s !important}
  .sp-pill:active span,.sp-btn:active,.sp-lay:active,.sp-ins:active .ic{scale:1}
}
`

type Layer = { out: GainNode; mod?: GainNode; stop: () => void } // a running background layer
// a few seconds of loopable noise; `smooth` low-passes it (small = darker, 1 = white)
const noiseBuffer = (ctx: AudioContext, smooth: number, level: number, seconds: number) => {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = buf.getChannelData(0); let y = 0
  for (let i = 0; i < d.length; i++) { y += smooth * ((Math.random() * 2 - 1) - y); d[i] = y * level }
  return buf
}

export default function Spin() {
  const wrap = useRef<HTMLDivElement>(null)
  const cvs = useRef<HTMLCanvasElement>(null)
  const audio = useRef<AudioBits | null>(null)
  const knockBuf = useRef<AudioBuffer | null>(null) // a tenth of a second of white noise for the mallet knock, made on first use
  const live = useRef<number[]>([]) // when the notes still ringing will end (audio clock seconds)
  const [muted, setMuted] = useState(false)
  const [touched, setTouched] = useState(false)
  const [active, setActive] = useState<Voice[]>(readRings) // the instruments on the screen, biggest ring first
  const [padOn, setPadOn] = useState(false)
  const [subOn, setSubOn] = useState(false)
  const [vinylOn, setVinylOn] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [pokeTick, setPokeTick] = useState(0)
  const [themeId, setThemeId] = useState<ThemeId>(readLook) // restored from the last visit
  const [lookOpen, setLookOpen] = useState(false)
  const levelsRef = useRef<Record<LayerName, number>>(readLevels())
  const [levels, setLevels] = useState(levelsRef.current)
  const [caption, setCaption] = useState<string | null>(null) // what the line above the dock says while you're touching a layer
  const captionTimer = useRef(0)
  const drag = useRef<{ name: LayerName; y0: number; lvl0: number; moved: boolean } | null>(null)
  const [dockOpen, setDockOpen] = useState(true) // show or hide the instrument, layer and look controls
  const theme: Theme = THEMES[themeId]
  const reduceRef = useRef(false) // prefers-reduced-motion
  const padRef = useRef<{ gain: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null>(null)
  const subRef = useRef<Layer | null>(null)
  const vinylRef = useRef<Layer | null>(null)

  const sRef = useRef<SpinState | null>(null)
  if (!sRef.current) sRef.current = { rings: [...active].sort((x, y) => RING_ORDER.indexOf(x) - RING_ORDER.indexOf(y)).map((v) => ({ ...newRing(v, 0.15), alpha: 1 })), th: THEMES.mono as Theme, fbT: -1, muted: false, cyFrac: 0.44, W: 0, H: 0 }
  const s = sRef as { current: SpinState }

  s.current.th = theme // the canvas reads the look from here
  useEffect(() => { // the page behind the column and the browser bar take the palette's colour
    const html = document.documentElement
    html.classList.add('spin-active'); html.style.setProperty('--bg', theme.bg)
    const meta = document.querySelector('meta[name="theme-color"]'), prevMeta = meta?.getAttribute('content') ?? null
    meta?.setAttribute('content', theme.bg)
    // an installed iPhone app draws its status bar over the page: light text suits Mono, dark text suits Chalk (iOS may apply a change on the next launch)
    const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'), prevBar = bar?.getAttribute('content') ?? null
    bar?.setAttribute('content', themeId === 'chalk' ? 'default' : 'black-translucent')
    return () => {
      html.classList.remove('spin-active'); html.style.removeProperty('--bg')
      if (meta && prevMeta !== null) meta.setAttribute('content', prevMeta)
      if (bar && prevBar !== null) bar.setAttribute('content', prevBar)
    }
  }, [theme.bg, themeId])

  useEffect(() => {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify({ theme: themeId })) } catch { /* private mode */ }
  }, [themeId])

  const say = (text: string) => { // show a short note above the dock, and put the instrument's name back a moment later
    setCaption(text); clearTimeout(captionTimer.current); captionTimer.current = window.setTimeout(() => setCaption(null), 900)
  }
  const setLevel = (name: LayerName, v: number) => {
    const lv = Math.max(0, Math.min(1, v))
    levelsRef.current = { ...levelsRef.current, [name]: lv }; setLevels(levelsRef.current)
    const a = audio.current
    if (a) a.bus[name].gain.setTargetAtTime(lv / DEFAULT_LEVEL, a.ctx.currentTime, 0.05)
    try { localStorage.setItem(LEVELS_KEY, JSON.stringify(levelsRef.current)) } catch { /* private mode */ }
  }

  const ensureAudio = () => {
    if (audio.current) {
      if (audio.current.ctx.state !== 'running') void audio.current.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const master = ctx.createGain(); master.gain.value = 0.9
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.3
    const fb = ctx.createGain(); fb.gain.value = 0.1
    const wet = ctx.createGain(); wet.gain.value = 0.38
    master.connect(ctx.destination)
    master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination)
    const bus = {} as Record<LayerName, GainNode>
    for (const n of LAYERS) { const g = ctx.createGain(); g.gain.value = levelsRef.current[n] / DEFAULT_LEVEL; g.connect(master); bus[n] = g }
    audio.current = { ctx, master, fb, bus }
    const blip = ctx.createBufferSource(); blip.buffer = ctx.createBuffer(1, 1, 22050); blip.connect(ctx.destination); blip.start(0) // a silent blip: the usual trick to unlock iOS audio
    void ctx.resume()
  }

  const note = (tick: number, ring: Ring) => {
    const a = audio.current
    if (!a || s.current.muted) return
    if (a.ctx.state !== 'running') void a.ctx.resume()
    const t = a.ctx.currentTime
    const d = ((tick % 15) + 15) % 15
    // with several rings, each instrument sits in its own band (Bowl lowest, Ripple highest), moved in whole scale steps so every ring stays in key
    const shown = s.current.rings.filter((r) => !r.leaving), K = shown.length, k = shown.indexOf(ring)
    // by ring size (k = 0 is the biggest ring) or by instrument, depending on Pitch order
    const bySize = K > 1 && k >= 0 ? (0.5 - k / (K - 1)) * 10 * (TUNE.bandMode === 2 ? -1 : 1) : 0
    const shift = K > 1 && ring.voice !== 'drops' ? Math.round((TUNE.bandMode === 0 ? VOICE_BAND[ring.voice] : bySize) * TUNE.voiceBand) : 0
    const thin = 1 - TUNE.echoThin * Math.min(1, (K - 1) / 2) // tails shorten as more rings join
    if (K > 1) { // polyphony cap: when too many notes are still ringing, the newest is skipped
      live.current = live.current.filter((e) => e > t)
      if (live.current.length >= TUNE.maxNotes) return
      live.current.push(t + { bowl: 3.4, kalimba: 0.9, marimba: 0.55, ripple: 0.9, drops: TUNE.dropDecay }[ring.voice] * thin)
    } else live.current.length = 0
    const bassDeg = [0, 3, 0, 2, 3] // the bass leans on the root and the fifth, so it grounds the others instead of wandering
    const dd = ring.voice === 'drops' ? bassDeg[d % 5] : d + shift
    const f = 196 * 2 ** ((SCALE[((dd % 5) + 5) % 5] + 12 * Math.floor(dd / 5)) / 12)
    const src = soundSource(tick, ring)
    let out: AudioNode = a.master
    // Drops and Ripple sit where their shape is; with several rings every ring also takes its own side (alternating), and each note is trimmed so a crowd doesn't pile up
    const own = K > 1 && k >= 0 ? (k % 2 ? 1 : -1) * TUNE.ringPan : 0
    const placed = ring.voice === 'drops' || ring.voice === 'ripple'
    if ((placed || own !== 0) && a.ctx.createStereoPanner) {
      const pn = a.ctx.createStereoPanner(); pn.pan.value = clampPan((placed ? src.pan * TUNE.panAmount : 0) + own); pn.connect(a.master); out = pn
    }
    if (K > 1) { const trim = a.ctx.createGain(); trim.gain.value = K ** -TUNE.crowd; trim.connect(out); out = trim }
    // one partial: oscillator through an attack/decay envelope into the master bus
    const mk = (type: OscillatorType, freq: number, peak: number, attack: number, decay: number, glideTo?: number, at = 0, dest: AudioNode = out) => {
      const o = a.ctx.createOscillator(), g = a.ctx.createGain(), t0 = t + at
      o.type = type; o.frequency.setValueAtTime(freq, t0)
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + 0.09)
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(peak, t0 + attack)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
      o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + attack + decay + 0.05)
    }
    switch (ring.voice) {
      case 'bowl': // inharmonic partials that decay at different rates = a shimmering, beating tail
        { // next to other rings it becomes the bed: softer, slower to bloom, with less of the bright top
          const bed = K > 1 ? TUNE.bowlBed : 1, at = K > 1 ? 0.01 + 0.07 * (1 - TUNE.bowlBed) / 0.7 : 0.01
          mk('sine', f, 0.12 * bed, at, 3.4 * thin); mk('sine', f * 1.003, 0.06 * bed, at, 3.4 * thin)
          mk('sine', f * 2.76, 0.04 * bed * bed, at, 1.8 * thin); mk('sine', f * 5.4, 0.016 * bed * bed, at, 0.9 * thin)
        }
        break
      case 'kalimba': // short plucked attack with a metallic tick on top
        mk('triangle', f * 2, 0.15, 0.003, 0.9); mk('sine', f * 2 * 5.4, 0.03, 0.002, 0.12)
        break
      case 'marimba': { // a dry wooden bar: a short bar tone with its 4x overtone, and a tiny filtered knock of the mallet. No ring-out, so it stays out of the way of the longer voices
        mk('sine', f, 0.2, 0.003, 0.4); mk('sine', f * 4, 0.06, 0.002, 0.09)
        const kb = knockBuf.current ??= noiseBuffer(a.ctx, 1, 1, 0.1)
        const kn = a.ctx.createBufferSource(); kn.buffer = kb
        const kf = a.ctx.createBiquadFilter(); kf.type = 'bandpass'; kf.frequency.value = Math.min(f * 3, 4000); kf.Q.value = 1.4
        const kg = a.ctx.createGain(); kg.gain.setValueAtTime(0.09, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035)
        kn.connect(kf); kf.connect(kg); kg.connect(out); kn.start(t); kn.stop(t + 0.05)
        break
      }
      case 'ripple': { // a steel tongue drum: a round, resonant tone that settles from a hair sharp, with a soft octave and twelfth, then one quiet echo a touch lower
        const amp = 0.2, dec = 0.62 * thin * 1.6 // Ripple keeps its own ring time, so the Drop decay slider only shapes the bass
        mk('sine', f * 1.012, amp * 1.1, 0.003, dec, f)
        mk('sine', f * 1.016, amp * 0.55, 0.003, dec * 1.15, f * 1.004) // a slightly detuned twin: the slow beating is what makes it ring and keeps it apart from the dry Marimba
        mk('sine', f * 2.01, amp * 0.4, 0.002, dec * 0.5); mk('sine', f * 3.02, amp * 0.16, 0.002, dec * 0.25)
        RIPPLE_ECHOES.forEach(([delay, level]) => mk('sine', f * 0.994, amp * level, 0.02, dec * 0.4, undefined, delay))
        break
      }
      case 'drops': { // a warm plucked bass: a round low tone with a soft triangle body that darkens as it settles, plus its octave and fifth so a phone speaker can carry the pitch
        const amp = 0.2, dec = TUNE.dropDecay * thin * 1.8, fb = f * 0.5
        const lp = a.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8
        lp.frequency.setValueAtTime(fb * 7, t); lp.frequency.exponentialRampToValueAtTime(fb * 1.6, t + 0.22); lp.connect(out)
        mk('sine', fb, amp * 1.5, 0.012, dec)
        mk('triangle', fb, amp * 0.9, 0.008, dec * 0.7, undefined, 0, lp)
        mk('sine', fb * 2, amp * 0.5, 0.01, dec * 0.5)
        mk('sine', fb * 3, amp * 0.18, 0.006, dec * 0.22)
        break
      }
    }
  }

  // where the dot (Drops) or crest (Ripple) that is sounding is on screen: the sound pans to its x and, for a faint dot, plays quieter
  const soundSource = (tick: number, ring: Ring) => {
    const st = s.current, N = ring.n, i = ((tick % N) + N) % N, half = st.W / 2 || 1
    if (ring.voice === 'ripple') return { pan: clampPan((Math.cos(ring.rot + i * ring.step) * ring.R) / (half * 0.5)), vis: 1 }
    if (ring.voice === 'drops') return { pan: clampPan((Math.cos(ring.rot + i * ring.step) * ring.R) / (half * 0.5)), vis: 1 } // the Bass is a ring of beads
    return { pan: 0, vis: 1 }
  }

  // notes thin out as the ring speeds up, so a fast spin flows instead of machine-gunning
  // with several rings each instrument runs a touch faster or slower than the rest, so their notes interlock instead of landing together
  const noteGap = (ring: Ring) => {
    const gap = TUNE.gapMin + Math.min(Math.abs(ring.w) * TUNE.gapPerSpeed, TUNE.gapSpread)
    return s.current.rings.filter((r) => !r.leaving).length > 1 ? gap * (1 + (VOICE_GAP[ring.voice] - 1) * TUNE.stagger) : gap
  }

  const setPad = (on: boolean) => {
    const a = audio.current
    if (!a) return
    const t = a.ctx.currentTime
    if (on && !padRef.current) {
      const gain = a.ctx.createGain(); gain.gain.value = 0
      const lp = a.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.4
      const lfo = a.ctx.createOscillator(); lfo.frequency.value = 0.07
      const lg = a.ctx.createGain(); lg.gain.value = 260
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start()
      const oscs = [98, 147, 196.6, 294.5].map((fr, i) => {
        const o = a.ctx.createOscillator()
        o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = fr; o.detune.value = (i - 1.5) * 4
        o.connect(lp); o.start(); return o
      })
      lp.connect(gain); gain.connect(a.bus.pad)
      gain.gain.setTargetAtTime(0.06, t, 1.5)
      padRef.current = { gain, oscs, lfo }
    } else if (!on && padRef.current) {
      const p = padRef.current; padRef.current = null
      p.gain.gain.setTargetAtTime(0, t, 0.8)
      setTimeout(() => { p.oscs.forEach((o) => o.stop()); p.lfo.stop(); p.gain.disconnect() }, 4000)
    }
  }

  // Sub hum: a very low tone with a slow beat, plus a couple of overtones so phone speakers can carry it
  const setSub = (on: boolean) => {
    const a = audio.current
    if (!a) return
    const t = a.ctx.currentTime
    if (on && !subRef.current) {
      const lp = a.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260
      const trem = a.ctx.createGain(); trem.gain.value = 0.85
      const lfo = a.ctx.createOscillator(); lfo.frequency.value = 0.17
      const lg = a.ctx.createGain(); lg.gain.value = 0.15
      lfo.connect(lg); lg.connect(trem.gain)
      const oscs = ([[55, 1], [55.5, 0.9], [110, 0.5], [165, 0.2]] as const).map(([f, lv]) => {
        const o = a.ctx.createOscillator(), g = a.ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.value = lv
        o.connect(g); g.connect(lp); o.start(); return o
      })
      const out = a.ctx.createGain(); out.gain.value = 0
      lp.connect(trem); trem.connect(out); out.connect(a.bus.sub); lfo.start(); out.gain.setTargetAtTime(0.14, t, 1.5)
      subRef.current = { out, stop: () => { oscs.forEach((o) => o.stop()); lfo.stop(); out.disconnect() } }
    } else if (!on && subRef.current) {
      const o = subRef.current; subRef.current = null
      o.out.gain.setTargetAtTime(0, t, 0.8); setTimeout(o.stop, 4000)
    }
  }

  // Vinyl: a faint hiss with random crackle and the odd bigger pop
  const setVinyl = (on: boolean) => {
    const a = audio.current
    if (!a) return
    const t = a.ctx.currentTime
    if (on && !vinylRef.current) {
      const out = a.ctx.createGain(); out.gain.value = 0
      const hiss = a.ctx.createBufferSource(); hiss.buffer = noiseBuffer(a.ctx, 1, 0.5, 3); hiss.loop = true
      const hp = a.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200
      const hg = a.ctx.createGain(); hg.gain.value = 0.012
      hiss.connect(hp); hp.connect(hg); hg.connect(out); hiss.start()
      const sr = a.ctx.sampleRate, click = a.ctx.createBuffer(1, Math.floor(sr * 0.014), sr), cd = click.getChannelData(0)
      for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0018)) // a tiny decaying burst = one crackle
      out.connect(a.bus.vinyl); out.gain.setTargetAtTime(1, t, 1)
      let timer = 0, alive = true
      const crackle = () => {
        if (!alive) return
        const c = a.ctx.createBufferSource(), g = a.ctx.createGain(); c.buffer = click; c.playbackRate.value = 0.6 + Math.random() * 1.6
        g.gain.value = Math.random() < 0.12 ? 0.2 + Math.random() * 0.2 : 0.015 + Math.random() * 0.07
        c.connect(g); g.connect(out); c.start()
        timer = window.setTimeout(crackle, Math.random() < 0.25 ? 20 + Math.random() * 50 : 90 + Math.random() * 650) // sometimes a quick cluster
      }
      crackle()
      vinylRef.current = { out, stop: () => { alive = false; clearTimeout(timer); hiss.stop(); out.disconnect() } }
    } else if (!on && vinylRef.current) {
      const o = vinylRef.current; vinylRef.current = null
      o.out.gain.setTargetAtTime(0, t, 0.4); setTimeout(o.stop, 2000)
    }
  }

  useEffect(() => { // controls dim (never hide) after a few quiet seconds, so they stay reachable while you play
    setChrome(true)
    const t = window.setTimeout(() => setChrome(false), 4000)
    return () => clearTimeout(t)
  }, [pokeTick])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)'), on = () => { reduceRef.current = mq.matches }
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useEffect(() => { // iOS only unlocks audio on a touch release or click, not on touch down: so wake it on every one of those, anywhere
    const unlock = () => ensureAudio()
    const evs = ['touchend', 'click', 'pointerup', 'keydown'] as const
    evs.forEach((e) => window.addEventListener(e, unlock, { passive: true }))
    const vis = () => { if (!document.hidden) ensureAudio() } // and when you come back to the tab or unlock the phone
    document.addEventListener('visibilitychange', vis)
    return () => { evs.forEach((e) => window.removeEventListener(e, unlock)); document.removeEventListener('visibilitychange', vis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => { // leaving the route must stop all sound
    const a = audio.current
    audio.current = null; padRef.current = null
    vinylRef.current?.stop(); vinylRef.current = null; subRef.current = null
    if (a) void a.ctx.close()
  }, [])

  useEffect(() => {
    const st = s.current
    const canvas = cvs.current!, box = wrap.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, last = performance.now()

    const frame = () => {
      const now = performance.now() // one clock everywhere (rAF's timestamp can lag event times in Safari)
      const dt = Math.min((now - last) / 1000, 0.04); last = now
      const W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr; canvas.height = H * dpr; st.W = W; st.H = H
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = st.th.bg; ctx.fillRect(0, 0, W, H)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const th = st.th
      const cx = W / 2, cy = H * st.cyFrac
      const base = Math.min(Math.min(W, H) * 0.25, Math.max((H - 160) * 0.3, 40)) // on a short (landscape) screen the ring shrinks so it stays clear of the controls
      st.rings = st.rings.filter((r) => !(r.leaving && r.alpha < 0.01)) // a ring that has finished fading out is gone
      const rings = st.rings
      const shown = rings.filter((r) => !r.leaving)
      const K = shown.length
      // ---- layout: one instrument is the classic ring; several nest from the biggest (first in the dock) to the smallest
      const rTop = K > 1 ? Math.max(Math.min(base * 1.75, W / 2 - 24, cy - 64, H - 170 - cy), 70) : base
      const rMin = Math.min(52, rTop * 0.55)
      let fastest = 0
      for (const r of rings) {
        const k = shown.indexOf(r)
        if (k >= 0) { const target = K > 1 ? rTop - (k * (rTop - rMin)) / (K - 1) : base; r.R = r.R ? r.R + (target - r.R) * Math.min(1, dt * 9) : target }
        r.alpha += ((r.leaving ? 0 : 1) - r.alpha) * Math.min(1, dt * 8)

        // ---- physics, per ring
        const prevRot = r.rot
        if (!r.dragging) {
          r.w *= Math.exp(-TUNE.decay * dt) // a long, soft decay
          const floor = reduceRef.current ? Math.min(0.03, TUNE.drift) : TUNE.drift // the idle drift: almost still when motion is reduced
          if (Math.abs(r.w) < floor) r.w = floor * (r.w < 0 ? -1 : 1) // never fully stops
          r.rot += r.w * dt
        }
        // a Bowl on the outside of a stack gets more crescents, since its ring is the longest
        r.n = r.voice === 'bowl' && K > 1 && r === rings.find((x) => !x.leaving) ? Math.max(DOTS, Math.round(TUNE.bowlDots)) : DOTS
        r.step = (Math.PI * 2) / r.n
        const N = r.n, a0 = Math.floor(prevRot / r.step), a1 = Math.floor(r.rot / r.step)
        if (a1 !== a0) {
          const crossed = Math.min(Math.abs(a1 - a0), N)
          const dir = a1 > a0 ? 1 : -1
          for (let j = 1; j <= crossed; j++) trigger(r, ((a0 + dir * j) % N + N) % N)
          if (!r.leaving && now - r.lastNote > noteGap(r)) { r.lastNote = now; note(a1, r); if (TUNE.haptic) navigator.vibrate?.(TUNE.haptic) }
        }
        for (let i = 0; i < r.pulse.length; i++) r.pulse[i] = Math.max(0, r.pulse[i] - dt * (r.voice === 'ripple' ? 1 / RIPPLE_LIFE : 1.6))
        if (r.voice !== 'ripple') stepPops(r, dt)
        fastest = Math.max(fastest, Math.abs(r.w))
      }

      // ---- draw: flat and matte, solid fills only (no glow, blur, gradients or trails)
      ctx.fillStyle = th.bg
      ctx.fillRect(0, 0, W, H)
      const bf = 1 // the rings hold their size: no idle swell
      const an = audio.current
      // the echo shortens as the spinners slow: a lively tail while one spins, and only a repeat or two once they are nearly stopped
      if (an) { // only schedule a change when the target has moved: one automation event per frame piles up on the audio thread
        const fbT = TUNE.echoMin + TUNE.echoSpan * Math.min(fastest / 8, 1)
        if (Math.abs(fbT - st.fbT) > 0.004) { st.fbT = fbT; an.fb.gain.setTargetAtTime(fbT, an.ctx.currentTime, 0.2) }
      }

      const outer = shown[0]
      if (outer) { // slow dust rings around the biggest ring, counter-rotating
        for (let k = 1; k <= 3; k++) {
          const rk = outer.R * bf * (1 + 0.42 * k), n = 14 + k * 8
          const rot = outer.rot * (k % 2 ? -0.35 : 0.2) / k
          ctx.fillStyle = th.dust[k - 1]
          for (let i = 0; i < n; i++) {
            const ang = rot + (i / n) * Math.PI * 2
            ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rk, cy + Math.sin(ang) * rk, 1.7, 0, Math.PI * 2); ctx.fill()
          }
        }
      }

      const r0 = dotSize(DOTS)
      for (const rg of rings) {
        const R = rg.R * bf, ra = rg.alpha, N = rg.n, ripple = rg.voice === 'ripple'
        const accent = th.accents[rg.voice]
        // no guide line behind any of the shapes: the dots alone make the ring (Ripple's rippled line is the shape itself)

        // one dot in this instrument's shape, centred at (x, y) and pointing outward along `ang`
        const drawDot = (x: number, y: number, ang: number, r: number, color: string, alpha: number, deg = -1) => {
          const m = deg < 0 ? 1 : KEYS[deg] // the five scale degrees repeat round the ring, so a graduated length or size repeats with them, like the keys of the real instrument
          const ca = Math.cos(ang), sa = Math.sin(ang)
          ctx.globalAlpha = alpha * ra; ctx.fillStyle = color; ctx.strokeStyle = color
          ctx.beginPath()
          switch (rg.voice) { // every instrument has its own shape
            case 'kalimba': // thin, long tines
              ctx.moveTo(x - ca * r * 2.5 * m, y - sa * r * 2.5 * m); ctx.lineTo(x + ca * r * 2.5 * m, y + sa * r * 2.5 * m)
              ctx.lineWidth = Math.max(1.6, r * 0.62); ctx.lineCap = 'round'; ctx.stroke(); break
            case 'marimba': // thick, shorter bars
              ctx.moveTo(x - ca * r * 1.5 * m, y - sa * r * 1.5 * m); ctx.lineTo(x + ca * r * 1.5 * m, y + sa * r * 1.5 * m)
              ctx.lineWidth = r * 1.4; ctx.lineCap = 'round'; ctx.stroke(); break
            case 'bowl': { // a slim crescent: the profile of a singing bowl, drawn as one fine curved sliver with pointed tips
              const Rb = r * 1.55 * (deg < 0 ? 1 : 0.88 + 0.12 * m), tx = -sa, ty = ca
              const cxb = x - ca * Rb * 0.2, cyb = y - sa * Rb * 0.2 // sits just outside the middle of the ring
              const t1x = cxb + tx * Rb * 0.95, t1y = cyb + ty * Rb * 0.95, t2x = cxb - tx * Rb * 0.95, t2y = cyb - ty * Rb * 0.95
              ctx.moveTo(t1x, t1y)
              ctx.quadraticCurveTo(cxb + ca * Rb * 1.7, cyb + sa * Rb * 1.7, t2x, t2y) // the outer curve, deep
              ctx.quadraticCurveTo(cxb + ca * Rb * 0.6, cyb + sa * Rb * 0.6, t1x, t1y) // the inner curve, shallower: what is left between them is the sliver
              ctx.closePath(); ctx.fill(); break
            }
            default: ctx.arc(x, y, r * 1.15 * (deg < 0 ? 1 : 0.7 + 0.5 * (m - 0.6) / 0.55), 0, Math.PI * 2); ctx.fill() // bass: plain round beads, a little bigger on the first degree
          }
          ctx.globalAlpha = 1
        }
        if (ripple) { // the whole ring is a rippled line: one ripple per detent, and the ripple that just sounded is the biggest
          const amp: number[] = [], glow: number[] = []
          for (let i = 0; i < N; i++) {
            const p = rg.pulse[i], t = (1 - p) * RIPPLE_LIFE // seconds since this ripple's note played
            const sounding = p > 0.002
            const ease = Math.min(1, p / 0.12) // eases the whole ripple out at the very end, so it never snaps flat
            // the pluck's swell plus the swells of its three echoes, at the same delays and levels as the sound
            const swell = sounding ? ease * (rippleRise(t) + RIPPLE_ECHOES.reduce((sum, [d, lv]) => sum + lv * rippleRise(t - d), 0)) : 0
            const wob = sounding && !reduceRef.current ? 1 + 0.3 * Math.exp(-t * 3) * Math.sin(t * Math.PI * 2 * 6) : 1
            amp[i] = r0 * 0.3 + r0 * 2.6 * swell * wob // every ripple is faintly there; the sounding one swells
            glow[i] = sounding ? ease * Math.exp(-t * 4.5) * (1 - Math.exp(-t * 45)) : 0
          }
          const SEG = RIPPLE_SEG
          for (let k = 0; k <= SEG; k++) {
            const th0 = (k / SEG) * Math.PI * 2, u = (th0 - rg.rot) / rg.step // position in ripple units: whole numbers are the dot positions
            const fl = Math.floor(u), f = u - fl, ia = ((fl % N) + N) % N, ib = (ia + 1) % N, sm = f * f * (3 - 2 * f)
            const A = amp[ia] * (1 - sm) + amp[ib] * sm
            const rad = R + A * Math.cos(u * Math.PI * 2) // a crest at every dot position
            RX[k] = cx + Math.cos(th0) * rad; RY[k] = cy + Math.sin(th0) * rad; RG[k] = Math.max(glow[((Math.round(u) % N) + N) % N], 0)
          }
          ctx.beginPath(); ctx.moveTo(RX[0], RY[0])
          for (let k = 1; k <= SEG; k++) ctx.lineTo(RX[k], RY[k])
          ctx.globalAlpha = ra; ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1
          for (let k = 1; k <= SEG; k++) { // the ripple that just sounded lights up
            const g = (RG[k] + RG[k - 1]) / 2
            if (g > 0.03) { ctx.beginPath(); ctx.moveTo(RX[k - 1], RY[k - 1]); ctx.lineTo(RX[k], RY[k]); ctx.strokeStyle = accent; ctx.lineWidth = 2.4; ctx.globalAlpha = g * ra; ctx.stroke(); ctx.globalAlpha = 1 }
          }
        }
        for (let i = 0; i < (ripple ? 0 : N); i++) {
          const p = rg.pop[i] // a spring: 0 at rest, about 1 at the top of the pop, and a touch below 0 if it overshoots
          const ang = rg.rot + i * rg.step
          const r = r0 * (1 + p * (reduceRef.current ? Math.min(TUNE.popSize, 0.15) : TUNE.popSize))
          const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R
          const tilt = rg.voice === 'marimba' || rg.voice === 'bowl' || reduceRef.current ? 0 : p * TUNE.popTilt * (i % 2 ? 1 : -1) // a passing detent also tips the shape a little, one way then the other (the Marimba bars and Bowl crescents only grow)
          drawDot(x, y, ang + tilt, r, accent, 1, i % 5)
        }
      }
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = th.hub; ctx.fill()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pointerAngle = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect()
    return Math.atan2(e.clientY - (r.top + s.current.H * s.current.cyFrac), e.clientX - (r.left + s.current.W / 2))
  }
  // which ring a touch belongs to: the one whose edge is nearest to where the finger landed (a lone ring takes a touch anywhere)
  const pickRing = (e: React.PointerEvent): Ring | null => {
    const st = s.current, box = wrap.current!.getBoundingClientRect()
    const dist = Math.hypot(e.clientX - (box.left + st.W / 2), e.clientY - (box.top + st.H * st.cyFrac))
    let best: Ring | null = null, bd = Infinity
    for (const rg of st.rings) {
      if (rg.leaving) continue
      const d = Math.abs(dist - rg.R)
      if (d < bd) { bd = d; best = rg }
    }
    return best
  }
  const down = (e: React.PointerEvent) => {
    ensureAudio(); setTouched(true); setPokeTick((n) => n + 1)
    const rg = pickRing(e)
    if (!rg || rg.dragging) return // a second finger on a ring that is already held never takes it over; another ring can be held at the same time
    wrap.current!.setPointerCapture(e.pointerId)
    rg.pid = e.pointerId
    rg.dragging = true; rg.lastA = pointerAngle(e); rg.lastT = performance.now()
  }
  const move = (e: React.PointerEvent) => {
    const rg = s.current.rings.find((r) => r.dragging && r.pid === e.pointerId)
    if (!rg) return
    const a = pointerAngle(e), now = performance.now()
    const d = wrapAngle(a - rg.lastA), dt = Math.max((now - rg.lastT) / 1000, 0.001)
    const prev = rg.rot
    rg.rot += d
    rg.w = rg.w * (1 - TUNE.flick) + (d / dt) * TUNE.flick // smoothed finger velocity becomes the flick
    rg.w = Math.max(-TUNE.maxW, Math.min(TUNE.maxW, rg.w))
    const N = rg.n, a0 = Math.floor(prev / rg.step), a1 = Math.floor(rg.rot / rg.step)
    if (a1 !== a0) {
      const dir = a1 > a0 ? 1 : -1
      for (let k = 1; k <= Math.min(Math.abs(a1 - a0), N); k++) trigger(rg, ((a0 + dir * k) % N + N) % N)
      if (now - rg.lastNote > noteGap(rg)) { rg.lastNote = now; note(a1, rg); if (TUNE.haptic) navigator.vibrate?.(TUNE.haptic) }
    }
    rg.lastA = a; rg.lastT = now
  }
  const up = (e: React.PointerEvent) => {
    const rg = s.current.rings.find((r) => r.dragging && r.pid === e.pointerId)
    if (!rg) return
    rg.dragging = false
    const now = performance.now()
    if (now - rg.lastT > TUNE.holdMs) rg.w *= 0.3 // held still before release: no flick
  }

  const toggleMute = () => {
    const m = !s.current.muted
    s.current.muted = m; setMuted(m)
    const a = audio.current
    if (a) a.master.gain.setTargetAtTime(m ? 0 : 0.9, a.ctx.currentTime, 0.1) // silences pad and noise too
  }

  const poke = () => setPokeTick((n) => n + 1)
  // an instrument icon puts its ring on the screen or takes it off (at least one stays); the rings re-nest by their order in the dock
  const toggleVoice = (v: Voice) => {
    ensureAudio(); setTouched(true)
    const on = active.includes(v)
    if (on && active.length === 1) { say('Keep one instrument'); return }
    const next = VOICES.filter((x) => (x === v ? !on : active.includes(x)))
    setActive(next)
    try { localStorage.setItem(RINGS_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    const rings = s.current.rings
    for (const x of VOICES) {
      const ex = rings.find((r) => r.voice === x)
      if (next.includes(x)) { if (ex) ex.leaving = false; else rings.push(newRing(x, 0.8)) }
      else if (ex) ex.leaving = true
    }
    rings.sort((a, b) => RING_ORDER.indexOf(a.voice) - RING_ORDER.indexOf(b.voice))
    if (!on) note(7, rings.find((r) => r.voice === v)!)
    say(`${VOICE_LABELS[v]} ${on ? 'off' : 'on'}`)
  }
  const layerOn: Record<LayerName, boolean> = { pad: padOn, sub: subOn, vinyl: vinylOn }
  const layerSet = (name: LayerName, on: boolean) => {
    ensureAudio(); setTouched(true)
    if (name === 'pad') { setPadOn(on); setPad(on) }
    else if (name === 'sub') { setSubOn(on); setSub(on) }
    else { setVinylOn(on); setVinyl(on) }
  }
  // a layer button: tap to switch it on or off; press and drag up or down to set its volume (a drag switches it on)
  const layerDown = (name: LayerName) => (e: React.PointerEvent) => {
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); poke()
    drag.current = { name, y0: e.clientY, lvl0: levelsRef.current[name], moved: false }
  }
  const layerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = d.y0 - e.clientY
    if (!d.moved && Math.abs(dy) > 8) { d.moved = true; if (!layerOn[d.name]) layerSet(d.name, true) }
    if (d.moved) { const lv = Math.max(0, Math.min(1, d.lvl0 + dy / 110)); setLevel(d.name, lv); say(`${LAYER_LABELS[d.name]} ${Math.round(lv * 100)}%`) }
  }
  const lastPtrUp = useRef(-1e9) // when a layer button last got a pointer release
  const layerUp = (name: LayerName) => () => {
    const d = drag.current; drag.current = null
    if (!d) return
    lastPtrUp.current = performance.now()
    if (!d.moved) { // a plain tap
      const on = !layerOn[name]
      if (on && levelsRef.current[name] < 0.05) setLevel(name, DEFAULT_LEVEL)
      layerSet(name, on); say(`${LAYER_LABELS[name]} ${on ? 'on' : 'off'}`)
    }
  }
  const layerKey = (name: LayerName) => (e: React.KeyboardEvent) => { // keyboard: arrow up and down change the volume
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault(); e.stopPropagation()
    const lv = Math.max(0, Math.min(1, levelsRef.current[name] + (e.key === 'ArrowUp' ? 0.1 : -0.1)))
    if (!layerOn[name]) layerSet(name, true)
    setLevel(name, lv); say(`${LAYER_LABELS[name]} ${Math.round(lv * 100)}%`)
  }
  // the controls slide up and fade in (250ms, ease-out) and leave a little faster (180ms): they've served their purpose
  const dockMotion = (dim: number, open: boolean): React.CSSProperties => open
    ? { opacity: chrome ? 1 : dim, transform: 'none', visibility: 'visible', transition: 'transform .25s cubic-bezier(.32,.72,0,1), opacity .25s ease-out' }
    : { opacity: 0, transform: 'translateY(14px)', visibility: 'hidden', pointerEvents: 'none', transition: 'transform .18s ease-in, opacity .18s ease-out, visibility 0s linear .18s' }
  const switchTheme = (id: ThemeId) => { // a theme switch shouldn't fire every colour transition on the page
    const el = wrap.current
    if (el) { el.dataset.switching = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { delete el.dataset.switching })) }
    setThemeId(id)
  }
  const stop = (e: React.PointerEvent) => { e.stopPropagation(); poke() }
  const hintBottom = 190

  // keyboard access to the spinner itself: arrows spin it
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    poke(); ensureAudio()
    const push = (d: number) => { for (const r of s.current.rings) if (!r.leaving) r.w = Math.max(-TUNE.maxW, Math.min(TUNE.maxW, r.w + d)); setTouched(true); e.preventDefault() } // arrows spin every ring
    if (e.key === 'ArrowRight') push(3)
    else if (e.key === 'ArrowLeft') push(-3)
  }

  return (
    <div ref={wrap} className="sp-root"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, maxWidth: 520, margin: '0 auto', background: 'var(--bg)', overflow: 'hidden', touchAction: 'none', userSelect: 'none',
        fontFamily: SANS,
        ['--bg' as string]: theme.bg, ['--ink' as string]: theme.ink, ['--pill' as string]: theme.pill, ['--pillb' as string]: theme.pillBorder,
        ['--pillt' as string]: theme.pillText, ['--pressed' as string]: theme.pressed, ['--onaccent' as string]: theme.onAccent, ['--accent' as string]: theme.ink } as React.CSSProperties}>
      <style>{CSS}</style>
      <canvas ref={cvs} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />
      {/* the spinner is its own focus stop (not the whole screen), so the buttons and radios around it keep their normal screen-reader behaviour */}
      <div className="sp-spin" tabIndex={0} role="group" aria-label="Spinner. Arrow keys spin every ring." onKeyDown={onKey} />
      {/* spoken updates for what the caption shows: a layer switching on or off, or its volume */}
      <div className="sp-vh" role="status" aria-live="polite">{caption}</div>
      {TUNING && <TunePanel />}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(var(--safe-bottom) + ${hintBottom}px)`, textAlign: 'center',
        color: 'var(--ink)', pointerEvents: 'none', opacity: touched ? 0 : 1, transition: 'opacity .3s ease-out' }}>
        <div style={{ fontSize: 22, fontWeight: 200, letterSpacing: 1 }}>Flick to spin</div>
      </div>
      {/* quick actions are toggle buttons: constant label, state in aria-pressed */}
      <div onPointerDown={stop} style={{ position: 'absolute', top: 'calc(var(--safe-top) + 8px)', left: 8, right: 8,
        display: 'flex', justifyContent: 'flex-end', opacity: chrome ? 0.9 : 0.6, transition: 'opacity .3s ease-out' }}>
        <div style={{ display: 'flex' }}>
          <button type="button" className="sp-btn" aria-label="Controls" aria-pressed={dockOpen} aria-controls={lookOpen ? 'spin-look' : 'spin-sound'} style={iconBtn(dockOpen)}
            onClick={() => { poke(); if (dockOpen) setLookOpen(false); setDockOpen(!dockOpen) }}> {/* hiding also closes the swatches, so the controls always come back as the instruments and layers */}
            <PanelIcon />
          </button>
          <button type="button" className="sp-btn" aria-label="Look" aria-pressed={lookOpen && dockOpen} aria-controls="spin-look" style={iconBtn(lookOpen && dockOpen)}
            onClick={() => { poke(); setLookOpen(dockOpen ? !lookOpen : true); setDockOpen(true) }}>
            <LookIcon />
          </button>
          <button type="button" className="sp-btn" aria-label="Mute" aria-pressed={muted} style={iconBtn(false)}
            onClick={() => { poke(); toggleMute() }}>
            <SoundIcon off={muted} />
          </button>
        </div>
      </div>

      {/* sound controls: two compact rows under the spinner, never a modal, so you can change them mid-spin */}
      <div id="spin-sound" className="sp-dock" role="group" aria-label="Sound" onPointerDown={stop}
        onPointerMove={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onPointerCancel={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 'calc(var(--safe-bottom) + 16px)', maxWidth: 420, margin: '0 auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--ink)',
          ...dockMotion(0.8, dockOpen && !lookOpen) }}>
        <div aria-hidden="true" className="sp-cap">{caption ?? active.map((v) => VOICE_LABELS[v]).join(' · ')}</div>
        {/* any combination: each icon puts its own ring on the screen, and the rings nest from the biggest (left) to the smallest (right) */}
        <fieldset className="sp-fs">
          <legend className="sp-vh">Instruments on the screen</legend>
          <div className="sp-insrow">
            {VOICES.map((v) => (
              <label key={v} className="sp-ins" style={{ ['--vc' as string]: theme.accents[v], ['--onvc' as string]: onColour(theme.accents[v]) } as React.CSSProperties}>
                <input type="checkbox" value={v} checked={active.includes(v)} onChange={() => toggleVoice(v)} />
                <span className="ic">{VOICE_ICONS[v]}<b className="sp-vh">{VOICE_LABELS[v]}</b></span>
              </label>
            ))}
          </div>
        </fieldset>
        {/* independent layers: tap to switch on or off, press and drag up or down for volume */}
        <div role="group" aria-label="Layers" style={{ display: 'flex', gap: 8 }}>
          {LAYERS.map((n) => (
            <button key={n} type="button" role="switch" className="sp-lay" aria-checked={layerOn[n]}
              aria-label={`${LAYER_LABELS[n]}${layerOn[n] ? `, volume ${Math.round(levels[n] * 100)}%` : ''}. Arrow up and down change the volume.`}
              onPointerDown={layerDown(n)} onPointerMove={layerMove} onPointerUp={layerUp(n)} onPointerCancel={() => { drag.current = null }}
              onKeyDown={layerKey(n)} onClick={() => { // a click right after a pointer release is the tap already handled; any other click (keyboard, screen reader) toggles here
                if (performance.now() - lastPtrUp.current < 700) return
                layerSet(n, !layerOn[n]); say(`${LAYER_LABELS[n]} ${layerOn[n] ? 'off' : 'on'}`)
              }}>
              {LAYER_ICONS[n]}
              {layerOn[n] && <svg className="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"
                strokeDasharray={`${125.66 * levels[n]} 125.66`} /></svg>}
            </button>
          ))}
        </div>
      </div>

      {/* look controls: the palette. They replace the sound pills while open, so the spinner stays clear */}
      <div id="spin-look" className="sp-dock" role="group" aria-label="Look" onPointerDown={stop}
        onPointerMove={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onPointerCancel={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 'calc(var(--safe-bottom) + 16px)', maxWidth: 420, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--ink)', ...dockMotion(0.8, dockOpen && lookOpen) }}>
        <fieldset className="sp-fs"><legend className="sp-vh">Palette</legend>
          <div className="sp-row"><span className="sp-rowl" aria-hidden="true">Palette</span>
            <div className="sp-pills">
              {THEME_IDS.map((id) => (
                <label key={id} className="sp-pill sw">
                  <input type="radio" name="theme" value={id} checked={themeId === id} onChange={() => switchTheme(id)} />
                  <span><i className="sp-sw" style={{ background: `linear-gradient(90deg, ${THEMES[id].bg} 50%, ${THEMES[id].ink} 50%)`,
                    boxShadow: `inset 0 0 0 1px ${THEMES[id].pillBorder}` }} /><b className="sp-vh">{THEMES[id].name}</b></span>
                </label>
              ))}
            </div></div>
        </fieldset>
      </div>
    </div>
  )
}
