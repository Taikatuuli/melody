import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export default function Hello() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ padding: 20 }}>
      <h2>Starter prototype</h2>
      <button
        onClick={() => setOpen(true)}
        style={{ minHeight: 44, padding: '0 20px', borderRadius: 12, border: 0,
          background: 'var(--accent)', color: '#fff' }}
      >
        Open sheet
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              drag="y" dragConstraints={{ top: 0 }} dragElastic={0.2}
              onDragEnd={(_, i) => i.offset.y > 100 && setOpen(false)}
              style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: 24,
                paddingBottom: 'calc(24px + var(--safe-bottom))', background: 'var(--bg)',
                borderRadius: '24px 24px 0 0' }}
            >
              Drag me down to dismiss.
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
