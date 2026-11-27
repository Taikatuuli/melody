# Melody

A calm, flick-to-spin fidget toy that plays soft notes. Best on a phone, with sound on. No goal, score or fail state. (The app itself is still called Spin.)

Started life as a prototype in [mobile-lab](https://github.com/Taikatuuli/mobile-lab); its full history came with it.

- **Spin it:** flick or drag around the centre. It has inertia and glides to a stop. Every detent plays a soft note.
- **Five instruments**, each with its own sound and shape: Bowl (crescents), Kalimba (thin lines), Marimba (thick bars), Handpan (a rippled ring where the ripple that just sounded is the biggest) and Bass (a ring of soft diamonds).
- **Play several at once:** tap any combination of instruments and each gets its own ring. Touch a ring to spin just that one; each keeps its own speed and notes.
- **Background layers** you can stack: Pad, Sub hum and Vinyl crackle.
- **Record a loop:** capture what you play, then loop it. Pause it, or exit back to the app.
- **Look:** black and white only, dark or light. Remembered on the device.
- **Accessible:** real radio and switch controls, keyboard support (arrow keys spin it), reduced-motion handling, and the audio unlocks on the first tap on iOS.

Everything is synthesised with Web Audio and drawn on a canvas: no audio files, no images, no backend.

## Run

```bash
npm install
npm run dev
```

Vite prints a **Network** URL (for example `http://192.168.x.x:5173`). Open it on your phone on the same Wi-Fi to test real touch and sound. On desktop the app fills the window.

Add `?tune` to the URL for a panel of live sound and animation values, and `?intro` to see the first-run hints again.

## Build

```bash
npm run build
```

Outputs `dist/` with relative paths, so it works on GitHub Pages or any static host. The workflow in `.github/workflows/deploy.yml` publishes `main` to GitHub Pages.

## Next

What's planned is in [TODO.md](TODO.md).
