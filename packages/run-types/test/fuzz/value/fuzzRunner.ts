// Autonomous fuzz driver. Feeds three streams of data into every target's
// validation/serialization functions and collects oracle violations:
//
//   valid    createMockDataFn<T>()        → O1, O3, O4, O5, O6, O7, O18, O19, O20
//   invalid  mutateToInvalid(valid)     → O2, O3, O4, O18, O19
//   extras   mutateWithExtras(valid)    → O18, O21
//   unknown  plantUnknownKey(valid)     → O22, O23, O24, O25
//   junk     randomJunk() (type-blind)  → O3, O4, O18, O19
//
// Every iteration runs under a seeded `Math.random` (withSeededRandom), so a
// reported violation replays exactly from its `seed`. `runFuzz` is pure data
// in / report out — no test framework, no I/O — so it runs both inside Vitest
// and as a standalone long-running soak (see runFuzzForDuration).

import {withSeededRandom} from '../core/seededRng.ts';
import {type CrashRecord} from '../core/crashGuard.ts';
import {runFuzzLoopSync} from '../core/runLoop.ts';
import {mutateToInvalid} from './invalidValue.ts';
import {mutateWithExtras, deepCopyValue} from '../cloning/extrasValue.ts';
import {collectUnknownKeyPositions, plantUnknownKey} from './unknownKeyPositions.ts';
import {
  checkBinaryStable,
  checkErrorsAgree,
  checkFusedAgree,
  checkStrictSelfAgree,
  checkParseAgree,
  checkParseRoundTrip,
  checkInvalidRejected,
  checkJsonStable,
  checkValidAccepted,
  checkValidateTotal,
  checkUnknownKeysSelfAgree,
  checkUnknownKeysPlanted,
  checkUnknownKeysStripAgree,
  checkWireStripBlind,
  checkWireCompactBlind,
  type FuzzTarget,
  type Violation,
} from './fuzzOracle.ts';

export interface FuzzOptions {
  /** Base seed; the whole run is reproducible from this number. **/
  seed?: number;
  /** Iterations per target. **/
  iterations?: number;
}

/** Anti-vacuity counters for the unknown-key oracles (O22–O25). A lane that
 *  never planted a key, never reached an index-signature carve-out or never
 *  got a wire to plant on would run green while proving nothing, so the test
 *  asserts each of these is non-zero. **/
export interface UnknownKeyCoverage {
  /** Keys planted where every family owes a report. **/
  flagged: number;
  /** Keys planted into an index-signature object, where every family owes silence. **/
  carveOut: number;
  /** Values whose encoded wire was planted on and decoded back (O25). **/
  wire: number;
  /** The same over the compact pair (O26). **/
  compactWire: number;
}

export interface FuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: Violation[];
  /** Hard failures captured by the crash guard (core/crashGuard.ts), each with
   *  its replay seed. **/
  crashes: CrashRecord[];
  /** Duration runs only: the slowest single iteration and its zero-based round,
   *  for the soak pathology tripwire (SOAK_ITERATION_CEILING_MS). **/
  slowestIterationMs?: number;
  slowestIterationRound?: number;
  unknownKeys: UnknownKeyCoverage;
}

const DEFAULT_ITERATIONS = 200;

/** Run a fixed number of iterations per target and return all violations. **/
export function runFuzz(targets: FuzzTarget[], options: FuzzOptions = {}): FuzzReport {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const violations: Violation[] = [];
  const unknownKeys: UnknownKeyCoverage = {flagged: 0, carveOut: 0, wire: 0, compactWire: 0};
  // One round per TARGET, `iterations` guarded steps inside it — target-major,
  // so violations still arrive grouped by target. The step label is the target
  // title, which is what makes two targets draw disjoint sequences.
  const loop = runFuzzLoopSync<Violation>({seed: options.seed, defaultSeed: 0x1234abcd, rounds: targets.length}, (round) => {
    const target = targets[round.round];
    for (let i = 0; i < iterations; i++) {
      round.run(target.title, i, (iterSeed) =>
        withSeededRandom(iterSeed, () => fuzzOneIteration(target, iterSeed, violations, unknownKeys))
      );
    }
  });
  return {runs: loop.runs, iterations, seed: loop.seed, violations, crashes: loop.crashes, unknownKeys};
}

