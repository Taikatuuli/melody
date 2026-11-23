import { useEffect, useRef, useState } from 'react'

const N = 12 // nodes (and detents) on the spinner
const STEP = (Math.PI * 2) / N
const SCALE = [0, 2, 4, 7, 9] // major pentatonic: every combination sounds consonant
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

type AudioBits = { ctx: AudioContext; master: GainNode }
type Voice = 'bowl' | 'kalimba' | 'marimba' | 'drops'
const VOICES: Voice[] = ['bowl', 'kalimba', 'marimba', 'drops']
type Drone = { x: number; y: number; t0: number; hue: number; gain: GainNode | null; kill: number; at: number; life: number; size: number }
type Timbre = 'warm' | 'choir' | 'bell' | 'breath' | 'sub'
// attack and total life in seconds, envelope peak, orb size and hue shift per timbre
const TIMBRES: Record<Timbre, { at: number; life: number; peak: number; size: number; hue: number }> = {
  warm: { at: 2, life: 16, peak: 0.075, size: 1, hue: 0 },
  choir: { at: 2.5, life: 14, peak: 0.035, size: 1.15, hue: 30 },
  bell: { at: 0.02, life: 9, peak: 0.1, size: 0.85, hue: -40 },
  breath: { at: 3, life: 12, peak: 0.4, size: 1.05, hue: 60 },
  sub: { at: 3, life: 15, peak: 0.14, size: 1.35, hue: -20 },
}

