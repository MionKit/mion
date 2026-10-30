import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {
  CODE_VIEW_KEY,
  STEP_TIPS,
  TOUR_KEY,
  TOUR_STEPS,
  codeCountHint,
  placeCard,
  readCodeView,
  readTourState,
  resultStep,
  runName,
  shouldAutoStart,
  shownCodeView,
  tourStepsFor,
  writePref,
  type PrefStorage,
} from '../../../../container/website/app/playground/tour.ts';
import {operationByKey} from '../../../../container/website/app/playground/operations.ts';

const stage = readFileSync(
  new URL('../../../../container/website/app/components/playground/PlaygroundStage.client.vue', import.meta.url),
  'utf8'
);

function memoryStorage(): PrefStorage {
  const items = new Map<string, string>();
  return {getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value)};
}

const blockedStorage: PrefStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('playground tour state', () => {
  it('auto-starts on a fresh browser and never again once completed or dismissed', () => {
    for (const state of ['completed', 'dismissed'] as const) {
      const storage = memoryStorage();
      expect(shouldAutoStart(readTourState(storage), true, false)).toBe(true);
      writePref(storage, TOUR_KEY, state);
      expect(readTourState(storage)).toBe(state);
      expect(shouldAutoStart(readTourState(storage), true, false)).toBe(false);
    }
  });

  it('waits for the playground to load and never starts over its error state', () => {
    expect(shouldAutoStart(null, false, false)).toBe(false);
    expect(shouldAutoStart(null, true, true)).toBe(false);
  });

  it('reads an unknown stored value as never seen', () => {
    const storage = memoryStorage();
    storage.setItem(TOUR_KEY, 'maybe');
    expect(readTourState(storage)).toBeNull();
  });

  it('never throws when storage is blocked or missing', () => {
    expect(readTourState(blockedStorage)).toBeNull();
    expect(() => writePref(blockedStorage, TOUR_KEY, 'completed')).not.toThrow();
    expect(readTourState(undefined)).toBeNull();
  });

  it('tells the input and result steps with the same words as their hover tips', () => {
    expect(TOUR_STEPS.find((step) => step.target === 'input')?.body).toBe(STEP_TIPS.input);
    expect(TOUR_STEPS.find((step) => step.target === 'run')?.body).toBe(STEP_TIPS.result);
  });

  // No component mounting in this Node suite, so pin the stage's wiring lines as text.
  it('keeps the playground inert under the tour and stores each preference under its own key', () => {
    expect(stage).toContain(':inert="tourOpen"');
    expect(stage).toContain('writePref(browserStorage(), TOUR_KEY, state)');
    expect(stage).toContain('writePref(browserStorage(), CODE_VIEW_KEY, view)');
  });

  it('skips the input step only while the picked function reads no input', () => {
    expect(tourStepsFor(true)).toEqual(TOUR_STEPS);
    expect(tourStepsFor(false).map((step) => step.target)).toEqual(
      TOUR_STEPS.filter((step) => step.target !== 'input').map((step) => step.target)
    );
  });

  // A renamed or removed section must not leave a tour step pointing at nothing.
  it('every tour step targets a data-tour section of the playground', () => {
    for (const step of TOUR_STEPS) expect(stage, step.target).toContain(`data-tour="${step.target}"`);
    expect(new Set(TOUR_STEPS.map((step) => step.target)).size).toBe(TOUR_STEPS.length);
  });
});

describe('playground code view preference', () => {
  it('defaults to the function view and round-trips the full file view', () => {
    const storage = memoryStorage();
    expect(readCodeView(storage)).toBe('function');
    writePref(storage, CODE_VIEW_KEY, 'file');
    expect(readCodeView(storage)).toBe('file');
    writePref(storage, CODE_VIEW_KEY, 'function');
    expect(readCodeView(storage)).toBe('function');
  });

  it('falls back to the function view on an unknown or unreadable value', () => {
    const storage = memoryStorage();
    storage.setItem(CODE_VIEW_KEY, 'everything');
    expect(readCodeView(storage)).toBe('function');
    expect(readCodeView(blockedStorage)).toBe('function');
  });
});

describe('playground card rules', () => {
  it('shows the full file whenever the function ships no factory (getRunType)', () => {
    expect(shownCodeView('function', true)).toBe('function');
    expect(shownCodeView('file', true)).toBe('file');
    expect(shownCodeView('function', false)).toBe('file');
  });

  it('counts what the generated-code view shows', () => {
    expect(codeCountHint('function', 1, 3)).toBe('1 function');
    expect(codeCountHint('file', 1, 3)).toBe('3 modules');
    expect(codeCountHint('function', 0, 2)).toBe('');
  });

  it('numbers the Result card 6, or 5 when the Input card hides', () => {
    expect(resultStep(true)).toBe(6);
    expect(resultStep(false)).toBe(5);
  });

  it('names the Run button after the picked function', () => {
    expect(runName(operationByKey('validate'))).toBe('validate');
    expect(runName(operationByKey('jsonEncoderMutate'))).toBe('toJson');
    expect(runName(operationByKey('graph'))).toBe('getRunType');
  });
});

describe('tour card placement', () => {
  const viewport = {width: 1500, height: 900};
  const card = {width: 340, height: 180};
  const box = (top: number, left: number, bottom: number, right: number) => ({top, left, bottom, right});

  it('goes below a target that leaves room, else above', () => {
    expect(placeCard(box(100, 40, 200, 400), viewport, card)).toEqual({top: '212px', left: '40px'});
    expect(placeCard(box(600, 40, 800, 400), viewport, card)).toEqual({top: '408px', left: '40px'});
  });

  it('goes beside a full-height target: right, else left, else centred at the bottom', () => {
    expect(placeCard(box(80, 20, 880, 500), viewport, card)).toEqual({top: '80px', left: '512px'});
    expect(placeCard(box(80, 1000, 880, 1480), viewport, card)).toEqual({top: '80px', left: '648px'});
    expect(placeCard(box(80, 200, 880, 1300), viewport, card)).toEqual({bottom: '16px', left: '580px'});
  });

  it('keeps the card inside the viewport edges', () => {
    expect(placeCard(box(100, 1400, 200, 1490), viewport, card)).toEqual({top: '212px', left: '1144px'});
  });

  it('is a full-width bottom sheet on a narrow viewport', () => {
    expect(placeCard(box(100, 40, 200, 400), {width: 600, height: 900}, card)).toEqual({
      left: '16px',
      right: '16px',
      bottom: '16px',
    });
  });
});
