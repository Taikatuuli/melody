import { useState } from 'react'
import { createPortal } from 'react-dom'
import { TUNE, TUNE_DEFS } from './tune'

const KEY = 'spin-tune'
const stop = (e: React.SyntheticEvent) => e.stopPropagation() // never spin the ring while using the panel

// A throwaway control panel for the spinner's feel. Only mounted when the page is opened with ?tune.
export default function TunePanel() {
  const [, redraw] = useState(() => { // restore the last session's values
    try { Object.assign(TUNE, JSON.parse(localStorage.getItem(KEY) || '{}')) } catch { /* ignore */ }
    return 0
  })
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(TUNE)) } catch { /* ignore */ } redraw((n) => n + 1) }
  const reset = () => { for (const d of TUNE_DEFS) TUNE[d.key] = d.value; save() }
  const copy = async () => {
    const changed = Object.fromEntries(TUNE_DEFS.filter((d) => TUNE[d.key] !== d.value).map((d) => [d.key, TUNE[d.key]]))
    try { await navigator.clipboard.writeText(JSON.stringify(changed, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* ignore */ }
  }

  // on a wide screen (the phone frame on desktop) the panel floats beside the device, in the page itself, so nothing is cropped; on a real phone it stays over the screen
  const wide = typeof matchMedia !== 'undefined' && matchMedia('(min-width: 480px)').matches
  const panel = (
    <div onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} onPointerCancel={stop}
      style={{ position: wide ? 'fixed' : 'absolute', top: wide ? 12 : 'calc(var(--safe-top) + 8px)', left: wide ? 12 : 8, width: wide ? 280 : 240, maxHeight: wide ? 'calc(100vh - 24px)' : '70%', overflow: 'auto', zIndex: wide ? 1000 : 5,
        font: '12px/1.3 -apple-system, system-ui, sans-serif', color: wide ? '#161616' : 'var(--ink)', background: wide ? '#f6f6f4' : 'var(--pill)', border: wide ? '1px solid #d4d4d0' : '1px solid var(--pillb)', boxShadow: wide ? '0 4px 24px rgba(0,0,0,.12)' : undefined, borderRadius: 14, padding: 10, touchAction: 'pan-y' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button type="button" onClick={() => setOpen(!open)} style={btn}>{open ? 'Tune ▾' : 'Tune ▸'}</button>
        {open && <><button type="button" onClick={reset} style={btn}>Reset</button>
          <button type="button" onClick={copy} style={btn}>{copied ? 'Copied' : 'Copy'}</button></>}
      </div>
      {open && TUNE_DEFS.map((d) => (
        <label key={d.key} style={{ display: 'block', marginTop: 10 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ fontWeight: 600 }}>{d.label}</b><span>{TUNE[d.key]}</span></span>
          <input type="range" min={d.min} max={d.max} step={d.step} value={TUNE[d.key]} style={{ width: '100%', touchAction: 'none' }}
            onChange={(e) => { TUNE[d.key] = Number(e.target.value); save() }} />
          <span style={{ opacity: 0.7 }}>{d.hint}</span>
        </label>
      ))}
    </div>
  )
  return wide ? createPortal(panel, document.body) : panel
}
const btn: React.CSSProperties = { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: 999, padding: '4px 10px', minHeight: 28 }
