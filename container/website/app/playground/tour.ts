// tour.ts: the playground's first-visit tour steps and the browser-stored UI preferences.
// Pure (no Vue, no DOM) so the Node test suite can pin it.

// The per-section guidance shown in each numbered badge's tooltip AND as the tour body for that section.
export const STEP_TIPS = {
  source: 'Edit MyType and watch the change flow through to the transformed source and the generated functions.',
  transformed:
    'The transformed code: the generated functions are imported and referenced by a stable type id (one id per type). RunTypes makes the smallest change it can to your original source.',
  generated:
    'The real, ready-to-run code RunTypes generates for your type. This is what actually executes for the function you picked, specialized to your exact shape (no schema walking or reflection at runtime).',
  function: 'Pick one of the functions RunTypes generates from your type, then run it against the input below.',
  input:
    'The value to run the function on. Type any JS value, or generate one from your type: valid data fits it, invalid data breaks it on purpose.',
  result: 'Run the picked function on the input and see what it returns. Ctrl / Cmd + Enter works too.',
} as const;

export interface TourStep {
  // Matches a `data-tour="…"` attribute in PlaygroundStage.client.vue.
  target: string;
  title: string;
  body: string;
  // Skipped while the picked function reads no input (getRunType).
  needsInput?: boolean;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'mode',
    title: 'Pick how you write the type',
    body: 'Write MyType as a plain TypeScript type, or build it with the RT / TF type builders. Both end at the same type.',
  },
  {
    target: 'presets',
    title: 'Start from an example',
    body: 'Load a ready-made type, from a simple object to a recursive tree, then edit it.',
  },
  {target: 'source', title: 'Your source', body: `${STEP_TIPS.source} The hatched lines above and below are read-only.`},
  {target: 'transformed', title: 'What the build changes', body: STEP_TIPS.transformed},
  {
    target: 'generated',
    title: 'The generated code',
    body: `${STEP_TIPS.generated} The switch shows only the generated function, or the full file it lives in.`,
  },
  {target: 'picker', title: 'Pick a function', body: STEP_TIPS.function},
  {target: 'input', title: 'Give it a value', body: STEP_TIPS.input, needsInput: true},
  {target: 'run', title: 'Run it', body: STEP_TIPS.result},
];

export type TourState = 'completed' | 'dismissed';
export type CodeView = 'function' | 'file';

export const TOUR_KEY = 'mion.runtypes.playground.tour';
export const CODE_VIEW_KEY = 'mion.runtypes.playground.codeView';

export type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Storage can be missing or throw (private mode, blocked site data): read as unset, never throw.
function readPref(storage: PrefStorage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePref(storage: PrefStorage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    /* not persisted: the UI still works for this visit */
  }
}

export function readTourState(storage: PrefStorage | undefined): TourState | null {
  const value = readPref(storage, TOUR_KEY);
  return value === 'completed' || value === 'dismissed' ? value : null;
}

// First visit only, once the playground has loaded, never over its error state.
export function shouldAutoStart(state: TourState | null, ready: boolean, failed: boolean): boolean {
  return ready && !failed && state === null;
}

export function tourStepsFor(needsInput: boolean): TourStep[] {
  return TOUR_STEPS.filter((step) => !step.needsInput || needsInput);
}

export function readCodeView(storage: PrefStorage | undefined): CodeView {
  return readPref(storage, CODE_VIEW_KEY) === 'file' ? 'file' : 'function';
}
