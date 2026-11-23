import { useEffect, useRef, useState } from 'react'

const DOTS = 24 // shapes on the ring (and detents per turn)
const SPIRAL_TURNS = 5 // Drops lays small dots on a big spiral of this many rounds instead of a ring
const spiralTaper = (u: number) => Math.pow(Math.sin(Math.PI * u), 0.5) // dots shrink and fade at both ends of the spiral
const SCALE = [0, 2, 4, 7, 9] // major pentatonic: every combination sounds consonant
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

type AudioBits = { ctx: AudioContext; master: GainNode }
type Voice = 'bowl' | 'kalimba' | 'marimba' | 'drops'
const VOICES: Voice[] = ['bowl', 'kalimba', 'marimba', 'drops']
// ---- looks you can try: palette, dot count, dot shape, font
type Theme = {
  name: string; bg: string; ink: string; ring: string; dust: [string, string, string]; hub: string
  pill: string; pillBorder: string; pillText: string; pressed: string; onAccent: string; accents: Record<Voice, string>
}
const THEMES = {
  mono: { name: 'Mono', bg: '#0d0d0d', ink: '#f4f4f4', ring: '#333333', dust: ['#3a3a3a', '#2c2c2c', '#222222'], hub: '#666666',
    pill: '#171717', pillBorder: '#2a2a2a', pillText: '#9a9a9a', pressed: '#222222', onAccent: '#0d0d0d',
    accents: { bowl: '#f4f4f4', kalimba: '#f4f4f4', marimba: '#f4f4f4', drops: '#f4f4f4' } },
  chalk: { name: 'Chalk', bg: '#f4f4f2', ink: '#141414', ring: '#cfcfcb', dust: ['#c4c4c0', '#d2d2ce', '#dcdcd8'], hub: '#9a9a96',
    pill: '#eaeae6', pillBorder: '#d6d6d1', pillText: '#6a6a66', pressed: '#e2e2de', onAccent: '#f4f4f2',
    accents: { bowl: '#141414', kalimba: '#141414', marimba: '#141414', drops: '#141414' } },
  blush: { name: 'Blush', bg: '#f7efec', ink: '#3a2630', ring: '#e6cfd0', dust: ['#e0c7c9', '#e9d6d6', '#f0e2e1'], hub: '#c9a3a8',
    pill: '#f0dede', pillBorder: '#e6cccd', pillText: '#8a6670', pressed: '#ead6d6', onAccent: '#fff6f4',
    accents: { bowl: '#cf4d78', kalimba: '#d85a82', marimba: '#c0406d', drops: '#d9628d' } },
} satisfies Record<string, Theme>
type ThemeId = keyof typeof THEMES
const THEME_IDS = Object.keys(THEMES) as ThemeId[]
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
const dotSize = (n: number) => Math.max(3, Math.min(10, 21 / Math.sqrt(n))) // fewer dots are bigger, more dots smaller
const LOOK_KEY = 'spin-look'
const readLook = (): ThemeId => {
  try {
    const j = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')
    return j.theme in THEMES ? j.theme : 'mono'
  } catch { return 'mono' }
}
const IN_S = 4, OUT_S = 6 // breath: 4 in, 6 out
const SESSION_S = Number(new URLSearchParams(location.search).get('s')) || 180
const FADE_S = 8
const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const BreatheIcon = () => <svg {...iconProps}><path d="M3 8h9.5a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 12.5h14a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 17h6.5a2 2 0 1 1-2 2" opacity=".6" /></svg>
const SoundIcon = ({ off }: { off: boolean }) => (
  <svg {...iconProps}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    {off ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <><path d="M15.5 9a4 4 0 010 6" /><path d="M18 6.5a8 8 0 010 11" opacity=".6" /></>}
  </svg>
)
const vIcon = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
// a small spiral for the Drops icon: a polyline that winds out from the middle
const SPIRAL_ICON = Array.from({ length: 41 }, (_, i) => {
  const t = i / 40, th = t * 2.3 * Math.PI * 2 - 0.4, r = 0.8 + 8.4 * t
  return `${i ? 'L' : 'M'}${(12 + Math.cos(th) * r).toFixed(2)} ${(12 + Math.sin(th) * r).toFixed(2)}`
}).join('')
const VOICE_ICONS: Record<Voice, React.ReactElement> = {
  bowl: <svg {...vIcon}><path d="M3.5 11h17c0 4.4-3.8 7.5-8.5 7.5S3.5 15.4 3.5 11z" /><path d="M9 21h6" /><path d="M8.5 6.8q3.5-3 7 0" opacity=".6" /></svg>,
  kalimba: <svg {...vIcon}><rect x="5" y="3.5" width="14" height="17" rx="3.5" /><path d="M9 8v8M12 8v10M15 8v7" /></svg>,
  marimba: <svg {...vIcon} strokeWidth="2.4"><path d="M4 7h16M6 12h12M8 17h8" /></svg>,
  drops: <svg {...vIcon}><path d={SPIRAL_ICON} /></svg>,
}
const LookIcon = () => <svg {...iconProps}><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.1-.4-1.2.3-2.4 1.6-2.4H17a3.5 3.5 0 0 0 3.5-3.6C20.5 7.2 16.8 3.5 12 3.5z" /><circle cx="7.8" cy="11.2" r=".9" fill="currentColor" stroke="none" /><circle cx="10.4" cy="7.4" r=".9" fill="currentColor" stroke="none" /><circle cx="14.8" cy="7.6" r=".9" fill="currentColor" stroke="none" /></svg>
const iconBtn = (on: boolean): React.CSSProperties => ({
  width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, borderRadius: 22, color: 'var(--ink)',
  background: on ? 'var(--pressed)' : 'transparent', transition: 'background .3s, opacity .5s',
})
const CSS = `
.sp-root:focus{outline:none}
.sp-root:focus-visible{outline:2px solid var(--ink);outline-offset:-4px}
.sp-btn:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
fieldset.sp-fs{border:0;margin:0;padding:0;min-width:0}
.sp-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;padding:0}
.sp-pills{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
.sp-pill{position:relative;display:block;cursor:pointer}
.sp-pill::after{content:'';position:absolute;inset:-4px} /* 36px pill, 44px touch target */
.sp-pill input{position:absolute;opacity:0;width:1px;height:1px}
.sp-pill span{display:flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:999px;font-size:13px;letter-spacing:.3px;text-transform:capitalize;color:var(--pillt);background:var(--pill);border:1px solid var(--pillb);transition:background .25s,color .25s,border-color .25s}
.sp-pill input:checked + span{background:var(--accent);color:var(--onaccent);border-color:transparent}
.sp-pill.vo span{padding:0 10px;gap:5px}
.sp-pill.sw span{padding:0;width:36px;justify-content:center;background:transparent}
.sp-pill.sw input:checked + span{background:transparent;border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)}
.sp-pill svg{flex:none}
.sp-sw{width:20px;height:20px;border-radius:50%;display:block}
.sp-pill.tg input:checked + span{background:var(--pill);color:var(--ink);border-color:var(--ink)}
.sp-pill.tg span::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--pillt);opacity:.45;transition:background .25s,opacity .25s}
.sp-pill.tg input:checked + span::before{background:var(--ink);opacity:1}
.sp-pill input:focus-visible + span{outline:2px solid var(--ink);outline-offset:2px}
.sp-row{display:flex;align-items:center;justify-content:center;gap:8px}
.sp-rowl{width:52px;flex:none;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--pillt)}
@media (prefers-reduced-motion: reduce){.sp-pill span,.sp-pill span::before{transition:none}}
`

