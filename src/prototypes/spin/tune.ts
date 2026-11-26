// The numbers that decide how the spinner feels. Spin.tsx reads TUNE live, so the Tune panel (open the page with ?tune) can move them mid-spin.
export type TuneDef = { key: string; label: string; hint: string; min: number; max: number; step: number; value: number }

export const TUNE_DEFS = [
  { key: 'decay', label: 'Decay', hint: 'how fast it slows (per second). Lower = glides longer', min: 0.05, max: 2, step: 0.01, value: 1.13 },
  { key: 'drift', label: 'Idle drift', hint: 'the slowest it ever turns (rad/s)', min: 0, max: 0.6, step: 0.01, value: 0 },
  { key: 'maxW', label: 'Max speed', hint: 'speed cap (rad/s)', min: 6, max: 60, step: 1, value: 16 },
  { key: 'flick', label: 'Flick gain', hint: 'how much of your latest finger speed carries into the spin', min: 0.1, max: 1, step: 0.05, value: 0.25 },
  { key: 'holdMs', label: 'Hold to stop', hint: 'ms held still before release that cancels the flick', min: 30, max: 300, step: 10, value: 90 },
  { key: 'gapMin', label: 'Note gap', hint: 'shortest ms between notes (slow spin)', min: 30, max: 200, step: 5, value: 80 },
  { key: 'gapPerSpeed', label: 'Gap per speed', hint: 'extra ms between notes per rad/s of speed', min: 0, max: 40, step: 1, value: 14 },
  { key: 'gapSpread', label: 'Gap ceiling', hint: 'most extra ms the speed can add', min: 0, max: 600, step: 10, value: 230 },
  { key: 'echoMin', label: 'Echo (slow)', hint: 'echo feedback once nearly still', min: 0, max: 0.5, step: 0.01, value: 0.1 },
  { key: 'echoSpan', label: 'Echo (fast)', hint: 'extra echo feedback at full speed', min: 0, max: 0.5, step: 0.01, value: 0.2 },
  { key: 'panAmount', label: 'Pan', hint: 'Drops and Handpan: how far a sound sits left or right of where its dot or crest is (0 = centred)', min: 0, max: 1, step: 0.05, value: 0.8 },
  { key: 'dropDecay', label: 'Bass decay', hint: 'bass: seconds the Drops note rings (x1.8 in the sound)', min: 0.15, max: 1.5, step: 0.01, value: 1.1 },
  { key: 'rippleAttack', label: 'Handpan swell', hint: 'seconds for a Handpan pluck to bloom (small = crisp, large = soft)', min: 0.002, max: 0.12, step: 0.002, value: 0.006 },
  { key: 'voiceBand', label: 'Pitch bands', hint: 'several rings: how far apart the instruments sit in pitch (Bowl low, Handpan high). 0 = all the same, 1 = full', min: 0, max: 1.5, step: 0.05, value: 1 },
  { key: 'bandMode', label: 'Pitch order', hint: 'several rings: 0 = by instrument (Bowl low, Handpan high); 1 = biggest ring highest, smallest lowest; 2 = biggest ring lowest', min: 0, max: 2, step: 1, value: 1 },
  { key: 'bowlDots', label: 'Outer Bowl count', hint: 'several rings: how many crescents the Bowl has when it is the biggest ring (24 = same as the others)', min: 24, max: 72, step: 6, value: 48 },
  { key: 'bowlBed', label: 'Bowl bed', hint: 'several rings: Bowl level as a soft, slow bed under the rest (1 = as loud as alone)', min: 0.2, max: 1, step: 0.05, value: 0.7 },
  { key: 'echoThin', label: 'Thin tails', hint: 'several rings: how much shorter and quieter Handpan, Drops and Bowl tails get with three or more rings (0 = none)', min: 0, max: 0.8, step: 0.05, value: 0.5 },
  { key: 'stagger', label: 'Stagger', hint: 'several rings: how much each instrument runs faster or slower than the others so notes interlock (0 = same pace)', min: 0, max: 1.5, step: 0.05, value: 1 },
  { key: 'maxNotes', label: 'Max notes', hint: 'several rings: most notes ringing at once; past this the newest is skipped', min: 4, max: 24, step: 1, value: 7 },
  { key: 'crowd', label: 'Crowd trim', hint: 'several rings: how much quieter each note gets as more rings play (0 = none)', min: 0, max: 1, step: 0.05, value: 0.7 },
  { key: 'ringPan', label: 'Ring spread', hint: 'several rings: how far neighbouring rings sit left and right of each other', min: 0, max: 1, step: 0.05, value: 0.35 },
  { key: 'popSize', label: 'Pop size', hint: 'how much a shape grows when it sounds (the top is a bit under this)', min: 0, max: 1.5, step: 0.05, value: 0.75 },
  { key: 'popHold', label: 'Pop hold', hint: 'ms the spring is pushed up before it lets go (short = soft touch, long = reaches the full size)', min: 0, max: 150, step: 5, value: 45 },
  { key: 'popSettle', label: 'Pop settle', hint: 'seconds the spring takes to come back to rest (small = snappy)', min: 0.08, max: 0.8, step: 0.01, value: 0.52 },
  { key: 'popBounce', label: 'Pop bounce', hint: '0 = no overshoot; higher = it dips below its normal size once before settling', min: 0, max: 0.6, step: 0.01, value: 0.2 },
  { key: 'popTilt', label: 'Pop tilt', hint: 'radians Kalimba tips as it pops (0 = no tilt)', min: 0, max: 1, step: 0.05, value: 0.7 },
  { key: 'haptic', label: 'Haptic', hint: 'vibration ms per detent (Android only; 0 = off)', min: 0, max: 20, step: 1, value: 4 },
] as const satisfies readonly TuneDef[]

export type TuneKey = (typeof TUNE_DEFS)[number]['key']
export const TUNE = Object.fromEntries(TUNE_DEFS.map((d) => [d.key, d.value])) as Record<TuneKey, number>
export const TUNING = typeof location !== 'undefined' && new URLSearchParams(location.search).has('tune')