/** Soak mode: keep fuzzing until `durationMs` elapses, logging violations as
 *  they appear. Returns the accumulated report. Used by the standalone runner
 *  the user wants to "run autonomous for some time and log all found errors". **/
export function runFuzzForDuration(
  targets: FuzzTarget[],
  durationMs: number,
  options: FuzzOptions = {},
  onViolation?: (v: Violation) => void
): FuzzReport {
  const violations: Violation[] = [];
  const unknownKeys: UnknownKeyCoverage = {flagged: 0, carveOut: 0, wire: 0, compactWire: 0};
  // One ROUND is a full pass over every target — the budget refuses to start a
  // round the remaining time cannot pay for, so the soak lands inside its wall
  // clock instead of overshooting by a whole round.
  const loop = runFuzzLoopSync<Violation>({seed: options.seed, durationMs, violations, onViolation}, (round) => {
    for (const target of targets) {
      round.run(target.title, round.round, (iterSeed) =>
        withSeededRandom(iterSeed, () => fuzzOneIteration(target, iterSeed, violations, unknownKeys))
      );
    }
  });
  return {
    runs: loop.runs,
    iterations: loop.rounds,
    seed: loop.seed,
    crashes: loop.crashes,
    violations,
    slowestIterationMs: loop.slowestIterationMs,
    slowestIterationRound: loop.slowestIterationRound,
    unknownKeys,
  };
}

/** One target × one seed: valid, invalid, and junk passes. Runs INSIDE a
 *  `withSeededRandom` scope (mock + mutation + junk all draw seeded entropy). **/
function fuzzOneIteration(target: FuzzTarget, seed: number, out: Violation[], unknownKeys: UnknownKeyCoverage): void {
  // --- valid pass ---
  let valid: unknown;
  try {
    valid = target.mock();
  } catch (err) {
    // A mock generator throwing is itself a finding (e.g. `never` in a shape).
    out.push({
      oracle: 'O1',
      target: target.title,
      seed,
      phase: 'valid',
      message: `mock generation threw: ${err instanceof Error ? err.message : String(err)}`,
      value: '<mock-threw>',
    });
    return;
  }
  const validCtx = {seed, phase: 'valid' as const};
  push(out, checkValidAccepted(target, valid, validCtx));
  push(out, checkValidateTotal(target, valid, validCtx));
  push(out, checkErrorsAgree(target, valid, validCtx));
  push(out, checkFusedAgree(target, valid, validCtx));
  push(out, checkStrictSelfAgree(target, valid, validCtx));
  push(out, checkParseAgree(target, valid, validCtx));
  push(out, checkParseRoundTrip(target, valid, validCtx));
  push(out, checkJsonStable(target, valid, validCtx));
  push(out, checkBinaryStable(target, valid, validCtx));

  // --- invalid pass (metamorphic corruption of the valid mock) ---
  const mutated = mutateToInvalid(target.schema, valid, Math.random);
  if (mutated) {
    const invalidCtx = {seed, phase: 'invalid' as const};
    push(out, checkInvalidRejected(target, mutated.value, invalidCtx));
    push(out, checkValidateTotal(target, mutated.value, invalidCtx));
    push(out, checkErrorsAgree(target, mutated.value, invalidCtx));
    push(out, checkFusedAgree(target, mutated.value, invalidCtx));
    push(out, checkStrictSelfAgree(target, mutated.value, invalidCtx));
    push(out, checkParseAgree(target, mutated.value, invalidCtx));
  }

  // --- extras pass (valid mock + undeclared keys) ---
  // Without this the unknown-keys oracles never see an undeclared key, so they
  // ran green on every input while proving nothing about their own subject. A
  // value here is still `validate === true` by construction and
  // `validateStrict === false`, which is exactly the gap between the two.
  const extras = mutateWithExtras(target.schema, valid, Math.random)?.value ?? injectRootExtra(valid);
  if (extras !== null) {
    const extrasCtx = {seed, phase: 'extras' as const};
    push(out, checkFusedAgree(target, extras, extrasCtx));
    push(out, checkStrictSelfAgree(target, extras, extrasCtx));
  }

  // --- unknown-keys pass (one undeclared key at a walked position) ---
  // The extras pass above compares the FUSED validator against its
  // composition; this one holds the unknown-key families against each other,
  // at every position that has its own arm. One key, not several, so a
  // disagreement names the exact position that drifted.
  const positions = collectUnknownKeyPositions(target.schema, valid);
  const unknownCtx = {seed, phase: 'unknownkeys' as const};
  push(out, checkUnknownKeysSelfAgree(target, valid, unknownCtx));
  push(out, checkUnknownKeysStripAgree(target, valid, unknownCtx));
  // O25 plants blindly on the wire, so it can only run where NO position is an
  // index-signature carve-out: a key planted into one of those IS declared, so
  // strip keeps it and the metamorphic comparison would fail on a correct
  // decoder.
  if (!positions.some((position) => position.kind === 'carveOut')) {
    if (target.jsonEncode && target.jsonDecode) unknownKeys.wire++;
    push(out, checkWireStripBlind(target, valid, unknownCtx));
    if (target.compactEncode && target.compactDecode) unknownKeys.compactWire++;
    push(out, checkWireCompactBlind(target, valid, unknownCtx));
  }
  const planted = plantUnknownKey(target.schema, valid, Math.random);
  if (planted) {
    unknownKeys[planted.kind]++;
    push(out, checkUnknownKeysPlanted(target, planted, valid, unknownCtx));
    push(out, checkUnknownKeysSelfAgree(target, planted.value, unknownCtx));
    push(out, checkUnknownKeysStripAgree(target, planted.value, unknownCtx));
  }

  // --- junk pass (type-blind random data; only robustness oracles apply) ---
  const junk = randomJunk(0);
  const junkCtx = {seed, phase: 'junk' as const};
  push(out, checkValidateTotal(target, junk, junkCtx));
  push(out, checkErrorsAgree(target, junk, junkCtx));
  push(out, checkUnknownKeysSelfAgree(target, junk, junkCtx));
  push(out, checkFusedAgree(target, junk, junkCtx));
  push(out, checkStrictSelfAgree(target, junk, junkCtx));
  push(out, checkParseAgree(target, junk, junkCtx));
}

