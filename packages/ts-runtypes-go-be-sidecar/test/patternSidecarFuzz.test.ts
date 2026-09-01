// Robustness fuzz for the sidecar the Go resolver embeds: throw random
// garbage — arbitrary pattern sources and flags (including invalid regex
// syntax), pathological samples, oversized batches — at the COMMITTED
// bundle (ts-go-runtypes/internal/jsengine/sidecar.bundle.mjs, the exact
// bytes go:embed ships) running under the real node, and assert the
// resolver-side contract can never break: every request line gets exactly
// one well-formed response line, every job gets exactly one verdict shape,
// and the process neither hangs, crashes, nor drops part of a batch.
//
// Deterministic: seeded mulberry32 (replay with MION_FUZZ_SEED=<n>). Runs in
// the normal suite (fast, one spawn) and via `pnpm rtx core fuzz sidecar`.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {entrySeed} from '../../run-types/test/fuzz/core/fuzzPolicy.ts';

const BUNDLE = resolve(import.meta.dirname, '../../../ts-go-runtypes/internal/jsengine/sidecar.bundle.mjs');
const SEED = entrySeed('sidecar');
const BATCHES = 12;
const JOBS_PER_BATCH = 40;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATTERN_ATOMS = [
  'a',
  '[a-z]',
  '\\d+',
  '(x|y)',
  '^',
  '$',
  '.*',
  '(?<=a)b',
  '(?<name>c)',
  '\\1',
  '(',
  ')',
  '[',
  ']',
  '{2,',
  '\\',
  '+',
  '*',
  '?',
  '(?',
  '\\p{L}',
  '\\u{1F600}',
  '😀',
  ' ',
  '|',
];
const FLAG_CHARS = 'gimsuydvxq!';
// Deliberately hostile sample characters, spelled via fromCharCode so no
// invisible byte can hide in this source: the JS line separators U+2028 /
// U+2029 (legal inside JS strings; a naive newline-framed protocol dies on
// them — this fuzz caught exactly that), a BOM, a C1 control, and NEL.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const HOSTILE_CHARS = [
  LINE_SEPARATOR,
  PARAGRAPH_SEPARATOR,
  String.fromCharCode(0xfeff),
  String.fromCharCode(0x9b),
  String.fromCharCode(0x85),
];

function randomOf<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function randomPattern(random: () => number): string {
  const parts = Math.floor(random() * 8);
  let out = '';
  for (let i = 0; i < parts; i++) out += randomOf(random, PATTERN_ATOMS);
  return out;
}

function randomFlags(random: () => number): string {
  let out = '';
  const count = Math.floor(random() * 4);
  for (let i = 0; i < count; i++) out += FLAG_CHARS[Math.floor(random() * FLAG_CHARS.length)];
  return out;
}

function randomSample(random: () => number): string {
  const roll = random();
  if (roll < 0.15) return '';
  if (roll < 0.3) return 'x'.repeat(Math.floor(random() * 5000));
  if (roll < 0.45) return ('😀 ' + randomOf(random, HOSTILE_CHARS)).repeat(Math.floor(random() * 4) + 1);
  let out = '';
  const len = Math.floor(random() * 12);
  for (let i = 0; i < len; i++) out += String.fromCharCode(32 + Math.floor(random() * 900));
  return out;
}

// The producer of the real wire is Go's encoding/json, which ALWAYS escapes
// U+2028/U+2029 (JSON.stringify does not — they are legal raw inside JSON
// strings but split any newline-framed reader, node's readline included).
// Mirror the producer here so the fuzz exercises the actual contract.
function encodeRequestLine(value: unknown): string {
  return JSON.stringify(value).split(LINE_SEPARATOR).join('\\u2028').split(PARAGRAPH_SEPARATOR).join('\\u2029');
}

interface SidecarVerdict {
  id: number;
  offenders?: string[];
  compileError?: string;
  error?: string;
}

