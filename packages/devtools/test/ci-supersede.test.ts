// Which older CI runs a new run keeps (scripts/ci/supersede.mjs). A wrong keep is harmless (waiters re-decide);
// a wrong defer waits on work nobody does, a wrong cancel throws away work the commit never touched.
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
// @ts-expect-error — a plain .mjs repo script, no types.
import {deferredKeys, liveKeys, main, supersede, waitForRun} from '../../../scripts/ci/supersede.mjs';
// @ts-expect-error — a plain .mjs repo script, no types.
import {greenKey} from '../../../scripts/ci/lanes.mjs';

type Item = {run: boolean; hash: string; deferredTo?: number};
type Verdict = {run: boolean; hash: string; items?: Record<string, Item>; runItems?: string[]; deferredTo?: number};
type Decision = {lanes: Record<string, Verdict>; labels: string[]; baseRef?: string};
type Older = {runId: number; decision: Decision | null};

const ci = (hashes: Partial<Record<'go' | 'js' | 'js-fuzz', string>> = {}, run = true): Decision => ({
  lanes: {
    go: {run, hash: hashes.go ?? 'g1'},
    'js-fuzz': {run, hash: hashes['js-fuzz'] ?? 'f1'},
    js: {run, hash: hashes.js ?? 'j1'},
  },
  labels: [],
});
const benchLane = (hashes: Record<string, string>, runItems: string[]): Verdict => ({
  run: runItems.length > 0,
  hash: 'b',
  runItems,
  items: Object.fromEntries(Object.entries(hashes).map(([item, hash]) => [item, {run: runItems.includes(item), hash}])),
});
const bench = (hashes: Record<string, string>, runItems: string[], labels = ['bench']): Decision => ({
  lanes: {bench: benchLane(hashes, runItems)},
  labels,
});

