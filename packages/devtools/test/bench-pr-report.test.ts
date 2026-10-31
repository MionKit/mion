import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
// @ts-expect-error — a plain .mjs script, no types
import {machineDrift, readBenchData, renderReport} from '../../../scripts/website/bench-data/pr-report.mjs';

type Speeds = Record<string, number>;
const metric = (valid: number, invalid: number) => ({valid, invalid, mixed: 0, status: 'ok'});

function benchData(speeds: Record<string, Speeds>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-pr-report-'));
  for (const dataset of ['validation', 'validation-formats']) {
    const cases =
      dataset === 'validation'
        ? Object.entries(speeds).map(([key, byLib]) => ({
            key,
            title: key,
            results: Object.fromEntries(
              Object.entries(byLib).map(([lib, s]) => [lib, {validate: metric(s, s), validationErrors: metric(s, s)}])
            ),
          }))
        : [];
    fs.mkdirSync(path.join(dir, dataset), {recursive: true});
    const sections = [{key: 'OBJECT', label: 'Object', cases}];
    fs.writeFileSync(path.join(dir, dataset, 'index.json'), JSON.stringify({meta: {cpu: 'test cpu'}, sections}));
  }
  return dir;
}

describe('bench-report pull request comment', () => {
  // PR side: machine 10% slower, mion's code twice as fast.
  const live = readBenchData(
    benchData({'OBJECT.a': {mion: 100, typia: 50, zod: 20}, 'OBJECT.b': {mion: 100, typia: 50, zod: 20}})
  );
  const pr = readBenchData(benchData({'OBJECT.a': {mion: 180, typia: 45, zod: 18}, 'OBJECT.b': {mion: 180, typia: 45, zod: 18}}));

  it('takes the machine drift from the other libraries', () => {
    expect(machineDrift(pr, live)).toBeCloseTo(0.9);
  });

  it("divides mion's change by the drift", () => {
    expect(renderReport(pr, live, null)).toContain('| OBJECT | 2.00 | 2.00 | 2.00 | 2.00 |');
  });

  it('ranks mion and compares it head to head on both sides', () => {
    const report = renderReport(pr, live, null);
    expect(report).toContain('| OBJECT | 1/3 → 1/3 |');
    expect(report).toContain('| Get errors, valid, live | 2.00x (2/2) | 5.00x (2/2) |');
    expect(report).toContain('| Get errors, valid, PR | 4.00x (2/2) | 10.00x (2/2) |');
  });

  it('ranks every library, a skipped case counted at the slowest result', () => {
    const skip = {status: 'not-supported'};
    const results = (mion: number, zod: number | null) => ({
      mion: {validate: metric(mion, mion), validationErrors: metric(mion, mion)},
      zod:
        zod === null
          ? {validate: skip, validationErrors: skip}
          : {validate: metric(zod, zod), validationErrors: metric(zod, zod)},
    });
    // zod is 2x mion where both run; mion alone runs the slow case b
    const data = {
      meta: null,
      cases: new Map([
        ['OBJECT.a', {group: 'OBJECT', results: results(100, 200)}],
        ['OBJECT.b', {group: 'OBJECT', results: results(10, null)}],
      ]),
    };
    expect(renderReport(data, data, null)).toContain('| OBJECT | 2/2 → 2/2 |');
  });

  it('refuses a bench-data dir without the validation datasets', () => {
    expect(() => readBenchData(fs.mkdtempSync(path.join(os.tmpdir(), 'bench-pr-report-')))).toThrow(/pr-report: no /);
  });
});
