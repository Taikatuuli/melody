import { useEffect, useRef, useState } from 'react'

const H = 30 // block height
type Block = { x: number; w: number }
type Debris = { x: number; w: number; level: number; fall: number; vy: number }
type Status = 'ready' | 'playing' | 'over'

const readBest = () => {
  try { return Number(localStorage.getItem('stack-best')) || 0 } catch { return 0 }
}
const color = (i: number, l = 58) => `hsl(${(210 + i * 11) % 360} 75% ${l}%)`

export default function Stack() {
  const wrap = useRef<HTMLDivElement>(null)
  const cvs = useRef<HTMLCanvasElement>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(readBest)
  const [status, setStatus] = useState<Status>('ready')
  const [flash, setFlash] = useState('')

  const g = useRef({
    blocks: [] as Block[], debris: [] as Debris[],
    x: 0, w: 0, dir: 1, speed: 200, scroll: 0, status: 'ready' as Status, score: 0, W: 0, overAt: 0,
  })

  const start = () => {
    const s = g.current
    const w0 = s.W * 0.6
    s.blocks = [{ x: (s.W - w0) / 2, w: w0 }]
    s.debris = []; s.score = 0; s.scroll = 0
    s.w = w0; s.x = 0; s.dir = 1; s.speed = 200; s.status = 'playing'
    setScore(0); setStatus('playing'); setFlash('')
  }

  const drop = () => {
    const s = g.current
    const prev = s.blocks[s.blocks.length - 1]
    const level = s.blocks.length
    const left = Math.max(s.x, prev.x)
    const right = Math.min(s.x + s.w, prev.x + prev.w)
    if (right - left <= 0) {
      s.debris.push({ x: s.x, w: s.w, level, fall: 0, vy: 0 })
      s.status = 'over'; s.overAt = performance.now(); setStatus('over')
      if (s.score > best) {
        setBest(s.score)
        try { localStorage.setItem('stack-best', String(s.score)) } catch { /* private mode */ }
      }
      navigator.vibrate?.(60)
      return
    }
    let nx = left, nw = right - left
    if (Math.abs(s.x - prev.x) < 5) { // perfect: snap and keep full width
      nx = prev.x; nw = prev.w
      setFlash('Perfect'); navigator.vibrate?.(10)
      setTimeout(() => setFlash(''), 500)
    } else {
      const cutX = s.x < prev.x ? s.x : right
      s.debris.push({ x: cutX, w: s.w - nw, level, fall: 0, vy: 0 })
    }
    s.blocks.push({ x: nx, w: nw })
    s.score += 1; setScore(s.score)
    s.w = nw
    s.dir = -s.dir
    s.x = s.dir > 0 ? 0 : s.W - nw
    s.speed = Math.min(200 + s.score * 9, 520)
  }

  const tap = () => {
    const s = g.current
    if (s.status === 'playing') drop()
    else if (performance.now() - s.overAt > 700) start() // lockout so a panic-tap doesn't skip the game-over screen
  }

  useEffect(() => {
    const s = g.current
    const canvas = cvs.current!, box = wrap.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, last = performance.now()

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      const W = box.clientWidth, Hh = box.clientHeight, dpr = window.devicePixelRatio || 1
      if (canvas.width !== W * dpr || canvas.height !== Hh * dpr) {
        canvas.width = W * dpr; canvas.height = Hh * dpr
        if (!s.W) { s.w = W * 0.6; s.x = (W - s.w) / 2 }
        s.W = W
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (s.status === 'playing') {
        s.x += s.dir * s.speed * dt
        if (s.x + s.w > W) { s.x = W - s.w; s.dir = -1 }
        if (s.x < 0) { s.x = 0; s.dir = 1 }
      }
      const target = Math.max(0, (s.blocks.length - 7) * H)
      s.scroll += (target - s.scroll) * Math.min(1, dt * 6)

      ctx.fillStyle = getComputedStyle(box).getPropertyValue('--bg') || '#fff'
      ctx.fillRect(0, 0, W, Hh)
      const baseY = Hh - 40 + s.scroll
      const yOf = (level: number) => baseY - (level + 1) * H

      s.blocks.forEach((b, i) => { ctx.fillStyle = color(i); ctx.fillRect(b.x, yOf(i), b.w, H - 2) })
      if (s.status === 'playing') {
        ctx.fillStyle = color(s.blocks.length)
        ctx.fillRect(s.x, yOf(s.blocks.length), s.w, H - 2)
      }
      s.debris = s.debris.filter((d) => yOf(d.level) + d.fall < Hh)
      s.debris.forEach((d) => {
        d.vy += 1800 * dt; d.fall += d.vy * dt
        ctx.fillStyle = color(d.level)
        ctx.globalAlpha = 0.8
        ctx.fillRect(d.x, yOf(d.level) + d.fall, d.w, H - 2)
        ctx.globalAlpha = 1
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const label: React.CSSProperties = { position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }
  return (
    <div ref={wrap} onPointerDown={tap}
      style={{ position: 'relative', height: '100%', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      <canvas ref={cvs} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ ...label, top: 24, fontSize: 64, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
      <div style={{ ...label, top: 100, fontWeight: 700, color: 'var(--accent)' }}>{flash}</div>
      {status !== 'playing' && (
        <div style={{ ...label, top: '32%' }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{status === 'over' ? 'Game over' : 'Stack'}</div>
          <div style={{ color: 'var(--muted)', margin: '6px 0' }}>
            Best {best}
          </div>
          <div style={{ marginTop: 16, fontWeight: 600 }}>Tap to {status === 'over' ? 'play again' : 'start'}</div>
        </div>
      )}
    </div>
  )
}
