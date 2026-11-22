import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// host: true exposes the dev server on your LAN so you can open it on your phone.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true },
})
