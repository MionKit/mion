import {afterEach, describe, expect, it, vi} from 'vitest';
import {arm, pause, play, reset} from '../player.ts';

// The player only touches classList (and offsetWidth for the restart), so a Set stands in for an element.
const card = () => {
  const classes = new Set<string>();
  const classList = {
    add: (...names: string[]) => names.forEach((name) => classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
    contains: (name: string) => classes.has(name),
  };
  return {element: {classList, offsetWidth: 0} as unknown as Element, classes};
};
const reducedMotion = (on: boolean) => vi.stubGlobal('matchMedia', () => ({matches: on}));

describe('code card player', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('arm, play, pause, reset toggle the animation classes', () => {
    reducedMotion(false);
    const {element, classes} = card();
    play(element);
    expect([...classes]).toEqual([]);
    expect(arm(element)).toBe(true);
    play(element);
    expect([...classes].sort()).toEqual(['cc-armed', 'cc-play']);
    pause(element);
    expect(classes.has('cc-paused')).toBe(true);
    play(element);
    expect(classes.has('cc-paused')).toBe(false);
    reset(element);
    expect([...classes]).toEqual(['cc-armed']);
  });

  it('never arms under reduced motion, so the card stays drawn in full', () => {
    reducedMotion(true);
    const {element, classes} = card();
    expect(arm(element)).toBe(false);
    play(element);
    expect([...classes]).toEqual([]);
  });
});
