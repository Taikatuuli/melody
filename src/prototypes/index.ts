import type { ComponentType } from 'react'
import Hello from './hello/Hello'
import Invoices from './invoices/Invoices'
import Stack from './stack/Stack'
import Orbit from './orbit/Orbit'
import Spin from './spin/Spin'

export type Prototype = { slug: string; title: string; component: ComponentType }

// Add a new prototype: create src/prototypes/<name>/, then register it here.
export const prototypes: Prototype[] = [
  { slug: 'hello', title: 'Hello (starter: bottom sheet)', component: Hello },
  { slug: 'invoices', title: 'Invoices: swipe to remind, pay sheet', component: Invoices },
  { slug: 'stack', title: 'Stack: one-thumb tap game', component: Stack },
  { slug: 'orbit', title: 'Orbit: tap to release, land on the next ring', component: Orbit },
  { slug: 'spin', title: 'Spin: calm fidget spinner with soft notes', component: Spin },
]
