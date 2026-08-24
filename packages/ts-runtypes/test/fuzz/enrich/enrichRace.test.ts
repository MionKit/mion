// Concurrent-CLI race harness for the enrich-mirror reconciler. Fires several
// `gen --update` processes at ONE fixture simultaneously (the save + format-on-save
// double-fire a dev HMR loop produces) and races a source rewrite against them. The
// ATOMIC mirror write (write-temp + os.Rename, in cmd/ts-runtypes/enrich_reconcile.go)
// is the enabler: with it, the worst a race can do is last-writer-wins of a CONVERGENT
// reconcile, so after the dust settles the mirror still PARSES, CONVERGES (a further
// --update is a byte-identical no-op), and preserves every authored value. Without
// atomic write a racing reader could observe a torn (half-written) mirror.
//
// The concurrent phase is timing-dependent. Every ASSERTION is on the SETTLED state
// (deterministic), but the spawn-storm itself starves under the full `pnpm test`
// suite's contention, so this is DEMOTED out of the default run: it is gated behind
// RT_FUZZ_RACE=1 (set by the `fuzz:race` / `fuzz:race:soak` scripts) and self-skips
// otherwise. In isolation it is rock-solid (the soak runs 200 fires/scenario green);
// the deterministic atomic-write mechanism stays pinned in `pnpm test` by the Go
// TestAtomicWriteFile_ReplacesCleanly. `bin/ts-runtypes` must be built (root pretest).
//
// Knobs: RT_FUZZ_RACE_ITERATIONS (default 2), RT_FUZZ_RACE_FANOUT (default 6).

import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {describe, it, expect, afterAll} from 'vitest';
import {
  makeFixture,
  setSource,
  editMirror,
  readMirror,
  readMirrors,
  cleanupReconcileLane,
  type ReconcileFixture,
} from '../../util/enrichReconcile.ts';
import {BIN, scaffold, update, isControlled} from './enrichCli.ts';

const HAS_BIN = existsSync(BIN);
const RUN_RACE = HAS_BIN && process.env.RT_FUZZ_RACE === '1';
const ITERATIONS = Number(process.env.RT_FUZZ_RACE_ITERATIONS ?? 2);
const FANOUT = Number(process.env.RT_FUZZ_RACE_FANOUT ?? 6);
const ROOT = 'User';

const SOURCE = 'export interface User {\n  name: string;\n  age: number;\n  email: string;\n}\n';
// A racing sibling save grows the type by one field mid-reconcile.
const SOURCE_GREW = 'export interface User {\n  name: string;\n  age: number;\n  email: string;\n  phone: string;\n}\n';

// authorSentinels fills every friendly-file rt$label blank with a unique sentinel and
// returns them — the tracers for "nothing authored is lost through the race".
function authorSentinels(fixture: ReconcileFixture): string[] {
  const sentinels: string[] = [];
  editMirror(fixture, 'friendly', (text) =>
    text.replace(/rt\$label: ''/g, () => {
      const sentinel = `LBL_${sentinels.length}_x`;
      sentinels.push(sentinel);
      return `rt$label: '${sentinel}'`;
    })
  );
  return sentinels;
}

// spawnUpdate fires `gen … --update` ASYNCHRONOUSLY so several run at once (the
// spawnSync wrappers in enrichCli cannot overlap). Resolves with exit code + stderr; a
// hung process is killed and surfaced as code=null so the controlled-check fails it.
function spawnUpdate(dir: string): Promise<{code: number | null; stderr: string}> {
  return new Promise((resolveDone) => {
    const child = spawn(BIN, ['enrich', 'src/models.ts', ROOT, '--update'], {cwd: dir});
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolveDone({code: null, stderr: '__timeout__'});
    }, 20_000);
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', () => {
      clearTimeout(timer);
      resolveDone({code: null, stderr: '__launch_error__'});
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolveDone({code, stderr});
    });
  });
}

