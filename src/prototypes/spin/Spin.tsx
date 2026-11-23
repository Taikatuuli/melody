import { useEffect, useRef, useState } from 'react'

const N = 12 // nodes (and detents) on the spinner
const STEP = (Math.PI * 2) / N
const SCALE = [0, 2, 4, 7, 9] // major pentatonic: every combination sounds consonant
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

type AudioBits = { ctx: AudioContext; master: GainNode }
type Drone = { x: number; y: number; t0: number; hue: number; gain: GainNode | null; kill: number }

const IN_S = 4, OUT_S = 6 // breath: 4 in, 6 out
const SESSION_S = Number(new URLSearchParams(location.search).get('s')) || 180
const FADE_S = 8
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

  const s = useRef({
    rot: 0, w: 0.15, dragging: false, lastA: 0, lastT: 0,
    pulse: new Float32Array(N), lastNote: 0, muted: false, W: 0, H: 0,
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
    const now = a.ctx.currentTime
    const d = ((tick % 15) + 15) % 15
    const f = 196 * 2 ** ((SCALE[d % 5] + 12 * Math.floor(d / 5)) / 12)
    const mk = (type: OscillatorType, freq: number, peak: number) => {
      const o = a.ctx.createOscillator(), g = a.ctx.createGain()
      o.type = type; o.frequency.value = freq
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(peak, now + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8)
      o.connect(g); g.connect(a.master); o.start(now); o.stop(now + 1.9)
    }
    mk('sine', f, 0.13); mk('triangle', f * 2, 0.04)
  }

  const addDrone = (x: number, y: number, hue: number) => {
    const st = s.current, a = audio.current
    let gain: GainNode | null = null
    if (a && !st.muted) {
      const t = a.ctx.currentTime
      const semi = SCALE[(Math.random() * 5) | 0] + 12 * ((Math.random() * 2) | 0)
      const f = 98 * 2 ** (semi / 12)
      gain = a.ctx.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.075, t + 2)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 16)
      ;[-3, 3].forEach((c) => {
        const o = a.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = c
        o.connect(gain!); o.start(t); o.stop(t + 16.5)
      })
      gain.connect(a.master)
    }
    st.drones.push({ x, y, t0: performance.now(), hue, gain, kill: 0 })
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
    if (a) a.master.gain.setTargetAtTime(0.9, a.ctx.currentTime, 0.3)
  }

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
        if (now - st.lastNote > 70) { st.lastNote = now; note(a1); navigator.vibrate?.(4) }
      }
      st.pulse.forEach((_, i) => { st.pulse[i] = Math.max(0, st.pulse[i] - dt * 1.6) })

      // ---- draw (translucent fill leaves comet trails at speed)
      ctx.fillStyle = 'rgba(7,7,11,0.17)'; ctx.fillRect(0, 0, W, H)
      const cx = W / 2, cy = H * 0.46
      const base = Math.min(W, H) * 0.25
      let b = 0.5 + 0.5 * Math.sin(time * 0.9) // idle breathing
      let breath = 0.035
      if (st.breathOn) {
        const el = (now - st.breathT0) / 1000
        const c = el % (IN_S + OUT_S)
        b = c < IN_S ? ease(c / IN_S) : 1 - ease((c - IN_S) / OUT_S)
        breath = 0.12
        const ph = c < IN_S ? 'in' : 'out'
        if (ph !== st.phase) { st.phase = ph; setPhase(ph) }
        const a = audio.current
        if (a && !st.ended) a.master.gain.setTargetAtTime(0.55 + 0.45 * b, a.ctx.currentTime, 0.25) // sound swells with the breath
        if (!st.ended && el > SESSION_S) {
          st.ended = true; setEnded(true)
          if (a) a.master.gain.setTargetAtTime(0, a.ctx.currentTime, FADE_S / 4)
        }
      }
      const R = base * (1 + breath * (b - 0.5) * 2)
      const hue = (time * 5 + 200) % 360
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

      st.drones = st.drones.filter((d) => {
        const age = Math.max(0, (now - d.t0) / 1000)
        let env = age < 2 ? age / 2 : Math.max(0, 1 - (age - 2) / 14)
        if (d.kill) env *= Math.max(0, 1 - (now - d.kill) / 1000)
        if ((age > 2 || d.kill) && env <= 0.001) { d.gain?.disconnect(); return false }
        const r = 16 + 14 * env + 3 * Math.sin(time * 1.3 + d.x)
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
        ctx.fillStyle = `hsl(${hue + i * 7} 85% ${68 + p * 22}%)`
        ctx.shadowColor = `hsl(${hue + i * 7} 90% 65%)`; ctx.shadowBlur = 14 + p * 34
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
    return Math.atan2(e.clientY - (r.top + s.current.H * 0.46), e.clientX - (r.left + s.current.W / 2))
  }
  const down = (e: React.PointerEvent) => {
    ensureAudio(); setTouched(true)
    const st = s.current
    wrap.current!.setPointerCapture(e.pointerId)
    st.dragging = true; st.lastA = pointerAngle(e); st.lastT = performance.now()
    const r = wrap.current!.getBoundingClientRect()
    st.down = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), moved: false }
    if (st.ended && performance.now() - st.breathT0 > (SESSION_S + 3) * 1000) setBreath(true) // tap to begin again
  }
  const move = (e: React.PointerEvent) => {
    const st = s.current
    if (!st.dragging) return
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
      if (now - st.lastNote > 70) { st.lastNote = now; note(a1); navigator.vibrate?.(4) }
    }
    st.lastA = a; st.lastT = now
  }
  const up = () => {
    const st = s.current
    if (!st.dragging) return // e.g. release after pressing a button
    st.dragging = false
    const now = performance.now()
    if (!st.down.moved && now - st.down.t < 500 && !st.ended) {
      addDrone(st.down.x, st.down.y, st.hue) // a tap adds a sustained tone
      return
    }
    if (now - st.lastT > 90) st.w *= 0.3 // held still before release: no flick
  }

  const toggleMute = (e: React.PointerEvent) => {
    e.stopPropagation()
    const m = !s.current.muted
    s.current.muted = m; setMuted(m)
  }

  return (
    <div ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ position: 'fixed', inset: 0, background: '#07070b', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      <canvas ref={cvs} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--safe-bottom) + 150px)', textAlign: 'center',
        color: '#fff', fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', pointerEvents: 'none',
        opacity: touched ? 0 : 0.55, transition: 'opacity 1.2s ease-out' }}>
        Flick to spin<div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.7, marginTop: 8 }}>Tap to add a tone</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(var(--safe-bottom) + 150px)', textAlign: 'center',
        color: '#fff', fontSize: 15, letterSpacing: 5, textTransform: 'uppercase', pointerEvents: 'none',
        opacity: breathOn && !ended ? 0.7 : 0, transition: 'opacity 0.8s ease-out' }}>
        Breathe {phase}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: '#07070b', pointerEvents: 'none',
        opacity: ended ? 0.94 : 0, transition: `opacity ${FADE_S}s ease-in-out`, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: '#fff', fontSize: 13, letterSpacing: 6, textTransform: 'uppercase', opacity: ended ? 0.6 : 0,
          transition: `opacity ${FADE_S}s ease-in-out` }}>Rest · tap to continue</div>
      </div>
      <button onPointerDown={(e) => { e.stopPropagation(); ensureAudio(); setTouched(true); setBreath(!s.current.breathOn) }}
        aria-pressed={breathOn}
        style={{ position: 'absolute', top: 'calc(var(--safe-top) + 12px)', left: 12, height: 44, padding: '0 8px', border: 0,
          background: 'transparent', color: '#fff', opacity: breathOn ? 0.95 : 0.55, fontSize: 12, letterSpacing: 1.5,
          textTransform: 'uppercase' }}>
        Breathe
      </button>
      <button onPointerDown={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        style={{ position: 'absolute', top: 'calc(var(--safe-top) + 12px)', right: 12, width: 44, height: 44, border: 0,
          background: 'transparent', color: '#fff', opacity: 0.55, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>
        {muted ? 'Off' : 'On'}
      </button>
    </div>
  )
}
