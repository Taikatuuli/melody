import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'

type Status = 'overdue' | 'due' | 'paid'
type Invoice = { id: string; client: string; amount: number; status: Status; due: string; reminded?: boolean }

const seed: Invoice[] = [
  { id: 'INV-1042', client: 'Northwind Studio', amount: 2400, status: 'overdue', due: '12 days overdue' },
  { id: 'INV-1043', client: 'Alder & Co', amount: 860, status: 'due', due: 'Due in 3 days' },
  { id: 'INV-1044', client: 'Harbor Coffee', amount: 315.5, status: 'due', due: 'Due in 9 days' },
  { id: 'INV-1041', client: 'Lumen Labs', amount: 5200, status: 'paid', due: 'Paid 2 Nov' },
]

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const color: Record<Status, string> = { overdue: '#d92d20', due: '#b54708', paid: '#067647' }

function Row({ inv, onOpen, onRemind }: { inv: Invoice; onOpen: () => void; onRemind: () => void }) {
  const x = useMotionValue(0)
  const bg = useTransform(x, [-120, 0], ['#3b5bff', 'rgba(59,91,255,0)'])
  const canRemind = inv.status !== 'paid'
  const dragged = useRef(false)
  return (
    <motion.div style={{ background: bg, borderRadius: 16, marginBottom: 8, position: 'relative' }}>
      <span style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', color: '#fff', fontWeight: 600 }}>
        Remind
      </span>
      <motion.div
        style={{ x, position: 'relative', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 16, padding: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 64, touchAction: 'pan-y' }}
        drag={canRemind ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        onDragStart={() => { dragged.current = true }}
        onDragEnd={(_, i) => {
          if (i.offset.x < -100) onRemind()
          setTimeout(() => { dragged.current = false }, 50)
        }}
        onTap={() => { if (!dragged.current) onOpen() }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>{inv.client}</div>
          <div style={{ fontSize: 13, color: inv.reminded ? 'var(--accent)' : color[inv.status] }}>
            {inv.reminded ? 'Reminder sent' : inv.due}
          </div>
        </div>
        <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(inv.amount)}</div>
      </motion.div>
    </motion.div>
  )
}

export default function Invoices() {
  const [list, setList] = useState(seed)
  const [openId, setOpenId] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState(false)
  const open = list.find((i) => i.id === openId)
  const outstanding = list.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0)

  const remind = (id: string) => setList((l) => l.map((i) => (i.id === id ? { ...i, reminded: true } : i)))
  const close = () => { setOpenId(null); setPaying(false); setDone(false) }
  const pay = () => {
    setDone(true)
    setList((l) => l.map((i) => (i.id === openId ? { ...i, status: 'paid', due: 'Paid today' } : i)))
  }

  return (
    <div style={{ padding: '20px 16px' }}>
      <div style={{ color: 'var(--muted)', fontSize: 14 }}>Outstanding</div>
      <div style={{ fontSize: 36, fontWeight: 700, margin: '2px 0 20px', fontVariantNumeric: 'tabular-nums' }}>
        {money(outstanding)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>Swipe left to send a reminder</div>
      {list.map((inv) => (
        <Row key={inv.id} inv={inv} onOpen={() => setOpenId(inv.id)} onRemind={() => remind(inv.id)} />
      ))}

      <AnimatePresence>
        {open && (
          <>
            <motion.div onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)' }} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 340 }}
              drag="y" dragConstraints={{ top: 0 }} dragElastic={0.2}
              onDragEnd={(_, i) => i.offset.y > 100 && close()}
              style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--bg)', color: 'var(--fg)',
                borderRadius: '24px 24px 0 0', padding: 24, paddingBottom: 'calc(24px + var(--safe-bottom))' }}
            >
              <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '-8px auto 16px' }} />
              {done ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    style={{ width: 56, height: 56, borderRadius: 28, background: '#067647', color: '#fff', fontSize: 28,
                      display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>✓</motion.div>
                  <div style={{ fontWeight: 600, fontSize: 18 }}>Payment received</div>
                  <div style={{ color: 'var(--muted)', margin: '4px 0 20px' }}>{money(open.amount)} from {open.client}</div>
                  <button onClick={close} style={btn}>Done</button>
                </div>
              ) : (
                <>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{open.id}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{open.client}</div>
                  <div style={{ fontSize: 32, fontWeight: 700, margin: '8px 0', fontVariantNumeric: 'tabular-nums' }}>{money(open.amount)}</div>
                  <div style={{ color: color[open.status], marginBottom: 20 }}>{open.due}</div>
                  {open.status === 'paid' ? (
                    <button onClick={close} style={{ ...btn, background: 'var(--line)', color: 'var(--fg)' }}>Close</button>
                  ) : paying ? (
                    <>
                      <input inputMode="numeric" placeholder="Card number" style={input} />
                      <button onClick={pay} style={btn}>Pay {money(open.amount)}</button>
                    </>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { remind(open.id); close() }}
                        style={{ ...btn, background: 'var(--line)', color: 'var(--fg)' }}>Remind</button>
                      <button onClick={() => setPaying(true)} style={btn}>Mark paid</button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

const btn: React.CSSProperties = { flex: 1, width: '100%', minHeight: 48, borderRadius: 14, border: 0,
  background: 'var(--accent)', color: '#fff', fontWeight: 600 }
const input: React.CSSProperties = { width: '100%', minHeight: 48, borderRadius: 12, border: '1px solid var(--line)',
  padding: '0 12px', marginBottom: 12, background: 'var(--bg)', color: 'var(--fg)' }