const IN_S = 4, OUT_S = 6 // breath: 4 in, 6 out
const SESSION_S = Number(new URLSearchParams(location.search).get('s')) || 180
const FADE_S = 8
const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const BreatheIcon = () => <svg {...iconProps}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" opacity=".55" /></svg>
const SoundIcon = ({ off }: { off: boolean }) => (
  <svg {...iconProps}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    {off ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <><path d="M15.5 9a4 4 0 010 6" /><path d="M18 6.5a8 8 0 010 11" opacity=".6" /></>}
  </svg>
)
const iconBtn = (on: boolean): React.CSSProperties => ({
  width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, borderRadius: 22, color: '#fff',
  background: on ? 'rgba(255,255,255,0.14)' : 'transparent', transition: 'background .3s, opacity .5s',
})
const CSS = `
.sp-root:focus{outline:none}
.sp-root:focus-visible{outline:2px solid rgba(255,255,255,.5);outline-offset:-4px}
.sp-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
fieldset.sp-fs{border:0;margin:0;padding:0;min-width:0}
.sp-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;padding:0}
.sp-pills{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.sp-pill{position:relative;display:block;cursor:pointer}
.sp-pill::after{content:'';position:absolute;inset:-4px} /* 36px pill, 44px touch target */
.sp-pill input{position:absolute;opacity:0;width:1px;height:1px}
.sp-pill span{display:flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:999px;font-size:13px;letter-spacing:.3px;text-transform:capitalize;color:rgba(255,255,255,.72);background:rgba(12,12,22,.4);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:background .25s,color .25s,border-color .25s}
.sp-pill input:checked + span{background:rgba(255,255,255,.92);color:#0b0b14;border-color:transparent}
.sp-pill.tg input:checked + span{background:rgba(169,180,255,.2);color:#fff;border-color:rgba(169,180,255,.7)}
.sp-pill.tg span::before{content:'';width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.3);transition:background .25s,box-shadow .25s}
.sp-pill.tg input:checked + span::before{background:#a9b4ff;box-shadow:0 0 8px #a9b4ff}
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
  const [chrome, setChrome] = useState(true)
  const [pokeTick, setPokeTick] = useState(0)
  const noiseBuf = useRef<AudioBuffer | null>(null)
  const padRef = useRef<{ gain: GainNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null>(null)
  const noiseRef = useRef<{ gain: GainNode; src: AudioBufferSourceNode } | null>(null)

  const s = useRef({
    rot: 0, w: 0.15, dragging: false, lastA: 0, lastT: 0,
    pulse: new Float32Array(N), lastNote: 0, muted: false, voice: 'bowl' as Voice, lastTimbre: '' as Timbre | '', lastSemi: -1, cyFrac: 0.44, pid: -1, W: 0, H: 0,
    drones: [] as Drone[], hue: 200, breathOn: false, breathT0: 0, ended: false, phase: 'in' as 'in' | 'out',
    down: { x: 0, y: 0, t: 0, moved: false },
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

  const addDrone = (x: number, y: number, hue: number) => {
    const st = s.current, a = audio.current
    // a different timbre and a different note each tap, never the same twice in a row
    const pool = (Object.keys(TIMBRES) as Timbre[]).filter((k) => k !== st.lastTimbre)
    const tb = pool[(Math.random() * pool.length) | 0]; st.lastTimbre = tb
    const { at, life, peak, size, hue: dh } = TIMBRES[tb]
    let semi: number
    do { semi = SCALE[(Math.random() * 5) | 0] + 12 * ((Math.random() * 2) | 0) } while (semi === st.lastSemi)
    st.lastSemi = semi

    let gain: GainNode | null = null
    if (a && !st.muted) {
      const t = a.ctx.currentTime, stopAt = t + life + 0.3
      const base = tb === 'bell' || tb === 'breath' ? 196 : tb === 'sub' ? 65 : 98
      const f = base * 2 ** (semi / 12)
      const env = a.ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(peak, t + at)
      env.gain.exponentialRampToValueAtTime(0.0001, t + life)
      const osc = (type: OscillatorType, freq: number, dest: AudioNode, detune = 0, level = 1) => {
        const o = a.ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune
        if (level !== 1) { const g = a.ctx.createGain(); g.gain.value = level; o.connect(g); g.connect(dest) } else o.connect(dest)
        o.start(t); o.stop(stopAt)
      }
      switch (tb) {
        case 'warm': // two slightly detuned sines: a plain, warm hum
          osc('sine', f, env, -3); osc('sine', f, env, 3)
          break
        case 'choir': { // detuned saws through a low filter: a soft, vowel-like pad
          const lp = a.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7
          lp.connect(env)
          osc('sawtooth', f, lp, -8); osc('sawtooth', f, lp, 0); osc('sawtooth', f, lp, 8)
          break
        }
        case 'bell': // struck bell: inharmonic partials, long ring
          osc('sine', f, env); osc('sine', f * 2.76, env, 0, 0.45); osc('sine', f * 5.4, env, 0, 0.2)
          break
        case 'breath': { // narrow band of noise around the pitch: airy, flute-like
          if (!noiseBuf.current) {
            const buf = a.ctx.createBuffer(1, a.ctx.sampleRate * 2, a.ctx.sampleRate)
            const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
            noiseBuf.current = buf
          }
          const src = a.ctx.createBufferSource(); src.buffer = noiseBuf.current; src.loop = true
          const bp = a.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 14
          const boost = a.ctx.createGain(); boost.gain.value = 8
          src.connect(bp); bp.connect(boost); boost.connect(env); src.start(t); src.stop(stopAt)
          osc('sine', f, env, 0, 0.05)
          break
        }
        case 'sub': { // deep, slowly pulsing: a heartbeat under everything
          const trem = a.ctx.createGain(); trem.gain.value = 0.7; trem.connect(env)
          const lfo = a.ctx.createOscillator(); lfo.frequency.value = 0.3
          const lg = a.ctx.createGain(); lg.gain.value = 0.3
          lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); lfo.stop(stopAt)
          osc('sine', f, trem); osc('sine', f * 2, trem, 0, 0.35) // the upper partial lets phone speakers carry it
          break
        }
      }
      const pan = a.ctx.createStereoPanner?.()
      if (pan) { pan.pan.value = Math.max(-0.8, Math.min(0.8, ((x / (st.W || 1)) * 2 - 1) * 0.8)); env.connect(pan); pan.connect(a.master) }
      else env.connect(a.master)
      gain = env
    }
    st.drones.push({ x, y, t0: performance.now(), hue: (hue + dh + 360) % 360, gain, kill: 0, at, life, size })
    if (st.drones.filter((d) => !d.kill).length > 6) {
      const old = st.drones.find((d) => !d.kill)!
      old.kill = performance.now()
      if (old.gain && a) { const t = a.ctx.currentTime; old.gain.gain.cancelScheduledValues(t); old.gain.gain.setTargetAtTime(0, t, 0.25) }
    }
  }

  const setBreath = (on: boolean) => {
    const st = s.current
    st.breathOn = on; st.ended = false; st.breathT0 = performance.now()
    setBreathOn(on); setEnded(false)
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
        ctx.fillStyle = '#07070b'; ctx.fillRect(0, 0, W, H)
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

      // ---- draw (translucent fill leaves comet trails at speed)
      ctx.fillStyle = 'rgba(7,7,11,0.17)'; ctx.fillRect(0, 0, W, H)
      const cx = W / 2, cy = H * st.cyFrac
      const base = Math.min(W, H) * 0.25
      let b = 0.5 + 0.5 * Math.sin(time * 0.9) // idle breathing
      let breath = 0.035, prog = 0
      if (st.breathOn) {
        const el = (now - st.breathT0) / 1000
        const c = el % (IN_S + OUT_S)
        b = c < IN_S ? ease(c / IN_S) : 1 - ease((c - IN_S) / OUT_S)
        breath = 0.12
        prog = c / (IN_S + OUT_S)
        const ph = c < IN_S ? 'in' : 'out'
        if (ph !== st.phase) { st.phase = ph; setPhase(ph) }
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
      const hue = 245 + 75 * Math.sin(time * 0.06) // drifts teal → indigo → magenta; never muddy greens or yellows
      st.hue = hue

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.1)
      g.addColorStop(0, `hsl(${hue} 80% 60% / ${0.07 + 0.1 * b})`); g.addColorStop(1, 'transparent')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

      for (let k = 1; k <= 3; k++) { // slow outer dust rings, counter-rotating
        const rk = R * (1 + 0.42 * k), n = 14 + k * 8
        const rot = st.rot * (k % 2 ? -0.35 : 0.2) / k
        for (let i = 0; i < n; i++) {
          const ang = rot + (i / n) * Math.PI * 2
          ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rk, cy + Math.sin(ang) * rk, 1.6, 0, Math.PI * 2)
          ctx.fillStyle = `hsl(${hue + k * 20} 70% 75% / ${0.45 - k * 0.1})`; ctx.fill()
        }
      }
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.strokeStyle = `hsl(${hue} 60% 70% / 0.18)`; ctx.lineWidth = 1; ctx.stroke()
      if (st.breathOn && !st.ended) { // progress arc around one full breath cycle
        const a0p = -Math.PI / 2, a1p = a0p + prog * Math.PI * 2, rp = R * 1.14
        ctx.beginPath(); ctx.arc(cx, cy, rp, a0p, a1p)
        ctx.strokeStyle = `hsl(${hue} 85% 78% / 0.55)`; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
        ctx.beginPath(); ctx.arc(cx + Math.cos(a1p) * rp, cy + Math.sin(a1p) * rp, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = `hsl(${hue} 90% 85%)`; ctx.fill()
      }

      st.drones = st.drones.filter((d) => {
        const age = Math.max(0, (now - d.t0) / 1000)
        let env = age < d.at ? age / d.at : Math.max(0, 1 - (age - d.at) / (d.life - d.at))
        if (d.kill) env *= Math.max(0, 1 - (now - d.kill) / 1000)
        if ((age > d.at || d.kill) && env <= 0.001) { d.gain?.disconnect(); return false }
        const r = (16 + 14 * env + 3 * Math.sin(time * 1.3 + d.x)) * d.size
        const og = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r * 2.2)
        og.addColorStop(0, `hsl(${d.hue} 85% 70% / ${0.35 * env})`); og.addColorStop(1, 'transparent')
        ctx.fillStyle = og; ctx.beginPath(); ctx.arc(d.x, d.y, r * 2.2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2)
        ctx.strokeStyle = `hsl(${d.hue} 85% 75% / ${0.55 * env})`; ctx.lineWidth = 1.2; ctx.stroke()
        return true
      })

      for (let i = 0; i < N; i++) {
        const ang = st.rot + i * STEP, p = st.pulse[i]
        const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R
        ctx.beginPath(); ctx.arc(x, y, 6 + p * 7, 0, Math.PI * 2)
        ctx.fillStyle = `hsl(${hue + i * 3} 85% ${68 + p * 22}%)`
        ctx.shadowColor = `hsl(${hue + i * 3} 90% 65%)`; ctx.shadowBlur = 14 + p * 34
        ctx.fill(); ctx.shadowBlur = 0
      }
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()

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
    const r = wrap.current!.getBoundingClientRect()
    st.down = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), moved: false }
    if (st.ended && performance.now() - st.breathT0 > (SESSION_S + 3) * 1000) setBreath(true) // tap to begin again
  }
  const move = (e: React.PointerEvent) => {
    const st = s.current
    if (!st.dragging || e.pointerId !== st.pid) return
    const a = pointerAngle(e), now = performance.now()
    const rc = wrap.current!.getBoundingClientRect()
    if (Math.hypot(e.clientX - rc.left - st.down.x, e.clientY - rc.top - st.down.y) > 12) st.down.moved = true
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
    if (!st.down.moved && now - st.down.t < 500 && !st.ended) {
      addDrone(st.down.x, st.down.y, st.hue) // a tap adds a sustained tone
      return
    }
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
  const hintBottom = 230

  // keyboard access to the spinner itself: arrows spin it, space adds a tone
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    const st = s.current
    poke(); ensureAudio()
    if (e.key === 'ArrowRight') { st.w = Math.min(26, st.w + 3); setTouched(true); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { st.w = Math.max(-26, st.w - 3); setTouched(true); e.preventDefault() }
    else if (e.key === ' ' || e.key === 'Enter') {
      setTouched(true); addDrone(st.W * (0.2 + Math.random() * 0.6), st.H * (0.12 + Math.random() * 0.2), st.hue); e.preventDefault()
    }
  }

  return (
    <div ref={wrap} className="sp-root" tabIndex={0} role="application"
      aria-label="Spinner. Arrow keys spin it. Space adds a tone."
      onKeyDown={onKey} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ position: 'fixed', inset: 0, background: '#07070b', overflow: 'hidden', touchAction: 'none', userSelect: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}>
      <style>{CSS}</style>
      <canvas ref={cvs} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(var(--safe-bottom) + ${hintBottom}px)`, textAlign: 'center',
        color: '#fff', pointerEvents: 'none', opacity: touched ? 0 : 1, transition: 'opacity 1.2s ease-out, bottom .5s' }}>
        <div style={{ fontSize: 22, fontWeight: 200, letterSpacing: 1 }}>Flick to spin</div>
        <div style={{ fontSize: 13, opacity: 0.5, marginTop: 6 }}>Tap anywhere to add a tone</div>
      </div>
      <div role="status" aria-live="polite" style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(var(--safe-bottom) + ${hintBottom}px)`,
        textAlign: 'center', color: '#fff', fontSize: 22, fontWeight: 200, letterSpacing: 1, pointerEvents: 'none',
        opacity: breathOn && !ended ? 0.85 : 0, transition: 'opacity 0.8s ease-out, bottom .5s' }}>
        {breathOn && !ended ? `Breathe ${phase}` : ''}
      </div>
      <div aria-hidden={!ended} style={{ position: 'absolute', inset: 0, background: '#07070b', pointerEvents: 'none',
        opacity: ended ? 0.94 : 0, transition: `opacity ${FADE_S}s ease-in-out`, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: '#fff', fontSize: 22, fontWeight: 200, letterSpacing: 1, opacity: ended ? 0.7 : 0,
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
        style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(var(--safe-bottom) + 100px)', maxWidth: 420, margin: '0 auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#fff',
          opacity: chrome ? 1 : 0.5, transition: 'opacity .6s ease-out' }}>
        {/* choose one: radio pills */}
        <fieldset className="sp-fs">
          <legend className="sp-vh">Instrument</legend>
          <div className="sp-pills">
            {VOICES.map((v) => (
              <label key={v} className="sp-pill">
                <input type="radio" name="voice" value={v} checked={voice === v}
                  onChange={() => { ensureAudio(); setTouched(true); s.current.voice = v; setVoiceState(v); note(7) }} />
                <span>{v}</span>
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
