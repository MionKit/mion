import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {
  CODE_VIEW_KEY,
  TOUR_KEY,
  TOUR_STEPS,
  readCodeView,
  readTourState,
  shouldAutoStart,
  tourStepsFor,
  writePref,
  type PrefStorage,
} from '../../../../container/website/app/playground/tour.ts';

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

  it('skips the input step only while the picked function reads no input', () => {
    expect(tourStepsFor(true)).toEqual(TOUR_STEPS);
    expect(tourStepsFor(false).map((step) => step.target)).toEqual(
      TOUR_STEPS.filter((step) => step.target !== 'input').map((step) => step.target)
    );
  });

  // A renamed or removed section must not leave a tour step pointing at nothing.
  it('every tour step targets a data-tour section of the playground', () => {
    const stage = readFileSync(
      new URL('../../../../container/website/app/components/playground/PlaygroundStage.client.vue', import.meta.url),
      'utf8'
    );
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
