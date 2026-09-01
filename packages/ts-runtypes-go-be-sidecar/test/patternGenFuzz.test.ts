// Generation fuzz for the sidecar's `generate` op against the COMMITTED
// bundle (the exact bytes go:embed ships) under the real node. Two halves:
//
//   1. Supported-subset patterns (compositional literals / classes /
//      groups / bounded quantifiers — everything randexp handles) with two
//      oracles: ROUND-TRIP (every returned value must match the real
//      compiled regex and the declared bounds — re-verified independently
//      in this process) and DETERMINISM (the same job twice, and in a
//      second child process, yields the identical list).
//   2. Adversarial constructs (lookarounds, backrefs, unicode escapes,
//      broken syntax) asserting the response CONTRACT only: exactly one
//      verdict shape per job, and any values that do come back still match
//      their own pattern — the self-check guarantee that makes generation
//      trustworthy (failures are honest generateErrors, never bad values).
//
// Deterministic: seeded mulberry32 (replay with MION_FUZZ_SEED=<n>). Runs in
// the normal suite (fast) and via `pnpm rtx core fuzz patterngen`.
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {entrySeed} from '../../run-types/test/fuzz/core/fuzzPolicy.ts';

const BUNDLE = resolve(import.meta.dirname, '../../../ts-go-runtypes/internal/jsengine/sidecar.bundle.mjs');
const SEED = entrySeed('patterngen');
const SUPPORTED_JOBS = 120;
const ADVERSARIAL_JOBS = 120;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomOf<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

// Supported subset: atoms randexp generates faithfully. Anchored ^…$ so the
// self-check is strict and the round-trip oracle meaningful.
const CLASSES = ['[a-z]', '[0-9]', '[A-F]', '[a-z0-9]', '\\d', '\\w', '[xyz]'];
const LITERALS = ['a', 'zz', 'x-', '7', '_'];
const GROUPS = ['(ab|cd)', '(x|y|z)', '(foo|ba)'];
const QUANTIFIERS = ['', '?', '+', '*', '{2}', '{1,3}', '{2,4}'];

function supportedPattern(random: () => number): string {
  const parts = 1 + Math.floor(random() * 4);
  let body = '';
  for (let i = 0; i < parts; i++) {
    const atom = randomOf(random, [...CLASSES, ...LITERALS, ...GROUPS]);
    body += atom + randomOf(random, QUANTIFIERS);
  }
  return `^${body}$`;
}

// Adversarial: constructs randexp throws on or mishandles, plus broken
// syntax — the FMT005/FMT002 lanes.
const ADVERSARIAL = [
  '(?<=a)b',
  '(?<!x)y',
  'a(?=b)',
  '(?<name>c)\\k<name>',
  '(ab)\\1',
  '\\p{L}+',
  '\\u{1F600}',
  '^[a-z+$',
  '(unclosed',
  'a{5,2}',
  '^\\b[a-z]{3}\\b$',
  '',
];

interface GenerateVerdict {
  id: number;
  values?: string[];
  generateError?: string;
  compileError?: string;
  error?: string;
}

interface SidecarChild {
  send: (line: string) => Promise<string>;
  close: () => void;
}

function spawnSidecar(): SidecarChild {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [BUNDLE], {stdio: ['pipe', 'pipe', 'ignore']});
  const lines = createInterface({input: child.stdout, terminal: false});
  const pending: Array<(line: string) => void> = [];
  lines.on('line', (line) => pending.shift()?.(line));
  const exited = new Promise<never>((_, reject) => {
    child.on('exit', (code) => reject(new Error(`sidecar exited early (code ${code})`)));
  });
  return {
    send: (line) =>
      Promise.race([
        exited,
        new Promise<string>((resolveLine, reject) => {
          pending.push(resolveLine);
          setTimeout(() => reject(new Error('sidecar response timed out')), 10000).unref();
          child.stdin.write(line + '\n');
        }),
      ]),
    close: () => {
      child.stdin.end();
      child.removeAllListeners('exit');
      child.kill();
    },
  };
}

// One verdict shape per job — never a mix, never none (a bare {id} is a
// valid validate verdict but NOT a valid generate one).
function assertVerdictShape(result: GenerateVerdict): void {
  const shapes = [result.values, result.generateError, result.compileError, result.error].filter((v) => v !== undefined);
  expect(shapes).toHaveLength(1);
}

