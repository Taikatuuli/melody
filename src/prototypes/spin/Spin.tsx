import { useEffect, useRef, useState } from 'react'

const N = 12 // nodes (and detents) on the spinner
const STEP = (Math.PI * 2) / N
const SCALE = [0, 2, 4, 7, 9] // major pentatonic: every combination sounds consonant
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

type AudioBits = { ctx: AudioContext; master: GainNode }

export default function Spin() {
  const wrap = useRef<HTMLDivElement>(null)
  const cvs = useRef<HTMLCanvasElement>(null)
  const audio = useRef<AudioBits | null>(null)
  const [muted, setMuted] = useState(false)
  const [touched, setTouched] = useState(false)

  const s = useRef({
    rot: 0, w: 0.15, dragging: false, lastA: 0, lastT: 0,
    pulse: new Float32Array(N), lastNote: 0, muted: false, W: 0, H: 0,
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

  useEffect(() => {
    const st = s.current
    const canvas = cvs.current!, box = wrap.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, last = performance.now(), t0 = last

    const frame = (now: number) => {
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
        st.w *= Math.exp(-0.42 * dt) // long, soft decay
        if (Math.abs(st.w) < 0.14) st.w = 0.14 * (st.w < 0 ? -1 : 1) // never fully stops: it breathes
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
      const R = base * (1 + 0.035 * Math.sin(time * 0.9)) // breathing
      const hue = (time * 5 + 200) % 360

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.1)
      g.addColorStop(0, `hsl(${hue} 80% 60% / 0.10)`); g.addColorStop(1, 'transparent')
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
  }
  const move = (e: React.PointerEvent) => {
    const st = s.current
    if (!st.dragging) return
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
      if (now - st.lastNote > 70) { st.lastNote = now; note(a1); navigator.vibrate?.(4) }
    }
    st.lastA = a; st.lastT = now
  }
  const up = () => {
    const st = s.current
    st.dragging = false
    if (performance.now() - st.lastT > 90) st.w *= 0.3 // held still before release: no flick
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
        Flick to spin
      </div>
      <button onPointerDown={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        style={{ position: 'absolute', top: 'calc(var(--safe-top) + 12px)', right: 12, width: 44, height: 44, border: 0,
          background: 'transparent', color: '#fff', opacity: 0.55, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>
        {muted ? 'Off' : 'On'}
      </button>
    </div>
  )
}
