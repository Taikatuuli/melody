import { useEffect, useRef, useState } from 'react'

const N = 12 // nodes (and detents) on the spinner
const STEP = (Math.PI * 2) / N
const SCALE = [0, 2, 4, 7, 9] // major pentatonic: every combination sounds consonant
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

type AudioBits = { ctx: AudioContext; master: GainNode }
type Voice = 'bowl' | 'kalimba' | 'marimba' | 'drops'
const VOICES: Voice[] = ['bowl', 'kalimba', 'marimba', 'drops']
// flat, matte palette: one background, one ink, one muted accent per instrument
const BG = '#131318'
const INK = '#ece9f5'
const ACCENTS: Record<Voice, string> = { bowl: '#a79fe3', kalimba: '#dcbf90', marimba: '#dc9fac', drops: '#8ab2de' }
// every breath gives birth to one sphere at the centre; four are alive at once, each in the next colour of a repeating set of four
const SPHERES = 4
const SPHERE_COLORS = ['#38364b', '#453e36', '#45363d', '#313b49'] // matte tints of the four instrument accents
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
const VOICE_ICONS: Record<Voice, React.ReactElement> = {
  bowl: <svg {...vIcon}><path d="M3.5 11h17c0 4.4-3.8 7.5-8.5 7.5S3.5 15.4 3.5 11z" /><path d="M9 21h6" /><path d="M8.5 6.8q3.5-3 7 0" opacity=".6" /></svg>,
  kalimba: <svg {...vIcon}><rect x="5" y="3.5" width="14" height="17" rx="3.5" /><path d="M9 8v8M12 8v10M15 8v7" /></svg>,
  marimba: <svg {...vIcon} strokeWidth="2.4"><path d="M4 7h16M6 12h12M8 17h8" /></svg>,
  drops: <svg {...vIcon}><path d="M12 3.5c3.6 4.4 6 7.2 6 10a6 6 0 0 1-12 0c0-2.8 2.4-5.6 6-10z" /></svg>,
}
const iconBtn = (on: boolean): React.CSSProperties => ({
  width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, borderRadius: 22, color: INK,
  background: on ? '#25252e' : 'transparent', transition: 'background .3s, opacity .5s',
})
const CSS = `
.sp-root:focus{outline:none}
.sp-root:focus-visible{outline:2px solid rgba(255,255,255,.5);outline-offset:-4px}
.sp-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
fieldset.sp-fs{border:0;margin:0;padding:0;min-width:0}
.sp-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;padding:0}
.sp-pills{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}
.sp-pill{position:relative;display:block;cursor:pointer}
.sp-pill::after{content:'';position:absolute;inset:-4px} /* 36px pill, 44px touch target */
.sp-pill input{position:absolute;opacity:0;width:1px;height:1px}
.sp-pill span{display:flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:999px;font-size:13px;letter-spacing:.3px;text-transform:capitalize;color:#a3a1b4;background:#1b1b22;border:1px solid #2b2b35;transition:background .25s,color .25s,border-color .25s}
.sp-pill input:checked + span{background:var(--accent,#ece9f5);color:#131318;border-color:transparent}
.sp-pill.vo span{padding:0 10px;gap:5px}
.sp-pill svg{flex:none}
.sp-pill.tg input:checked + span{background:#1b1b22;color:#ece9f5;border-color:#ece9f5}
.sp-pill.tg span::before{content:'';width:6px;height:6px;border-radius:50%;background:#4a4a58;transition:background .25s}
.sp-pill.tg input:checked + span::before{background:#ece9f5}
.sp-pill input:focus-visible + span{outline:2px solid #fff;outline-offset:2px}
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
  const padRef = useRef<{ gain: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null>(null)
  const noiseRef = useRef<{ gain: GainNode; src: AudioBufferSourceNode } | null>(null)

  const s = useRef({
    rot: 0, w: 0.15, dragging: false, lastA: 0, lastT: 0,
    pulse: new Float32Array(N), lastNote: 0, muted: false, voice: 'bowl' as Voice, cyFrac: 0.44, pid: -1, cycleIdx: 0, flash: 0, W: 0, H: 0,
    spheres: [] as { born: number; c: number }[], sphereN: 0, sphereOff: 0, breathOn: false, breathT0: 0, ended: false, phase: 'in' as 'in' | 'out',
  })

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
    st.phase = 'in'; st.cycleIdx = 0; st.flash = 0
    if (on) { st.spheres = [{ born: performance.now(), c: 0 }]; st.sphereN = 1; st.sphereOff = 0 } else st.sphereOff = performance.now() // first breath, first sphere; switching off lets them fade
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
        ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // ---- physics
      const prevRot = st.rot
      if (!st.dragging) {
        st.w *= Math.exp(-(st.ended ? 1.1 : 0.42) * dt) // long, soft decay; faster when the session ends
        if (Math.abs(st.w) < (st.ended ? 0.03 : 0.14)) st.w = (st.ended ? 0.03 : 0.14) * (st.w < 0 ? -1 : 1) // never fully stops
        st.rot += st.w * dt
      }
      const a0 = Math.floor(prevRot / STEP), a1 = Math.floor(st.rot / STEP)
      if (a1 !== a0) {
        const crossed = Math.min(Math.abs(a1 - a0), N)
        const dir = a1 > a0 ? 1 : -1
        for (let k = 1; k <= crossed; k++) st.pulse[(((a0 + dir * k) % N) + N) % N] = 1
        if (now - st.lastNote > noteGap()) { st.lastNote = now; note(a1); navigator.vibrate?.(4) }
      }
      st.pulse.forEach((_, i) => { st.pulse[i] = Math.max(0, st.pulse[i] - dt * 1.6) })

      // ---- draw: flat and matte, solid fills only (no glow, blur, gradients or trails)
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
      const cx = W / 2, cy = H * st.cyFrac
      const base = Math.min(W, H) * 0.25
      let b = 0.5 + 0.5 * Math.sin(time * 0.9) // idle breathing
      let breath = 0.035, prog = 0
      if (st.breathOn) {
        const el = (now - st.breathT0) / 1000
        const CYC = IN_S + OUT_S // one breath in + one breath out = one full cycle = one full turn of the arc
        const c = el % CYC
        const cycleB = c < IN_S ? ease(c / IN_S) : 1 - ease((c - IN_S) / OUT_S)
        const k = Math.min(1, el / 1.2) // ease out of the idle breathing into the first inhale
        b = b * (1 - k) + cycleB * k
        breath = 0.12
        prog = c / CYC
        const ph = c < IN_S ? 'in' : 'out'
        if (ph !== st.phase) { st.phase = ph; setPhase(ph); breathCue(ph === 'in' ? 1 : -1); navigator.vibrate?.(8) }
        const ci = Math.floor(el / CYC)
        if (ci !== st.cycleIdx) {
          st.cycleIdx = ci; st.flash = 1; setCycles(ci) // a full breath just completed
          if (!st.ended) { st.spheres.push({ born: now, c: st.sphereN % SPHERES }); st.sphereN++ } // ...and the next breath's sphere is born at the centre
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
      const accent = ACCENTS[st.voice]

      if (st.spheres.length) { // breath spheres: nested flat discs, oldest (largest) at the back
        const life = SPHERES * (IN_S + OUT_S) * 1000
        const off = st.breathOn ? 1 : Math.max(0, 1 - (now - st.sphereOff) / 600)
        st.spheres = st.spheres.filter((sp) => now - sp.born < life && off > 0)
        for (const sp of st.spheres) {
          const p = (now - sp.born) / life
          const rad = R * 0.9 * ease(Math.min(1, p)) * (1 + 0.03 * (b - 0.5))
          ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, rad), 0, Math.PI * 2)
          ctx.fillStyle = SPHERE_COLORS[sp.c]; ctx.globalAlpha = (p > 0.9 ? (1 - p) / 0.1 : 1) * off; ctx.fill(); ctx.globalAlpha = 1
        }
      }

      for (let k = 1; k <= 3; k++) { // slow outer dust rings, counter-rotating
        const rk = R * (1 + 0.42 * k), n = 14 + k * 8
        const rot = st.rot * (k % 2 ? -0.35 : 0.2) / k
        ctx.fillStyle = k === 1 ? '#3d3d4a' : k === 2 ? '#31313c' : '#272731'
        for (let i = 0; i < n; i++) {
          const ang = rot + (i / n) * Math.PI * 2
          ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rk, cy + Math.sin(ang) * rk, 1.7, 0, Math.PI * 2); ctx.fill()
        }
      }
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.strokeStyle = '#33333f'; ctx.lineWidth = 1.5; ctx.stroke()

      if (st.breathOn && !st.ended) { // progress arc around one full breath cycle
        const a0p = -Math.PI / 2, a1p = a0p + prog * Math.PI * 2, rp = R * 1.14
        st.flash = Math.max(0, st.flash - dt * 1.6)
        ctx.beginPath(); ctx.arc(cx, cy, rp, 0, Math.PI * 2) // quiet track: the whole cycle
        ctx.strokeStyle = '#25252e'; ctx.lineWidth = 3; ctx.stroke()
        ctx.beginPath(); ctx.arc(cx, cy, rp, a0p, a1p)
        ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke()
        if (st.flash > 0) { // the closed circle thickens for a moment
          ctx.beginPath(); ctx.arc(cx, cy, rp, 0, Math.PI * 2)
          ctx.strokeStyle = accent; ctx.lineWidth = 3 + st.flash * 5; ctx.globalAlpha = st.flash; ctx.stroke(); ctx.globalAlpha = 1
        }
        ctx.beginPath(); ctx.arc(cx + Math.cos(a1p) * rp, cy + Math.sin(a1p) * rp, 5, 0, Math.PI * 2)
        ctx.fillStyle = INK; ctx.fill()
      }

      const dirw = st.w >= 0 ? 1 : -1, streak = Math.min(Math.abs(st.w) * 0.045, 0.75)
      for (let i = 0; i < N; i++) {
        const ang = st.rot + i * STEP, p = st.pulse[i], r = 6 + p * 4
        if (streak > 0.05) { // speed shows as a flat, translucent streak along the ring
          const tail = ang - dirw * streak
          ctx.beginPath(); ctx.arc(cx, cy, R, Math.min(ang, tail), Math.max(ang, tail))
          ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1
        }
        const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill()
        if (p > 0.02) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.globalAlpha = p; ctx.fill(); ctx.globalAlpha = 1 }
      }
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = '#5a5a69'; ctx.fill()

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
    const a0 = Math.floor(prev / STEP), a1 = Math.floor(st.rot / STEP)
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
      style={{ position: 'fixed', inset: 0, background: BG, overflow: 'hidden', touchAction: 'none', userSelect: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}>
      <style>{CSS}</style>
      <canvas ref={cvs} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(var(--safe-bottom) + ${hintBottom}px)`, textAlign: 'center',
        color: INK, pointerEvents: 'none', opacity: touched ? 0 : 1, transition: 'opacity 1.2s ease-out, bottom .5s' }}>
        <div style={{ fontSize: 22, fontWeight: 200, letterSpacing: 1 }}>Flick to spin</div>
      </div>
      <div role="status" aria-live="polite" style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(var(--safe-bottom) + ${hintBottom}px)`,
        textAlign: 'center', color: INK, fontSize: 22, fontWeight: 200, letterSpacing: 1, pointerEvents: 'none',
        opacity: breathOn && !ended ? 0.85 : 0, transition: 'opacity 0.8s ease-out, bottom .5s' }}>
        {breathOn && !ended ? `Breathe ${phase}` : ''}
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(var(--safe-top) + 22px)', textAlign: 'center',
        color: INK, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', pointerEvents: 'none',
        opacity: breathOn && !ended ? 0.55 : 0, transition: 'opacity .8s ease-out' }}>{cycles} {cycles === 1 ? 'breath' : 'breaths'}</div>
      <div aria-hidden={!ended} style={{ position: 'absolute', inset: 0, background: BG, pointerEvents: 'none',
        opacity: ended ? 0.94 : 0, transition: `opacity ${FADE_S}s ease-in-out`, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: INK, fontSize: 22, fontWeight: 200, letterSpacing: 1, opacity: ended ? 0.7 : 0,
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
        <button type="button" className="sp-btn" aria-label="Mute" aria-pressed={muted} style={iconBtn(false)}
          onClick={() => { poke(); toggleMute() }}>
          <SoundIcon off={muted} />
        </button>
      </div>

      {/* sound controls: minimal pills under the spinner, never a modal, so you can change them mid-spin */}
      <div role="group" aria-label="Sound" onPointerDown={stop}
        onPointerMove={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onPointerCancel={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 'calc(var(--safe-bottom) + 16px)', maxWidth: 420, margin: '0 auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: INK,
          opacity: chrome ? 1 : 0.5, transition: 'opacity .6s ease-out', ['--accent' as string]: ACCENTS[voice] } as React.CSSProperties}>
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
      </div>
    </div>
  )
}