// The independent round-trip oracle: every value matches the pattern and
// the declared UTF-16 bounds, and the list is deduped.
function assertValuesSound(
  job: {source: string; flags?: string; count: number; minLength?: number; maxLength?: number},
  values: string[]
): void {
  expect(values.length).toBeGreaterThan(0);
  expect(values.length).toBeLessThanOrEqual(job.count);
  expect(new Set(values).size).toBe(values.length);
  const tester = new RegExp(job.source, (job.flags ?? '').replace(/[gy]/g, ''));
  for (const value of values) {
    expect(value).toMatch(tester);
    if (job.minLength) expect(value.length).toBeGreaterThanOrEqual(job.minLength);
    if (job.maxLength) expect(value.length).toBeLessThanOrEqual(job.maxLength);
  }
}

describe('pattern generation fuzz (committed bundle under real node)', () => {
  it(`generates sound, deterministic values for ${SUPPORTED_JOBS} supported-subset patterns (seed ${SEED})`, async () => {
    const random = mulberry32(SEED);
    const jobs = Array.from({length: SUPPORTED_JOBS}, (_, i) => ({
      id: i,
      op: 'generate',
      source: supportedPattern(random),
      flags: randomOf(random, ['', '', 'i', 'm']),
      count: 1 + Math.floor(random() * 12),
      seed: Math.floor(random() * 0xffffffff),
      maxAttempts: 50 + Math.floor(random() * 100),
      ...(random() < 0.25 ? {minLength: 1 + Math.floor(random() * 3)} : {}),
      ...(random() < 0.25 ? {maxLength: 6 + Math.floor(random() * 10)} : {}),
    }));
    const first = spawnSidecar();
    const second = spawnSidecar();
    try {
      const line = JSON.stringify({v: 1, jobs});
      const run1 = JSON.parse(await first.send(line)) as {v: number; results: GenerateVerdict[]};
      const run2 = JSON.parse(await first.send(line)) as {v: number; results: GenerateVerdict[]};
      const other = JSON.parse(await second.send(line)) as {v: number; results: GenerateVerdict[]};
      expect(run1.results).toHaveLength(jobs.length);
      for (const [i, result] of run1.results.entries()) {
        const job = jobs[i]!;
        expect(result.id).toBe(job.id);
        assertVerdictShape(result);
        // Supported-subset patterns always compile; generation may still
        // legitimately exhaust its budget under a tight bounds combo — but
        // whatever values come back must be sound.
        expect(result.compileError).toBeUndefined();
        expect(result.error).toBeUndefined();
        if (result.values) assertValuesSound(job, result.values);
        // Determinism: same job, same child — and a separate child process.
        expect(run2.results[i]).toEqual(result);
        expect(other.results[i]).toEqual(result);
      }
      // The generator must actually generate for most of the subset — an
      // all-generateError run would satisfy the shape asserts while the
      // feature is broken.
      const generated = run1.results.filter((result) => result.values).length;
      expect(generated).toBeGreaterThan(SUPPORTED_JOBS / 2);
    } finally {
      first.close();
      second.close();
    }
  }, 30000);

  it(`answers ${ADVERSARIAL_JOBS} adversarial patterns with honest verdicts, values always sound (seed ${SEED})`, async () => {
    const random = mulberry32(SEED ^ 0x5f3759df);
    const jobs = Array.from({length: ADVERSARIAL_JOBS}, (_, i) => {
      // Half curated hostile constructs, half random mutations of them.
      const base = randomOf(random, ADVERSARIAL);
      const source = random() < 0.5 ? base : base + randomOf(random, ['+', '(', '\\', '{9,', randomOf(random, ADVERSARIAL)]);
      return {
        id: i,
        op: 'generate',
        source,
        flags: randomOf(random, ['', 'i', 'u', 'gimsuy']),
        count: 1 + Math.floor(random() * 6),
        seed: Math.floor(random() * 0xffffffff),
        maxAttempts: 30,
      };
    });
    const child = spawnSidecar();
    try {
      const response = JSON.parse(await child.send(JSON.stringify({v: 1, jobs}))) as {v: number; results: GenerateVerdict[]};
      expect(response.v).toBe(1);
      expect(response.results).toHaveLength(jobs.length);
      for (const [i, result] of response.results.entries()) {
        const job = jobs[i]!;
        expect(result.id).toBe(job.id);
        assertVerdictShape(result);
        expect(result.error).toBeUndefined();
        // The soundness core: if generation claims success, the values
        // must really match — an unsupported construct may only ever
        // surface as compileError or generateError, never bad values.
        if (result.values) assertValuesSound(job, result.values);
      }
    } finally {
      child.close();
    }
  }, 30000);
});
