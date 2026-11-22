import type { ComponentType } from 'react'
import Hello from './hello/Hello'

export type Prototype = { slug: string; title: string; component: ComponentType }

// Add a new prototype: create src/prototypes/<name>/, then register it here.
export const prototypes: Prototype[] = [
  { slug: 'hello', title: 'Hello (starter: bottom sheet)', component: Hello },
]