// an independent on/off option: a toggle pill (still a real switch underneath)
function TogglePill({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="sp-pill tg">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x) // smooth 0..1

export default function Spin() {
  const wrap = useRef<HTMLDivElement>(null)
  const cvs = useRef<HTMLCanvasElement>(null)
  const audio = useRef<AudioBits | null>(null)
  const [muted, setMuted] = useState(false)
  const [touched, setTouched] = useState(false)
  const [breathOn, setBreathOn] = useState(false)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const [ended, setEnded] = useState(false)
  const [voice, setVoiceState] = useState<Voice>('bowl')
  const [padOn, setPadOn] = useState(false)
  const [noiseOn, setNoiseOn] = useState(false)
  const [cycles, setCycles] = useState(0)
  const [chrome, setChrome] = useState(true)
  const [pokeTick, setPokeTick] = useState(0)
  const [themeId, setThemeId] = useState<ThemeId>(readLook) // restored from the last visit
  const [lookOpen, setLookOpen] = useState(false)
  const theme: Theme = THEMES[themeId]
  const padRef = useRef<{ gain: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null>(null)
  const noiseRef = useRef<{ gain: GainNode; src: AudioBufferSourceNode } | null>(null)

  const s = useRef({
    rot: 0, w: 0.15, dragging: false, lastA: 0, lastT: 0,
    pulse: new Float32Array(DOTS * SPIRAL_TURNS), th: THEMES.mono as Theme, n: DOTS, step: (Math.PI * 2) / DOTS, lastNote: 0, muted: false, voice: 'bowl' as Voice, cyFrac: 0.44, pid: -1, cycleIdx: 0, W: 0, H: 0,
    breathOn: false, breathT0: 0, ended: false, phase: 'in' as 'in' | 'out',
  })

  s.current.th = theme // the canvas reads the look from here
  useEffect(() => {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify({ theme: themeId })) } catch { /* private mode */ }
  }, [themeId])

  const ensureAudio = () => {
    if (audio.current) {
      if (audio.current.ctx.state === 'suspended') void audio.current.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const master = ctx.createGain(); master.gain.value = 0.9
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.38
    const fb = ctx.createGain(); fb.gain.value = 0.4
    const wet = ctx.createGain(); wet.gain.value = 0.45
    master.connect(ctx.destination)
    master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination)
    audio.current = { ctx, master }
  }

  const note = (tick: number) => {
    const a = audio.current
    if (!a || s.current.muted) return
    const t = a.ctx.currentTime
    const d = ((tick % 15) + 15) % 15
    const f = 196 * 2 ** ((SCALE[d % 5] + 12 * Math.floor(d / 5)) / 12)
    // one partial: oscillator through an attack/decay envelope into the master bus
    const mk = (type: OscillatorType, freq: number, peak: number, attack: number, decay: number, glideTo?: number) => {
      const o = a.ctx.createOscillator(), g = a.ctx.createGain()
      o.type = type; o.frequency.setValueAtTime(freq, t)
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + 0.09)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak, t + attack)
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
      o.connect(g); g.connect(a.master); o.start(t); o.stop(t + attack + decay + 0.05)
    }
    switch (s.current.voice) {
      case 'bowl': // inharmonic partials that decay at different rates = a shimmering, beating tail
        mk('sine', f, 0.12, 0.01, 3.4); mk('sine', f * 1.003, 0.06, 0.01, 3.4)
        mk('sine', f * 2.76, 0.04, 0.01, 1.8); mk('sine', f * 5.4, 0.016, 0.01, 0.9)
        break
      case 'kalimba': // short plucked attack with a metallic tick on top
        mk('triangle', f * 2, 0.15, 0.003, 0.9); mk('sine', f * 2 * 5.4, 0.03, 0.002, 0.12)
        break
      case 'marimba': // rounded wooden knock with a quick decay
        mk('sine', f, 0.2, 0.004, 0.55); mk('sine', f * 4, 0.05, 0.002, 0.07)
        break
      case 'drops': // pitch glides upward like a water drop
        mk('sine', f * 1.5, 0.14, 0.004, 0.35, f * 2.4)
        break
    }
  }

  // notes thin out as the ring speeds up, so a fast spin flows instead of machine-gunning
  const noteGap = () => 70 + Math.min(Math.abs(s.current.w) * 14, 230)

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
      lp.connect(gain); gain.connect(a.master)
      gain.gain.setTargetAtTime(0.06, t, 1.5)
      padRef.current = { gain, oscs, lfo }
    } else if (!on && padRef.current) {
      const p = padRef.current; padRef.current = null
      p.gain.gain.setTargetAtTime(0, t, 0.8)
      setTimeout(() => { p.oscs.forEach((o) => o.stop()); p.lfo.stop(); p.gain.disconnect() }, 4000)
    }
  }

  const setNoise = (on: boolean) => {
    const a = audio.current
    if (!a) return
    const t = a.ctx.currentTime
    if (on && !noiseRef.current) {
      const buf = a.ctx.createBuffer(1, a.ctx.sampleRate * 2, a.ctx.sampleRate)
      const data = buf.getChannelData(0); let y = 0
      for (let i = 0; i < data.length; i++) { y += 0.08 * ((Math.random() * 2 - 1) - y); data[i] = y * 3.5 } // soft, low-passed noise
      const src = a.ctx.createBufferSource(); src.buffer = buf; src.loop = true
      const bp = a.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.5
      const gain = a.ctx.createGain(); gain.gain.value = 0
      src.connect(bp); bp.connect(gain); gain.connect(a.master); src.start()
      noiseRef.current = { gain, src }
    } else if (!on && noiseRef.current) {
      const n = noiseRef.current; noiseRef.current = null
      n.gain.gain.setTargetAtTime(0, t, 0.5)
      setTimeout(() => { n.src.stop(); n.gain.disconnect() }, 2500)
    }
  }

  // soft tone that rises on the in-breath and falls on the out-breath, so you can follow with your eyes closed
  const breathCue = (dir: 1 | -1) => {
    const a = audio.current
    if (!a || s.current.muted) return
    const t = a.ctx.currentTime, o = a.ctx.createOscillator(), g = a.ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(dir > 0 ? 220 : 330, t)
    o.frequency.exponentialRampToValueAtTime(dir > 0 ? 330 : 220, t + 0.9)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    o.connect(g); g.connect(a.master); o.start(t); o.stop(t + 1.7)
  }

  const setBreath = (on: boolean) => {
    const st = s.current
    st.breathOn = on; st.ended = false; st.breathT0 = performance.now()
    st.phase = 'in'; st.cycleIdx = 0
    setBreathOn(on); setEnded(false); setPhase('in'); setCycles(0)
    if (on) { ensureAudio(); breathCue(1) }
    const a = audio.current
    if (a) a.master.gain.setTargetAtTime(st.muted ? 0 : 0.9, a.ctx.currentTime, 0.3)
  }

  useEffect(() => { // controls dim (never hide) after a few quiet seconds, so they stay reachable while you play
    setChrome(true)
    const t = window.setTimeout(() => setChrome(false), 4000)
    return () => clearTimeout(t)
  }, [pokeTick])

  useEffect(() => () => { // leaving the route must stop all sound
    const a = audio.current
    audio.current = null; padRef.current = null; noiseRef.current = null
    if (a) void a.ctx.close()
  }, [])

  useEffect(() => {
    const st = s.current
    const canvas = cvs.current!, box = wrap.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, last = performance.now(), t0 = last

    const frame = () => {
      const now = performance.now() // one clock everywhere (rAF's timestamp can lag event times in Safari)
      const dt = Math.min((now - last) / 1000, 0.04); last = now
      const time = (now - t0) / 1000
      const W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr; canvas.height = H * dpr; st.W = W; st.H = H
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = st.th.bg; ctx.fillRect(0, 0, W, H)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // ---- physics
      const prevRot = st.rot
      if (!st.dragging) {
        st.w *= Math.exp(-(st.ended ? 1.1 : 0.42) * dt) // long, soft decay; faster when the session ends
        if (Math.abs(st.w) < (st.ended ? 0.03 : 0.14)) st.w = (st.ended ? 0.03 : 0.14) * (st.w < 0 ? -1 : 1) // never fully stops
        st.rot += st.w * dt
      }
      const spiral = st.voice === 'drops'
      st.n = spiral ? DOTS * SPIRAL_TURNS : DOTS // same detents per finger-turn either way: the spiral just has more dots on it
      const N = st.n, a0 = Math.floor(prevRot / st.step), a1 = Math.floor(st.rot / st.step)
      if (a1 !== a0) {
        const crossed = Math.min(Math.abs(a1 - a0), N)
        const dir = a1 > a0 ? 1 : -1
        for (let k = 1; k <= crossed; k++) st.pulse[(((a0 + dir * k) % N) + N) % N] = 1
        if (now - st.lastNote > noteGap()) { st.lastNote = now; note(a1); navigator.vibrate?.(4) }
      }
      st.pulse.forEach((_, i) => { st.pulse[i] = Math.max(0, st.pulse[i] - dt * 1.6) })

      // ---- draw: flat and matte, solid fills only (no glow, blur, gradients or trails)
      const th = st.th
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H)
      const cx = W / 2, cy = H * st.cyFrac
      const base = Math.min(W, H) * 0.25
      let b = 0.5 + 0.5 * Math.sin(time * 0.9) // idle breathing
      let breath = 0.035
      if (st.breathOn) {
        const el = (now - st.breathT0) / 1000
        const CYC = IN_S + OUT_S // one breath in + one breath out = one full cycle = one full turn of the arc
        const c = el % CYC
        const cycleB = c < IN_S ? ease(c / IN_S) : 1 - ease((c - IN_S) / OUT_S)
        const k = Math.min(1, el / 1.2) // ease out of the idle breathing into the first inhale
        b = b * (1 - k) + cycleB * k
        breath = 0.12
        const ph = c < IN_S ? 'in' : 'out'
        if (ph !== st.phase) { st.phase = ph; setPhase(ph); breathCue(ph === 'in' ? 1 : -1); navigator.vibrate?.(8) }
        const ci = Math.floor(el / CYC)
        if (ci !== st.cycleIdx) {
          st.cycleIdx = ci; setCycles(ci) // a full breath just completed
        }
        const a = audio.current
        if (a && !st.ended && !st.muted) a.master.gain.setTargetAtTime(0.55 + 0.45 * b, a.ctx.currentTime, 0.25) // sound swells with the breath
        if (!st.ended && el > SESSION_S) {
          st.ended = true; setEnded(true)
          if (a) a.master.gain.setTargetAtTime(0, a.ctx.currentTime, FADE_S / 4)
        }
      }
      const nz = noiseRef.current, an = audio.current
      if (nz && an) nz.gain.gain.setTargetAtTime(0.012 + Math.min(Math.abs(st.w) / 22, 1) * 0.05 + (st.breathOn ? 0.03 * b : 0), an.ctx.currentTime, 0.15)
      const R = base * (1 + breath * (b - 0.5) * 2)
      const accent = th.accents[st.voice]

      for (let k = 1; k <= (spiral ? 0 : 3); k++) { // slow outer dust rings, counter-rotating (the spiral fills the screen, so it has none)
        const rk = R * (1 + 0.42 * k), n = 14 + k * 8
        const rot = st.rot * (k % 2 ? -0.35 : 0.2) / k
        ctx.fillStyle = th.dust[k - 1]
        for (let i = 0; i < n; i++) {
          const ang = rot + (i / n) * Math.PI * 2
          ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rk, cy + Math.sin(ang) * rk, 1.7, 0, Math.PI * 2); ctx.fill()
        }
      }
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.strokeStyle = th.ring; ctx.lineWidth = 1.5
      // the spiral: five rounds from near the middle out to the edges of the screen, scaled with the breath
      const sMax = (W / 2 - 4) * (R / base), sMin = W * 0.05
      const spiralR = (u: number) => sMin + (sMax - sMin) * u
      if (!spiral) ctx.stroke()
      else { // a flat line that fades in at the middle and out at the outer end
        const SEG = 220
        ctx.lineCap = 'round'
        for (let i = 1; i <= SEG; i++) {
          const u0 = (i - 1) / SEG, u1 = i / SEG
          const t0 = -Math.PI / 2 + u0 * SPIRAL_TURNS * Math.PI * 2, t1 = -Math.PI / 2 + u1 * SPIRAL_TURNS * Math.PI * 2
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(t0) * spiralR(u0), cy + Math.sin(t0) * spiralR(u0))
          ctx.lineTo(cx + Math.cos(t1) * spiralR(u1), cy + Math.sin(t1) * spiralR(u1))
          ctx.globalAlpha = 0.15 + 0.85 * spiralTaper(u1); ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      const dirw = st.w >= 0 ? 1 : -1, streak = Math.min(Math.abs(st.w) * 0.045, 0.75), r0 = dotSize(DOTS)
      // one dot in the chosen shape, centred at (x, y) and pointing outward along `ang`
      const drawDot = (x: number, y: number, ang: number, r: number, color: string, alpha: number) => {
        const ca = Math.cos(ang), sa = Math.sin(ang)
        ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.strokeStyle = color
        ctx.beginPath()
        switch (st.voice) { // every instrument has its own shape
          case 'kalimba': // thin, long tines
            ctx.moveTo(x - ca * r * 2.5, y - sa * r * 2.5); ctx.lineTo(x + ca * r * 2.5, y + sa * r * 2.5)
            ctx.lineWidth = Math.max(1.6, r * 0.62); ctx.lineCap = 'round'; ctx.stroke(); break
          case 'marimba': // thick, shorter bars
            ctx.moveTo(x - ca * r * 1.5, y - sa * r * 1.5); ctx.lineTo(x + ca * r * 1.5, y + sa * r * 1.5)
            ctx.lineWidth = r * 1.4; ctx.lineCap = 'round'; ctx.stroke(); break
          default: ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() // bowl and drops: plain filled dots
        }
        ctx.globalAlpha = 1
      }
      for (let i = 0; i < N; i++) {
        const p = st.pulse[i]
        if (spiral) { // small dots travel along the spiral: spin one way and they wind outward, the other and they wind in
          const u = ((i / N + st.rot / (Math.PI * 2 * SPIRAL_TURNS)) % 1 + 1) % 1, tp = spiralTaper(u)
          const th2 = -Math.PI / 2 + u * SPIRAL_TURNS * Math.PI * 2, rr = spiralR(u)
          const x = cx + Math.cos(th2) * rr, y = cy + Math.sin(th2) * rr, r = 3.3 * (1 + p * 0.7) * (0.35 + 0.65 * tp)
          drawDot(x, y, th2, r, accent, tp)
          if (p > 0.02) drawDot(x, y, th2, r, th.ink, p * tp)
          continue
        }
        const ang = st.rot + i * st.step, r = r0 * (1 + p * 0.65)
        if (streak > 0.05) { // speed shows as a flat, translucent streak along the ring
          const tail = ang - dirw * streak
          ctx.beginPath(); ctx.arc(cx, cy, R, Math.min(ang, tail), Math.max(ang, tail))
          ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1
        }
        const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R
        drawDot(x, y, ang, r, accent, 1)
        if (p > 0.02) drawDot(x, y, ang, r, th.ink, p) // a passing detent lights the dot up
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
  const down = (e: React.PointerEvent) => {
    ensureAudio(); setTouched(true); setPokeTick((n) => n + 1)
    const st = s.current
    if (st.dragging) return // a second finger never takes over the spin
    wrap.current!.setPointerCapture(e.pointerId)
    st.pid = e.pointerId
    st.dragging = true; st.lastA = pointerAngle(e); st.lastT = performance.now()
    if (st.ended && performance.now() - st.breathT0 > (SESSION_S + 3) * 1000) setBreath(true) // tap to begin again
  }
  const move = (e: React.PointerEvent) => {
    const st = s.current
    if (!st.dragging || e.pointerId !== st.pid) return
    const a = pointerAngle(e), now = performance.now()
    const d = wrapAngle(a - st.lastA), dt = Math.max((now - st.lastT) / 1000, 0.001)
    const prev = st.rot
    st.rot += d
    st.w = st.w * 0.6 + (d / dt) * 0.4 // smoothed finger velocity becomes the flick
    st.w = Math.max(-26, Math.min(26, st.w))
    const N = st.n, a0 = Math.floor(prev / st.step), a1 = Math.floor(st.rot / st.step)
    if (a1 !== a0) {
      const dir = a1 > a0 ? 1 : -1
      for (let k = 1; k <= Math.min(Math.abs(a1 - a0), N); k++) st.pulse[(((a0 + dir * k) % N) + N) % N] = 1
      if (now - st.lastNote > noteGap()) { st.lastNote = now; note(a1); navigator.vibrate?.(4) }
    }
    st.lastA = a; st.lastT = now
  }
  const up = (e: React.PointerEvent) => {
    const st = s.current
    if (!st.dragging || e.pointerId !== st.pid) return
    st.dragging = false
    const now = performance.now()
    if (now - st.lastT > 90) st.w *= 0.3 // held still before release: no flick
  }

  const toggleMute = () => {
    const m = !s.current.muted
    s.current.muted = m; setMuted(m)
    const a = audio.current
    if (a) a.master.gain.setTargetAtTime(m ? 0 : 0.9, a.ctx.currentTime, 0.1) // silences pad and noise too
  }

  const poke = () => setPokeTick((n) => n + 1)
  const stop = (e: React.PointerEvent) => { e.stopPropagation(); poke() }
  const hintBottom = 190

  // keyboard access to the spinner itself: arrows spin it
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    const st = s.current
    poke(); ensureAudio()
    if (e.key === 'ArrowRight') { st.w = Math.min(26, st.w + 3); setTouched(true); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { st.w = Math.max(-26, st.w - 3); setTouched(true); e.preventDefault() }
  }

  return (
    <div ref={wrap} className="sp-root" tabIndex={0} role="application"
      aria-label="Spinner. Arrow keys spin it."
      onKeyDown={onKey} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden', touchAction: 'none', userSelect: 'none',
        fontFamily: SANS, transition: 'background .35s',
        ['--bg' as string]: theme.bg, ['--ink' as string]: theme.ink, ['--pill' as string]: theme.pill, ['--pillb' as string]: theme.pillBorder,
        ['--pillt' as string]: theme.pillText, ['--pressed' as string]: theme.pressed, ['--onaccent' as string]: theme.onAccent, ['--accent' as string]: theme.accents[voice] } as React.CSSProperties}>
      <style>{CSS}</style>
      <canvas ref={cvs} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(var(--safe-bottom) + ${hintBottom}px)`, textAlign: 'center',
        color: 'var(--ink)', pointerEvents: 'none', opacity: touched ? 0 : 1, transition: 'opacity 1.2s ease-out, bottom .5s' }}>
        <div style={{ fontSize: 22, fontWeight: 200, letterSpacing: 1 }}>Flick to spin</div>
      </div>
      <div role="status" aria-live="polite" style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(var(--safe-bottom) + ${hintBottom}px)`,
        textAlign: 'center', color: 'var(--ink)', fontSize: 22, fontWeight: 200, letterSpacing: 1, pointerEvents: 'none',
        opacity: breathOn && !ended ? 0.85 : 0, transition: 'opacity 0.8s ease-out, bottom .5s' }}>
        {breathOn && !ended ? `Breathe ${phase}` : ''}
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(var(--safe-top) + 22px)', textAlign: 'center',
        color: 'var(--ink)', fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', pointerEvents: 'none',
        opacity: breathOn && !ended ? 0.55 : 0, transition: 'opacity .8s ease-out' }}>{cycles} {cycles === 1 ? 'breath' : 'breaths'}</div>
      <div aria-hidden={!ended} style={{ position: 'absolute', inset: 0, background: 'var(--bg)', pointerEvents: 'none',
        opacity: ended ? 0.94 : 0, transition: `opacity ${FADE_S}s ease-in-out`, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 200, letterSpacing: 1, opacity: ended ? 0.7 : 0,
          transition: `opacity ${FADE_S}s ease-in-out`, textAlign: 'center' }}>
          Rest<div style={{ fontSize: 13, opacity: 0.55, marginTop: 8, fontWeight: 400 }}>Tap to continue</div>
        </div>
      </div>

      {/* quick actions are toggle buttons: constant label, state in aria-pressed */}
      <div onPointerDown={stop} style={{ position: 'absolute', top: 'calc(var(--safe-top) + 8px)', left: 8, right: 8,
        display: 'flex', justifyContent: 'space-between', opacity: chrome ? 0.8 : 0.3, transition: 'opacity .6s ease-out' }}>
        <button type="button" className="sp-btn" aria-label="Breathing guide" aria-pressed={breathOn} style={iconBtn(breathOn)}
          onClick={() => { ensureAudio(); setTouched(true); poke(); setBreath(!s.current.breathOn) }}>
          <BreatheIcon />
        </button>
        <div style={{ display: 'flex' }}>
          <button type="button" className="sp-btn" aria-label="Look" aria-pressed={lookOpen} aria-controls="spin-look" style={iconBtn(lookOpen)}
            onClick={() => { poke(); setLookOpen((o) => !o) }}>
            <LookIcon />
          </button>
          <button type="button" className="sp-btn" aria-label="Mute" aria-pressed={muted} style={iconBtn(false)}
            onClick={() => { poke(); toggleMute() }}>
            <SoundIcon off={muted} />
          </button>
        </div>
      </div>

      {/* sound controls: minimal pills under the spinner, never a modal, so you can change them mid-spin */}
      {!lookOpen && <div role="group" aria-label="Sound" onPointerDown={stop}
        onPointerMove={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onPointerCancel={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 'calc(var(--safe-bottom) + 16px)', maxWidth: 420, margin: '0 auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--ink)',
          opacity: chrome ? 1 : 0.5, transition: 'opacity .6s ease-out' }}>
        {/* choose one: radio pills */}
        <fieldset className="sp-fs">
          <legend className="sp-vh">Instrument</legend>
          <div className="sp-pills">
            {VOICES.map((v) => (
              <label key={v} className="sp-pill vo">
                <input type="radio" name="voice" value={v} checked={voice === v}
                  onChange={() => { ensureAudio(); setTouched(true); s.current.voice = v; setVoiceState(v); note(7) }} />
                <span>{VOICE_ICONS[v]}{v}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {/* independent on/off: toggle pills */}
        <fieldset className="sp-fs">
          <legend className="sp-vh">Layers</legend>
          <div className="sp-pills">
            <TogglePill label="Pad" checked={padOn} onChange={(v) => { ensureAudio(); setTouched(true); setPadOn(v); setPad(v) }} />
            <TogglePill label="Air" checked={noiseOn} onChange={(v) => { ensureAudio(); setTouched(true); setNoiseOn(v); setNoise(v) }} />
          </div>
        </fieldset>
      </div>}

      {/* look controls: the palette. They replace the sound pills while open, so the spinner stays clear */}
      {lookOpen && <div id="spin-look" role="group" aria-label="Look" onPointerDown={stop}
        onPointerMove={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onPointerCancel={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 'calc(var(--safe-bottom) + 16px)', maxWidth: 420, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--ink)', opacity: chrome ? 1 : 0.6, transition: 'opacity .6s ease-out' }}>
        <fieldset className="sp-fs"><legend className="sp-vh">Palette</legend>
          <div className="sp-row"><span className="sp-rowl" aria-hidden="true">Palette</span>
            <div className="sp-pills">
              {THEME_IDS.map((id) => (
                <label key={id} className="sp-pill sw">
                  <input type="radio" name="theme" value={id} checked={themeId === id} onChange={() => setThemeId(id)} />
                  <span><i className="sp-sw" style={{ background: `linear-gradient(90deg, ${THEMES[id].bg} 50%, ${THEMES[id].accents.bowl} 50%)`,
                    boxShadow: `inset 0 0 0 1px ${THEMES[id].pillBorder}` }} /><b className="sp-vh">{THEMES[id].name}</b></span>
                </label>
              ))}
            </div></div>
        </fieldset>
      </div>}
    </div>
  )
}
