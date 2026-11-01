import {describe, expect, it} from 'vitest';
// @ts-expect-error untyped .js (the site's tsconfig only exists in its image)
import {aggregateRows, rowMeans} from '../../../container/website/app/utils/benchAggregate.js';

type Status = 'ok' | 'fail' | 'not-supported';
type Cell = number | Status;

function kase(key: string, cells: Record<string, Cell>) {
  const results: Record<string, Record<string, {valid?: number; invalid?: number; mixed?: number; status: Status}>> = {};
  for (const [lib, cell] of Object.entries(cells)) {
    results[lib] = {
      validate: typeof cell === 'number' ? {valid: cell, invalid: cell, mixed: cell, status: 'ok'} : {status: cell},
    };
  }
  return {key, results};
}

const LIBS = ['mion', 'zod', 'typia'];
const valid = (cases: ReturnType<typeof kase>[], lowerBetter = false) => {
  const {values} = rowMeans(cases, LIBS, 'validate', lowerBetter);
  return Object.fromEntries(LIBS.map((lib) => [lib, values[lib].valid]));
};

describe('benchmark scores fill a missing case with the worst result', () => {
  const shared = [kase('A.a', {mion: 400, zod: 100, typia: 200}), kase('A.b', {mion: 900, zod: 100, typia: 300})];

  it('a case only one library runs gives everyone its value, so that library never falls behind for running it', () => {
    const before = valid(shared);
    const after = valid([...shared, kase('A.temporal', {mion: 10, zod: 'not-supported', typia: 'not-supported'})]);
    // the tie pulls the ratio toward 1 (one of three cases is now equal) but never below it
    expect(after.mion / after.zod).toBeCloseTo(Math.pow(before.mion / before.zod, 2 / 3));
    expect(after.mion / after.zod).toBeGreaterThan(1);
    expect(after.mion / after.typia).toBeGreaterThan(1);
  });

  // every library runs A.base, so each one takes part in the row
  const base = kase('A.base', {mion: 100, zod: 100, typia: 100});

  it('a library that skips a case takes the slowest result among those that ran it', () => {
    const means = valid([base, kase('A.a', {mion: 400, zod: 25, typia: 'not-supported'})]);
    expect(means.mion).toBeCloseTo(200);
    expect(means.zod).toBeCloseTo(50);
    expect(means.typia).toBeCloseTo(50);
  });

  it('a failed case counts as not run', () => {
    const means = valid([base, kase('A.a', {mion: 400, zod: 25, typia: 'fail'})]);
    expect(means.typia).toBeCloseTo(50);
  });

  it('a case no library runs drops out', () => {
    const means = valid([...shared, kase('A.none', {mion: 'not-supported', zod: 'not-supported', typia: 'not-supported'})]);
    for (const lib of LIBS) expect(means[lib]).toBeCloseTo(valid(shared)[lib]);
  });

  it('a library that runs no case at all is n-a, never filled', () => {
    expect(valid([kase('A.a', {mion: 400, zod: 100, typia: 'not-supported'})]).typia).toBeNull();
  });

  it('for a lower-is-better count the fill is the HIGHEST value, and zero stays real', () => {
    const means = valid(
      [kase('A.base', {mion: 0, zod: 0, typia: 0}), kase('A.a', {mion: 0, zod: 99, typia: 'not-supported'})],
      true
    );
    expect(means.mion).toBe(0);
    expect(means.zod).toBeCloseTo(9);
    expect(means.typia).toBeCloseTo(9);
  });

  it('a library that runs nothing in one group is still filled there with the slowest result', () => {
    const sections = [
      {key: 'A', label: 'A', cases: shared},
      {key: 'T', label: 'T', cases: [kase('T.x', {mion: 10, zod: 5, typia: 'not-supported'})]},
    ];
    const rows = aggregateRows(sections, LIBS, 'validate');
    const group = rows.find((row: {key: string}) => row.key === 'T');
    const overall = rows.find((row: {key: string}) => row.key === '__overall__');
    expect(group.values.typia.valid).toBeCloseTo(5);
    expect(overall.values.typia.valid).toBeCloseTo(Math.cbrt(200 * 300 * 5));
  });
});