describe('supersede', () => {
  it('keeps an older run whose every live lane is unchanged, and defers those lanes to it', () => {
    const plan = supersede({ours: ci(), older: [{runId: 7, decision: ci()}]});
    expect(plan).toMatchObject({keep: [7], cancel: [], deferred: {go: 7, 'js-fuzz': 7, js: 7}});
    expect(plan.lanes.go).toMatchObject({run: true, deferredTo: 7});
  });

  it('cancels an older run when one lane it is running changed', () => {
    const plan = supersede({ours: ci({js: 'j2'}), older: [{runId: 7, decision: ci()}]});
    expect(plan).toMatchObject({keep: [], cancel: [7], deferred: {}, reasons: {7: 'this commit changes js'}});
    expect(plan.lanes.go.deferredTo).toBeUndefined();
  });

  it('cancels every older run when this run carries skip-defaults, so the label still stops running jobs', () => {
    const ours = {...ci(), labels: ['skip-defaults']};
    expect(supersede({ours, older: [{runId: 7, decision: ci()}]})).toMatchObject({keep: [], cancel: [7]});
  });

  // pr-heavy starts a run for the skip-defaults label event too; its benchmark is not one of the defaults.
  it('keeps an older run of lanes skip-defaults does not turn off', () => {
    const plan = supersede({
      ours: bench({mion: 'm'}, ['mion'], ['bench', 'skip-defaults']),
      older: [{runId: 7, decision: bench({mion: 'm'}, ['mion'])}],
    });
    expect(plan).toMatchObject({keep: [7], cancel: [], deferred: {'bench.mion': 7}});
  });

  // A comment-only commit changes only the raw lanes' hashes; the code lanes keep waiting on the older run.
  it('keeps an older run when only a raw lane changed, defers the code lanes and reruns the raw one here', () => {
    const withStatic = (staticHash: string, hashes = {}): Decision => {
      const decision = ci(hashes);
      return {...decision, lanes: {...decision.lanes, 'js-static': {run: true, hash: staticHash}}};
    };
    const plan = supersede({ours: withStatic('s2'), older: [{runId: 7, decision: withStatic('s1')}]});
    expect(plan).toMatchObject({keep: [7], cancel: [], deferred: {go: 7, 'js-fuzz': 7, js: 7}});
    expect(plan.lanes['js-static']).toEqual({run: true, hash: 's2'});
    const codeToo = supersede({ours: withStatic('s2', {js: 'j2'}), older: [{runId: 7, decision: withStatic('s1')}]});
    expect(codeToo).toMatchObject({keep: [], cancel: [7], reasons: {7: 'this commit changes js'}});
  });

  it('cancels an older run of only a changed raw lane: nothing waits on it', () => {
    const only = (hash: string): Decision => ({lanes: {'js-static': {run: true, hash}}, labels: []});
    expect(supersede({ours: only('s2'), older: [{runId: 7, decision: only('s1')}]})).toMatchObject({keep: [], cancel: [7]});
  });

  // A comment-only commit changes only the raw lanes' hashes; the code lanes keep waiting on the older run.
  it('keeps an older run when only a raw lane changed, defers the code lanes and reruns the raw one here', () => {
    const withStatic = (staticHash: string, hashes = {}): Decision => {
      const decision = ci(hashes);
      return {...decision, lanes: {...decision.lanes, 'js-static': {run: true, hash: staticHash}}};
    };
    const plan = supersede({ours: withStatic('s2'), older: [{runId: 7, decision: withStatic('s1')}]});
    expect(plan).toMatchObject({keep: [7], cancel: [], deferred: {go: 7, 'js-fuzz': 7, js: 7}});
    expect(plan.lanes['js-static']).toEqual({run: true, hash: 's2'});
    const codeToo = supersede({ours: withStatic('s2', {js: 'j2'}), older: [{runId: 7, decision: withStatic('s1')}]});
    expect(codeToo).toMatchObject({keep: [], cancel: [7], reasons: {7: 'this commit changes js'}});
  });

  it('cancels an older run of only a changed raw lane: nothing waits on it', () => {
    const only = (hash: string): Decision => ({lanes: {'js-static': {run: true, hash}}, labels: []});
    expect(supersede({ours: only('s2'), older: [{runId: 7, decision: only('s1')}]})).toMatchObject({keep: [], cancel: [7]});
  });

  it('cancels an older run whose gate has not decided yet', () => {
    expect(supersede({ours: ci(), older: [{runId: 7, decision: null}]})).toMatchObject({keep: [], cancel: [7]});
  });

  it('cancels an older run that is running nothing', () => {
    expect(supersede({ours: ci(), older: [{runId: 7, decision: ci({}, false)}]})).toMatchObject({keep: [], cancel: [7]});
  });

  it('ignores a lane whose label was off in the older run: it neither blocks the keep nor gets deferred', () => {
    const older: Decision = {
      lanes: {website: {run: true, hash: 'w1'}, bench: benchLane({mion: 'm'}, ['mion'])},
      labels: ['bench'],
    };
    const ours: Decision = {
      lanes: {website: {run: true, hash: 'w2'}, bench: benchLane({mion: 'm'}, ['mion'])},
      labels: ['bench', 'website'],
    };
    const plan = supersede({ours, older: [{runId: 3, decision: older}]});
    expect(plan.keep).toEqual([3]);
    expect(plan.deferred).toEqual({'bench.mion': 3});
    expect(plan.lanes.website.deferredTo).toBeUndefined();
  });

  it('defers per item, and compares only the items the older run is running', () => {
    const plan = supersede({
      ours: bench({mion: 'm1', zod: 'z2'}, ['mion', 'zod']),
      older: [{runId: 4, decision: bench({mion: 'm1', zod: 'z1'}, ['mion'])}],
    });
    expect(plan.deferred).toEqual({'bench.mion': 4});
    expect(plan.lanes.bench.items.mion.deferredTo).toBe(4);
    expect(plan.lanes.bench.items.zod.deferredTo).toBeUndefined();
    expect(plan.lanes.bench.deferredTo).toBe(4);
  });

  it('cancels a newer unchanged run whose lanes all wait on an older one already', () => {
    expect(
      supersede({
        ours: ci(),
        older: [
          {runId: 9, decision: ci()},
          {runId: 5, decision: ci()},
        ],
      })
    ).toMatchObject({
      keep: [5],
      cancel: [9],
      reasons: {9: 'nothing it runs is still needed here'},
    });
  });

  // A label added mid-run, then a docs commit: the label's run builds the site, the first run the benchmark.
  it('keeps two unchanged runs when each runs a lane the other does not, and defers each lane to its own', () => {
    const first: Decision = {
      lanes: {website: {run: true, hash: 'w'}, bench: benchLane({mion: 'm'}, ['mion'])},
      labels: ['bench'],
    };
    const second: Decision = {...first, labels: ['bench', 'website']};
    const plan = supersede({
      ours: second,
      older: [
        {runId: 2, decision: second},
        {runId: 1, decision: first},
      ],
    });
    expect(plan.keep).toEqual([1, 2]);
    expect(plan.deferred).toEqual({'bench.mion': 1, website: 2});
    expect(plan.lanes.website.deferredTo).toBe(2);
  });

  it('counts drizzle as live on a pull request into prod, label or not', () => {
    const drizzle = (baseRef: string): Decision => ({
      lanes: {drizzle: {run: true, hash: 'd', runItems: ['pg'], items: {pg: {run: true, hash: 'p'}}}},
      labels: [],
      baseRef,
    });
    expect(liveKeys(drizzle('prod')).has('drizzle.pg')).toBe(true);
    expect(liveKeys(drizzle('main')).has('drizzle.pg')).toBe(false);
  });

  // Seeded, so a failure replays.
  it('only ever defers an unchanged live lane to a kept run, and only cancels for a reason', () => {
    let seed = 42;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <Value>(values: Value[]): Value => values[Math.floor(random() * values.length)];
    const decision = (): Decision => ({
      lanes: Object.fromEntries(
        (['go', 'js-fuzz', 'js', 'js-static'] as const).map((lane) => [lane, {run: random() < 0.7, hash: pick(['a', 'b'])}])
      ),
      labels: random() < 0.1 ? ['skip-defaults'] : [],
    });
    for (let round = 0; round < 500; round++) {
      const ours = decision();
      const older: Older[] = [1, 2, 3].map((runId) => ({runId, decision: random() < 0.15 ? null : decision()}));
      const plan = supersede({ours, older});
      const runOf = (runId: number) => older.find((run) => run.runId === runId) as Older;
      for (const [key, runId] of Object.entries(plan.deferred) as [string, number][]) {
        expect(plan.keep).toContain(runId);
        expect(liveKeys(runOf(runId).decision).get(key)).toBe(ours.lanes[key].hash);
        expect(plan.lanes[key].run).toBe(true);
        expect(plan.lanes[key].run).toBe(true);
        expect(liveKeys(ours).has(key)).toBe(true);
      }
      for (const runId of plan.keep) expect(Object.values(plan.deferred), `run ${runId} kept for nothing`).toContain(runId);
      for (const runId of plan.cancel) {
        const run = runOf(runId);
        const live: Map<string, string> = run.decision ? liveKeys(run.decision) : new Map();
        const changed = [...live].some(([key, hash]) => key !== 'js-static' && ours.lanes[key].hash !== hash);
        const needed = [...live.keys()].some((key) => liveKeys(ours).has(key) && plan.deferred[key] === runId);
        expect(!run.decision || changed || !needed, `run ${runId} cancelled for no reason`).toBe(true);
      }
      expect(plan.cancel.length + plan.keep.length).toBe(older.length);
    }
  });
});