/** Injects one undeclared key at the ROOT of a plain object.
 *
 *  `mutateWithExtras` deliberately never descends through a union, and a union
 *  root yields no injectable position at all, so it returns null for exactly the
 *  shape where the two strict families are emitted most differently. The key
 *  name is one no member could declare, so merged-allowlist and per-branch
 *  semantics agree it is undeclared — these oracles test the families against
 *  each other, they do not adjudicate union key semantics. **/
function injectRootExtra(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof RegExp) return null;
  const copy = deepCopyValue(value) as Record<string, unknown>;
  copy['__fz_root_extra'] = 1;
  return copy;
}

function push(out: Violation[], violation: Violation | null): void {
  if (violation) out.push(violation);
}

const JUNK_LEAVES: Array<() => unknown> = [
  () => 0,
  () => -1,
  () => 1.5,
  () => NaN,
  () => Infinity,
  () => '',
  () => 'a string',
  () => true,
  () => false,
  () => null,
  () => undefined,
  () => 9007199254740993n,
  () => Symbol('junk'),
  () => new Date(),
  () => new Date('invalid'),
  () => ({}),
  () => [],
  () => /regex/,
  () => new Map<unknown, unknown>([['k', 'v']]),
  () => new Set([1, 2, 3]),
  () => () => undefined,
];

/** A random, acyclic, type-blind value. Bounded depth so validators that
 *  recurse on structure can't be starved by an enormous junk tree, and never
 *  cyclic (which would be a separate, intentional hardening concern). **/
export function randomJunk(depth: number): unknown {
  if (depth >= 4 || Math.random() < 0.5) {
    return JUNK_LEAVES[Math.floor(Math.random() * JUNK_LEAVES.length)]();
  }
  if (Math.random() < 0.5) {
    const length = Math.floor(Math.random() * 4);
    const arr: unknown[] = [];
    for (let i = 0; i < length; i++) arr.push(randomJunk(depth + 1));
    return arr;
  }
  const keys = Math.floor(Math.random() * 4);
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < keys; i++) obj['k' + i] = randomJunk(depth + 1);
  return obj;
}
