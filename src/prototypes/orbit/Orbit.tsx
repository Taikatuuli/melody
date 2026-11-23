import { useEffect, useRef, useState } from 'react'

type Ring = { x: number; y: number; r: number }
type Pulse = { x: number; y: number; r: number; t: number; hue: number }
type Trail = { x: number; y: number; t: number }
type Status = 'ready' | 'playing' | 'over'

const hue = (n: number) => (195 + n * 9) % 360
const readBest = () => {
  try { return Number(localStorage.getItem('orbit-best')) || 0 } catch { return 0 }
}
const STARS = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2 }))

export default function Orbit() {
  const wrap = useRef<HTMLDivElement>(null)
  const cvs = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(readBest)
  const [status, setStatus] = useState<Status>('ready')

  const g = useRef({
    W: 0, H: 0, rings: [] as Ring[], idx: 0, mode: 'orbit' as 'orbit' | 'fly',
    ang: Math.PI, dir: 1, rr: 54, px: 0, py: 0, vx: 0, vy: 0, flyT: 0, cam: 0,
    trail: [] as Trail[], pulses: [] as Pulse[], score: 0, status: 'ready' as Status, overAt: 0,
  })

  const gen = () => {
    const s = g.current
    while (s.rings.length < s.idx + 5) {
      const last = s.rings[s.rings.length - 1]
      const r = 34 + Math.random() * 26
      const pad = r + 26
      s.rings.push({ x: pad + Math.random() * (s.W - pad * 2), y: last.y - (175 + Math.random() * 70), r })
    }
  }

  const reset = (play: boolean) => {
    const s = g.current
    s.rings = [{ x: s.W / 2, y: s.H * 0.6, r: 54 }]
    s.idx = 0; s.mode = 'orbit'; s.ang = Math.PI; s.dir = 1; s.rr = 54
    s.trail = []; s.pulses = []; s.score = 0; s.cam = s.rings[0].y - s.H * 0.6
    gen()
    s.status = play ? 'playing' : 'ready'
    setScore(0); setStatus(s.status)
  }

  const launch = () => {
    const s = g.current
    if (s.mode !== 'orbit') return
    const sp = 460
    s.vx = -Math.sin(s.ang) * s.dir * sp
    s.vy = Math.cos(s.ang) * s.dir * sp
    s.mode = 'fly'; s.flyT = 0
    navigator.vibrate?.(8)
  }

  const lose = () => {
    const s = g.current
    s.status = 'over'; s.overAt = performance.now(); setStatus('over')
    s.pulses.push({ x: s.px, y: s.py, r: 4, t: 1, hue: 0 })
    if (s.score > best) {
      setBest(s.score)
      try { localStorage.setItem('orbit-best', String(s.score)) } catch { /* private mode */ }
    }
    navigator.vibrate?.(50)
  }

  const tap = () => {
    const s = g.current
    if (s.status === 'playing') launch()
    else if (performance.now() - s.overAt > 700) reset(true)
  }

  useEffect(() => {
    const s = g.current
    const canvas = cvs.current!, box = wrap.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, last = performance.now(), init = false

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.04); last = now
      const W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr; canvas.height = H * dpr
        s.W = W; s.H = H
        if (!init) { init = true; reset(false) }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // ---- update
      const cur = s.rings[s.idx]
      if (s.status !== 'over') {
        if (s.mode === 'orbit') {
          const lin = 150 + Math.min(s.score * 4, 110)
          if (s.status === 'playing' || s.status === 'ready') s.ang += s.dir * (lin / cur.r) * dt
          s.rr += (cur.r - s.rr) * Math.min(1, dt * 12)
          s.px = cur.x + Math.cos(s.ang) * s.rr
          s.py = cur.y + Math.sin(s.ang) * s.rr
        } else {
          s.px += s.vx * dt; s.py += s.vy * dt; s.flyT += dt
          for (let i = s.idx + 1; i <= s.idx + 2 && i < s.rings.length; i++) {
            const rg = s.rings[i]
            if (Math.hypot(s.px - rg.x, s.py - rg.y) <= rg.r + 8) {
              s.ang = Math.atan2(s.py - rg.y, s.px - rg.x)
              s.rr = Math.hypot(s.px - rg.x, s.py - rg.y)
              s.dir = Math.sign(s.vx * -Math.sin(s.ang) + s.vy * Math.cos(s.ang)) || 1
              s.idx = i; s.mode = 'orbit'; s.score += 1; setScore(s.score)
              s.pulses.push({ x: rg.x, y: rg.y, r: rg.r, t: 1, hue: hue(s.score) })
              gen(); navigator.vibrate?.(12)
              break
            }
          }
          if (s.mode === 'fly' && (s.flyT > 1.5 || s.px < -120 || s.px > W + 120)) lose()
        }
        if (s.status === 'playing' || s.mode === 'orbit') {
          const target = s.rings[s.idx].y - H * 0.6
          s.cam += (target - s.cam) * Math.min(1, dt * 4)
        }
      }
      s.trail.push({ x: s.px, y: s.py, t: 1 })
      s.trail.forEach((p) => { p.t -= dt * 2.4 })
      s.trail = s.trail.filter((p) => p.t > 0)
      s.pulses.forEach((p) => { p.r += 170 * dt; p.t -= dt * 1.6 })
      s.pulses = s.pulses.filter((p) => p.t > 0)

      // ---- draw
      const h = hue(s.score)
      const accent = `hsl(${h} 90% 65%)`
      ctx.fillStyle = '#07070b'; ctx.fillRect(0, 0, W, H)
      STARS.forEach((st) => {
        const y = (((st.y * H - s.cam * 0.25 * st.s) % H) + H) % H
        ctx.fillStyle = `rgba(255,255,255,${0.12 + st.s * 0.12})`
        ctx.fillRect(st.x * W, y, st.s, st.s)
      })
      ctx.save(); ctx.translate(0, -s.cam)
      s.rings.forEach((rg, i) => {
        if (i < s.idx - 1 || rg.y - s.cam > H + 120 || rg.y - s.cam < -120) return
        const isCur = i === s.idx, isNext = i === s.idx + 1
        ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2)
        ctx.lineWidth = isCur ? 2 : 1.5
        ctx.strokeStyle = isCur ? '#fff' : isNext ? accent : 'rgba(255,255,255,0.22)'
        ctx.globalAlpha = i < s.idx ? 0.25 : 1
        ctx.shadowColor = accent; ctx.shadowBlur = isNext ? 18 : isCur ? 10 : 0
        ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0
      })
      s.pulses.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.strokeStyle = p.hue ? `hsl(${p.hue} 90% 70% / ${p.t * 0.7})` : `rgba(255,90,90,${p.t * 0.8})`
        ctx.lineWidth = 2; ctx.stroke()
      })
      if (s.trail.length > 1) {
        for (let i = 1; i < s.trail.length; i++) {
          const a = s.trail[i - 1], b = s.trail[i]
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = `hsl(${h} 90% 70% / ${b.t * 0.8})`; ctx.lineWidth = 1 + b.t * 4; ctx.lineCap = 'round'; ctx.stroke()
        }
      }
      if (s.status !== 'over') {
        ctx.beginPath(); ctx.arc(s.px, s.py, 6.5, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'; ctx.shadowColor = accent; ctx.shadowBlur = 22; ctx.fill(); ctx.shadowBlur = 0
      }
      ctx.restore()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const text: React.CSSProperties = { position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', color: '#fff' }
  return (
    <div ref={wrap} onPointerDown={tap}
      style={{ position: 'fixed', inset: 0, background: '#07070b', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      <canvas ref={cvs} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ ...text, top: 'calc(var(--safe-top) + 20px)', fontSize: 56, fontWeight: 200, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </div>
      {status !== 'playing' && (
        <div style={{ ...text, bottom: 'calc(var(--safe-bottom) + 150px)' }}>
          <div style={{ fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.9 }}>
            {status === 'over' ? 'Lost in space' : 'Orbit'}
          </div>
          <div style={{ fontSize: 13, opacity: 0.5, margin: '8px 0 0' }}>
            {status === 'over' ? `${score} · best ${best}` : 'Tap to release'}
          </div>
        </div>
      )}
    </div>
  )
}
