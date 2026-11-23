---
name: simulator-check
description: Run a prototype in the iOS Simulator and verify it on a real mobile Safari. Use after building or changing a prototype, or when the user wants to see it on an iPhone.
---

# Simulator check

1. Open the simulator panel first (`attach` on the iOS Simulator tool), then start the dev server in the background: `npm run dev -- --port 5199`.
2. `open_url` to `http://localhost:5199/?r=<n>#/<slug>`. Change `?r=` each time: hash-only changes don't reload, and Safari's first load can come back blank.
3. Screenshot and check: safe areas (nothing under the notch or home indicator), text size, tap target size, dark mode (`set_appearance`).
4. Exercise every interaction. Taps use `tap`. For swipes and drags use `touch_path` with 6+ points and about 40ms between them; a single fast `swipe` may not register as a drag.
5. After each gesture, screenshot and confirm the *state changed* (not just that nothing crashed), and that no unintended tap or sheet fired.
6. Report what you verified and what you did not (e.g. keyboard behaviour, real-device haptics).
7. Leave the dev server running if the user is watching; otherwise stop it.
