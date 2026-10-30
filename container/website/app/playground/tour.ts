// tour.ts: the playground's first-visit tour, its browser-stored UI preferences and the small view rules
// its cards follow. Pure (no Vue, no DOM) so the Node test suite can pin it.
import type {Operation} from './operations.ts';

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

// getRunType ships a data bundle with no factory: only the full file exists.
export function shownCodeView(view: CodeView, hasFactoryView: boolean): CodeView {
  return hasFactoryView ? view : 'file';
}

export function codeCountHint(view: CodeView, factoryCount: number, moduleCount: number): string {
  const count = view === 'function' ? factoryCount : moduleCount;
  if (!count) return '';
  return `${count} ${view === 'function' ? 'function' : 'module'}${count === 1 ? '' : 's'}`;
}

// The Input card hides for a function that reads no input, so the Result card takes its number.
export function resultStep(needsInput: boolean): number {
  return needsInput ? 6 : 5;
}

// The Run button names the picked function; getRunType returns data, so it names the call itself.
export function runName(op: Pick<Operation, 'kind' | 'label' | 'varName'>): string {
  return op.kind === 'graph' ? op.label : op.varName;
}

export type CardPosition = Partial<Record<'top' | 'left' | 'right' | 'bottom', string>>;

const GAP = 12;
const EDGE = 16;
const NARROW_VIEWPORT = 640;

// Places the tour card beside its target: below, above, right, left, else centred at the viewport bottom.
// Below NARROW_VIEWPORT it is a full-width sheet at the bottom.
export function placeCard(
  target: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>,
  viewport: {width: number; height: number},
  card: {width: number; height: number}
): CardPosition {
  const {width: vw, height: vh} = viewport;
  if (vw < NARROW_VIEWPORT) return {left: `${EDGE}px`, right: `${EDGE}px`, bottom: `${EDGE}px`};
  const clampX = (x: number): number => Math.min(Math.max(x, EDGE), vw - card.width - EDGE);
  const clampY = (y: number): number => Math.min(Math.max(y, EDGE), vh - card.height - EDGE);
  if (target.bottom + GAP + card.height <= vh - EDGE) return {top: `${target.bottom + GAP}px`, left: `${clampX(target.left)}px`};
  if (target.top - GAP - card.height >= EDGE) return {top: `${target.top - GAP - card.height}px`, left: `${clampX(target.left)}px`};
  if (target.right + GAP + card.width <= vw - EDGE) return {top: `${clampY(target.top)}px`, left: `${target.right + GAP}px`};
  if (target.left - GAP - card.width >= EDGE) return {top: `${clampY(target.top)}px`, left: `${target.left - GAP - card.width}px`};
  return {bottom: `${EDGE}px`, left: `${(vw - card.width) / 2}px`};
}
