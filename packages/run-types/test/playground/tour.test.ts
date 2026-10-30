import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {
  CODE_VIEW_KEY,
  TOUR_KEY,
  TOUR_STEPS,
  readCodeView,
  readTourState,
  shouldAutoStart,
  writeCodeView,
  writeTourState,
} from '../../../../container/website/app/playground/tour.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return {getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value)};
}

const blockedStorage: Pick<Storage, 'getItem' | 'setItem'> = {
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
      expect(shouldAutoStart(readTourState(storage))).toBe(true);
      writeTourState(storage, state);
      expect(storage.getItem(TOUR_KEY)).toBe(state);
      expect(shouldAutoStart(readTourState(storage))).toBe(false);
    }
  });

  it('reads an unknown stored value as never seen', () => {
    const storage = memoryStorage();
    storage.setItem(TOUR_KEY, 'maybe');
    expect(shouldAutoStart(readTourState(storage))).toBe(true);
  });

  it('never throws when storage is blocked or missing', () => {
    expect(shouldAutoStart(readTourState(blockedStorage))).toBe(true);
    expect(() => writeTourState(blockedStorage, 'completed')).not.toThrow();
    expect(shouldAutoStart(readTourState(undefined))).toBe(true);
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
    writeCodeView(storage, 'file');
    expect(storage.getItem(CODE_VIEW_KEY)).toBe('file');
    expect(readCodeView(storage)).toBe('file');
    writeCodeView(storage, 'function');
    expect(readCodeView(storage)).toBe('function');
  });

  it('falls back to the function view on an unknown or unreadable value', () => {
    const storage = memoryStorage();
    storage.setItem(CODE_VIEW_KEY, 'everything');
    expect(readCodeView(storage)).toBe('function');
    expect(readCodeView(blockedStorage)).toBe('function');
    expect(() => writeCodeView(blockedStorage, 'file')).not.toThrow();
  });
});
