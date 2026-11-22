# mobile-lab

A fast sandbox for prototyping mobile experiences. Vite + React + TypeScript + Framer Motion.

## Run

```bash
npm install
npm run dev
```

Vite prints a **Network** URL (e.g. `http://192.168.x.x:5173`). Open it on your phone (same Wi-Fi) to test real touch, safe areas and keyboard behavior. On desktop, prototypes render inside a phone-sized frame.

## Add a prototype

1. Create `src/prototypes/<name>/<Name>.tsx` with a default-exported component.
2. Register it in `src/prototypes/index.ts`.
3. Open `#/<slug>`.

## Mobile defaults baked in

- `viewport-fit=cover` + safe-area CSS variables (`--safe-top`, `--safe-bottom`)
- 16px inputs (no iOS focus zoom), `100dvh`, no tap-highlight flash, no overscroll bounce
- `touch-action: manipulation`, 44px tap targets, hover only on hover-capable devices
- Dark mode via `prefers-color-scheme`

## Deploy

`npm run build` outputs `dist/` with relative paths, so it works on GitHub Pages or any static host.
