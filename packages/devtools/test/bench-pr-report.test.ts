// The bench-report pull request comment: drift taken from the other libraries, ranks and head-to-head ratios.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
// @ts-expect-error — a plain .mjs script, no types
import {machineDrift, readBenchData, renderReport} from '../../../scripts/website/bench-data/pr-report.mjs';

type Speeds = Record<string, number>;
const metric = (valid: number, invalid: number) => ({valid, invalid, mixed: 0, status: 'ok'});

// One dataset dir with a single section; every library gets the same speed on both metrics and paths.
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
  // The machine ran 10% slower on the PR side; mion's code doubled its speed.
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

  it('refuses a bench-data dir without the validation datasets', () => {
    expect(() => readBenchData(fs.mkdtempSync(path.join(os.tmpdir(), 'bench-pr-report-')))).toThrow(/pr-report: no /);
  });
});