describe('deferredKeys', () => {
  it('waits for the lane marker of a plain lane and the item markers of an item lane, each on its own run', () => {
    const lanes: Record<string, Verdict> = {
      go: {run: true, hash: 'g', deferredTo: 7},
      js: {run: true, hash: 'j'},
      bench: {...benchLane({mion: 'm', zod: 'z'}, ['mion', 'zod']), deferredTo: 6},
    };
    (lanes.bench.items as Record<string, Item>).mion.deferredTo = 6;
    expect(deferredKeys(lanes, ['go', 'js', 'bench'], {pr: false})).toEqual([
      {runId: 7, keys: [greenKey('go', 'g')]},
      {runId: 6, keys: [greenKey('bench.mion', 'm')]},
    ]);
    expect(deferredKeys(lanes, ['js'], {pr: false})).toEqual([]);
  });

  // js-lint on a pull request saves the narrower js-pr marker, so waiting only for `js` would outwait the job.
  it('takes the PR proof for js on a pull request only', () => {
    const lanes = {js: {run: true, hash: 'j', deferredTo: 7}};
    expect(deferredKeys(lanes, ['js'], {pr: true})[0].keys).toEqual([greenKey('js', 'j'), greenKey('js-pr', 'j')]);
    expect(deferredKeys(lanes, ['js'], {pr: false})[0].keys).toEqual([greenKey('js', 'j')]);
  });
});