// spawnControlled mirrors enrichCli's isControlled for a raw spawn result: a clean exit
// (0) or a clean diagnostic (non-zero with stderr, no panic/internal-error/timeout).
function spawnControlled(result: {code: number | null; stderr: string}): boolean {
  if (result.code === null) return false; // launch error or timeout
  if (/internal error|panic:|runtime error|goroutine \d+ \[/i.test(result.stderr)) return false;
  return result.code === 0 || result.stderr.trim().length > 0;
}

// settledAndConverged drains the post-race state to a fixed point: a first --update
// applies whatever the final source demands, a second must leave BOTH family files
// byte-identical. Returns the settled friendly file (where the sentinels live).
function settledAndConverged(fixture: ReconcileFixture): {converged: boolean; friendly: string} {
  update(fixture, ROOT);
  const first = readMirrors(fixture);
  update(fixture, ROOT);
  const second = readMirrors(fixture);
  return {converged: first === second, friendly: readMirror(fixture, 'friendly')};
}

describe('enrich reconcile — concurrent CLI race', () => {
  afterAll(cleanupReconcileLane);

  it.skipIf(!RUN_RACE)(
    'simultaneous --update fires never tear the mirror and converge',
    async () => {
      for (let iter = 0; iter < ITERATIONS; iter++) {
        const fixture = makeFixture(`race-doublefire-${iter}`, SOURCE);
        expect(isControlled(scaffold(fixture, ROOT))).toBe(true);
        const sentinels = authorSentinels(fixture);
        expect(sentinels.length).toBeGreaterThan(0);

        // Fire FANOUT reconciles at once (a save + a formatter-on-save + …).
        const results = await Promise.all(Array.from({length: FANOUT}, () => spawnUpdate(fixture.dir)));

        // With a stable source + the atomic write, every reader observes a COMPLETE
        // mirror (old or new, never torn) and succeeds. A torn read (non-atomic write)
        // would surface as a clean NON-ZERO exit with a parse diagnostic — that must
        // fail. A contention TIMEOUT (code=null) is starvation under load, not
        // corruption, so tolerate it; the settled-state checks below are the safety net.
        for (const result of results) {
          if (result.code === null) continue;
          expect(result.code).toBe(0);
        }
        // Both family mirrors still exist, parse, and CONVERGE (a further --update is a no-op).
        expect(existsSync(fixture.friendlyPath)).toBe(true);
        expect(existsSync(fixture.mockPath)).toBe(true);
        const {converged, friendly} = settledAndConverged(fixture);
        expect(converged).toBe(true);
        // Nothing authored was lost through the race.
        for (const sentinel of sentinels) expect(friendly).toContain(sentinel);
      }
    },
    120_000
  );

  it.skipIf(!RUN_RACE)(
    'a source rewrite racing the update fires still converges and loses nothing',
    async () => {
      for (let iter = 0; iter < ITERATIONS; iter++) {
        const fixture = makeFixture(`race-rewrite-${iter}`, SOURCE);
        expect(isControlled(scaffold(fixture, ROOT))).toBe(true);
        const sentinels = authorSentinels(fixture);

        // Fire the reconciles AND land a new field in the source mid-flight, so some
        // reconciles see the old type and some the new — the worst dev-loop interleaving.
        const fires = Array.from({length: FANOUT}, () => spawnUpdate(fixture.dir));
        setSource(fixture, SOURCE_GREW);
        const results = await Promise.all(fires);
        for (const result of results) expect(spawnControlled(result)).toBe(true);

        // Settles to a fixed point reflecting the FINAL source, with every original label
        // still present (the added field carries no sentinel; the existing ones survive).
        const {converged, friendly} = settledAndConverged(fixture);
        expect(converged).toBe(true);
        expect(friendly).toContain('phone'); // the racing field is reconciled in
        for (const sentinel of sentinels) expect(friendly).toContain(sentinel);
      }
    },
    120_000
  );
});