describe('sidecar robustness fuzz (committed bundle under real node)', () => {
  it(`answers ${BATCHES} garbage batches with well-formed verdicts, no hangs, no partial batches (seed ${SEED})`, async () => {
    const random = mulberry32(SEED);
    const child = spawn(process.execPath, [BUNDLE], {stdio: ['pipe', 'pipe', 'ignore']});
    const lines = createInterface({input: child.stdout, terminal: false});
    const pending: Array<(line: string) => void> = [];
    lines.on('line', (line) => pending.shift()?.(line));
    const exited = new Promise<never>((_, reject) => {
      child.on('exit', (code) => reject(new Error(`sidecar exited early (code ${code})`)));
    });
    const nextLine = () =>
      Promise.race([
        exited,
        new Promise<string>((resolveLine, reject) => {
          pending.push(resolveLine);
          setTimeout(() => reject(new Error('sidecar response timed out')), 5000).unref();
        }),
      ]);

    try {
      for (let batch = 0; batch < BATCHES; batch++) {
        // The last batch is deliberately oversized relative to normal use.
        const jobCount = batch === BATCHES - 1 ? 400 : JOBS_PER_BATCH;
        const jobs = Array.from({length: jobCount}, (_, i) => ({
          id: batch * 1000 + i,
          op: random() < 0.05 ? 'garbage-op' : 'validate',
          source: randomPattern(random),
          flags: randomFlags(random),
          samples: Array.from({length: Math.floor(random() * 6)}, () => randomSample(random)),
        }));
        child.stdin.write(encodeRequestLine({v: 1, jobs}) + '\n');
        const raw = await nextLine();
        const response = JSON.parse(raw) as {v: number; results?: SidecarVerdict[]; error?: string};
        expect(response.v).toBe(1);
        expect(response.error).toBeUndefined();
        expect(response.results).toHaveLength(jobs.length);
        for (const [i, result] of response.results!.entries()) {
          expect(result.id).toBe(jobs[i]!.id);
          // Exactly one verdict shape: clean pass, offenders, compile
          // error, or protocol error — never a mix.
          const shapes = [result.offenders, result.compileError, result.error].filter((v) => v !== undefined);
          expect(shapes.length).toBeLessThanOrEqual(1);
          if (jobs[i]!.op !== 'validate') expect(result.error).toBeTruthy();
        }
      }
    } finally {
      child.stdin.end();
      child.removeAllListeners('exit');
      child.kill();
    }
  }, 30000);
});

// The exact shape the fuzz lane found at v0.12.2 (seed 0xbe882a45), pinned as
// a regression: a catastrophically backtracking pattern used to never return
// from `.test`, so the request was never answered and the batch was lost.
// Asserts the contract the fuzz asserts, on one known-hostile job.
describe('runaway pattern', () => {
  it('answers a catastrophically backtracking job instead of wedging the process', async () => {
    const child = spawn(process.execPath, [BUNDLE], {stdio: ['pipe', 'pipe', 'ignore']});
    const lines = createInterface({input: child.stdout, terminal: false});
    try {
      const answered = new Promise<string>((resolveLine, reject) => {
        lines.once('line', resolveLine);
        setTimeout(() => reject(new Error('sidecar response timed out')), 15000).unref();
      });
      const job = {id: 1, op: 'validate', source: '(x|y)+.*.*\\p{L}?', flags: '', samples: ['x'.repeat(2110)]};
      child.stdin.write(encodeRequestLine({v: 1, jobs: [job]}) + '\n');
      const response = JSON.parse(await answered) as {v: number; results?: SidecarVerdict[]};
      expect(response.v).toBe(1);
      expect(response.results).toHaveLength(1);
      const [result] = response.results!;
      expect(result!.id).toBe(1);
      // Bounded out rather than judged, and never through the `error` channel,
      // which Go treats as an engine failure.
      expect(result!.compileError).toMatch(/timed out/);
      expect(result!.error).toBeUndefined();
    } finally {
      child.stdin.end();
      child.kill();
    }
  }, 30000);
});