describe('waitForRun', () => {
  // A fake gh: `answer` replies to each call; `polls` counts `gh run view` calls.
  const harness = (answer: (args: string[], polls: number) => {status: number; stdout: string}) => {
    let clock = 0;
    let polls = 0;
    const calls: string[][] = [];
    const gh = (args: string[]) => {
      calls.push(args);
      if (args[0] === 'run' && args[1] === 'view') polls += 1;
      return answer(args, polls);
    };
    return {
      gh,
      calls,
      sleep: (ms: number) => (clock += ms),
      now: () => clock,
      cancels: () => calls.filter((args) => args[1] === 'cancel'),
    };
  };
  const running = (jobs: {name: string; conclusion: string | null}[] = []) => ({
    status: 0,
    stdout: JSON.stringify({status: 'in_progress', jobs}),
  });
  const groups = [
    {runId: 7, keys: ['k1']},
    {runId: 7, keys: ['k2', 'k2-pr']},
  ];
  const jobs = ['go tests + fuzz'];

  it('returns once every group has a marker, any key of the group counting', () => {
    const fake = harness((args, polls) =>
      args[0] === 'cache' ? {status: 0, stdout: polls >= 2 && args[3] !== 'k2' ? `${args[3]}\n` : ''} : running()
    );
    expect(waitForRun({groups, jobs, ...fake, deadline: 10 * 60_000})).toEqual(['proven', 'proven']);
    expect(fake.cancels()).toEqual([]);
  });

  it('returns when the older run finishes without the markers', () => {
    const fake = harness((args) =>
      args[0] === 'cache' ? {status: 0, stdout: ''} : {status: 0, stdout: JSON.stringify({status: 'completed', jobs: []})}
    );
    expect(waitForRun({groups, jobs, ...fake, deadline: 10 * 60_000})).toEqual(['finished', 'finished']);
  });

  it("stops when the older run fails one of this job's own jobs, and never cancels it", () => {
    const fake = harness((args) =>
      args[0] === 'cache' ? {status: 0, stdout: ''} : running([{name: 'go tests + fuzz', conclusion: 'failure'}])
    );
    expect(waitForRun({groups, jobs, ...fake, deadline: 10 * 60_000})).toEqual(['failed', 'failed']);
    expect(fake.cancels()).toEqual([]);
  });

  // An amended commit message: the older run's commitlint failed, but its lanes are still worth waiting for.
  it('keeps waiting through a failed job of another lane', () => {
    const fake = harness((args, polls) =>
      args[0] === 'cache'
        ? {status: 0, stdout: polls >= 3 ? `${args[3]}\n` : ''}
        : running([{name: 'commit messages', conclusion: 'failure'}])
    );
    expect(waitForRun({groups, jobs, ...fake, deadline: 10 * 60_000})).toEqual(['proven', 'proven']);
  });

  it('keeps polling through gh errors and gives up at the deadline, polling less often after ten minutes', () => {
    const fake = harness(() => ({status: 1, stdout: ''}));
    expect(waitForRun({groups, jobs, ...fake, deadline: 16 * 60_000})).toEqual(['deadline', 'deadline']);
    expect(fake.now()).toBeLessThanOrEqual(16 * 60_000);
    // One poll per minute up to ten minutes (11 polls), then every three minutes (13, 16): one view each.
    expect(fake.calls.filter((args) => args[1] === 'view').length).toBe(13);
  });
});

describe('the supersede CLI', () => {
  let dir: string;
  const env = {...process.env};
  const file = (name: string, content?: unknown) => {
    const at = path.join(dir, name);
    if (content !== undefined) writeFileSync(at, JSON.stringify(content));
    return at;
  };
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'supersede-'));
    process.env.GITHUB_OUTPUT = file('output', '');
    process.env.GITHUB_STEP_SUMMARY = file('summary', '');
    writeFileSync(process.env.GITHUB_OUTPUT, '');
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = {...env};
    vi.restoreAllMocks();
    rmSync(dir, {recursive: true, force: true});
  });

  // The cancel step reads `cancel=` and nothing else: a typo there means no older run is ever cancelled.
  it('writes our lanes with their waits to --out, and the runs to cancel as `cancel=`', () => {
    const older: Older[] = [
      {runId: 5, decision: ci()},
      {runId: 6, decision: null},
      {runId: 4, decision: ci({js: 'old'})},
    ];
    main([
      '--plan',
      '--decision',
      file('ours.json', ci()),
      '--older',
      file('older.json', older),
      '--out',
      file('final.json'),
      '--github',
    ]);
    expect(JSON.parse(readFileSync(file('final.json'), 'utf8')).go).toMatchObject({deferredTo: 5});
    expect(readFileSync(process.env.GITHUB_OUTPUT as string, 'utf8')).toBe('cancel=4 6\n');
    expect(readFileSync(process.env.GITHUB_STEP_SUMMARY as string, 'utf8')).toContain('| 5 | keep | go, js-fuzz, js |');
  });

  it('returns at once from --wait when nothing waits, without calling gh', () => {
    process.env.PATH = '';
    main(['--wait', '--decision', file('lanes.json', ci().lanes), '--lanes', 'go', 'js', '--jobs', 'x', '--timeout', '60']);
    expect(console.log).toHaveBeenCalledWith('no lane of go js waits on an older run');
  });
});
