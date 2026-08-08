// All-strategy round-trip driver — generate a random SERIALISABLE type
// (DATA_GEN_OPTIONS), compile EVERY codec strategy for it (roundtripHarness),
// generate one conforming data-only value (shapeValue), and round-trip it
// through clone / mutate / direct / compact / binary, checking the oracle agrees
// (roundtripOracle).
//
// Scope: this lane is ADDITIVE to typeFuzzRunner. Resolver/emit robustness
// (TR1–TR4) and the wild non-serialisable space are policed there; here we only
// exercise the all-strategy serialization matrix on clean serialisable types, so
// non-serialisable / error-diagnostic / recursive / floored types are skipped
// rather than reported. Each iteration seeds the type AND its value from one
// number, so a reported violation replays exactly.

import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {startSoakBudget} from '../core/soakBudget.ts';
import {genType, describeType, isRecursive, DATA_GEN_OPTIONS, type GeneratedType, type GenOptions} from '../core/typeGen.ts';
import {genValidValue, valueOracleSafe} from '../value/shapeValue.ts';
import {isValidTypeScript} from '../type/tsValidate.ts';
import {compileCodecs, openClient, renderFixture, type CompiledCodecs} from './roundtripHarness.ts';
import {checkRoundtrip, snapshot, type RoundtripViolation} from './roundtripOracle.ts';
import type {ResolverClient} from '../../../../ts-runtypes-devtools/src/resolver-client.ts';

export interface RoundtripFuzzOptions {
  seed?: number;
  iterations?: number;
  gen?: Partial<GenOptions>;
}

export interface RoundtripFuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: RoundtripViolation[];
  /** Types that round-tripped through at least one lane (the oracle ran). **/
  checked: number;
  /** Types skipped before the oracle (resolver/eval error, error diagnostics,
   *  non-serialisable, recursive, floored value, no clean clone lane). **/
  skipped: number;
  /** Violations dropped because the generated type isn't valid TypeScript
   *  (tsgo is lenient; a violation there is a false positive). **/
  skippedInvalidTypes: number;
  /** Duration runs only: the slowest single iteration and its zero-based round,
   *  for the soak pathology tripwire (SOAK_ITERATION_CEILING_MS). **/
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

interface FuzzStats {
  checked: number;
  skipped: number;
  skippedInvalidTypes: number;
}

const DEFAULT_SEED = 0xc0ffee;
const DEFAULT_ITERATIONS = 80;
const COMPILE_TIMEOUT_MS = 10_000;

// Owns the inline-server resolver and can restart it after a hang (a single
// unanswered request wedges the whole request queue). Mirrors typeFuzzRunner.
class ClientHolder {
  private client: ResolverClient | null = null;
  get(): ResolverClient {
    if (!this.client) this.client = openClient();
    return this.client;
  }
  restart(): void {
    try {
      this.client?.close();
    } catch {
      /* already dead */
    }
    this.client = openClient();
  }
  close(): void {
    try {
      this.client?.close();
    } catch {
      /* already dead */
    }
    this.client = null;
  }
}

export async function runRoundtripFuzz(options: RoundtripFuzzOptions = {}): Promise<RoundtripFuzzReport> {
  const seed = options.seed ?? DEFAULT_SEED;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const gen: GenOptions = {...DATA_GEN_OPTIONS, ...options.gen};
  const violations: RoundtripViolation[] = [];
  const stats: FuzzStats = {checked: 0, skipped: 0, skippedInvalidTypes: 0};
  const holder = new ClientHolder();
  let runs = 0;
  try {
    for (let i = 0; i < iterations; i++) {
      runs++;
      await fuzzOne(holder, mixSeed(seed, 'roundtrip', i), gen, violations, stats);
    }
  } finally {
    holder.close();
  }
  return {runs, iterations, seed, violations, ...stats};
}

export async function runRoundtripFuzzForDuration(
  durationMs: number,
  options: RoundtripFuzzOptions = {},
  onViolation?: (v: RoundtripViolation) => void
): Promise<RoundtripFuzzReport> {
  const seed = options.seed ?? DEFAULT_SEED;
  const gen: GenOptions = {...DATA_GEN_OPTIONS, ...options.gen};
  const violations: RoundtripViolation[] = [];
  const stats: FuzzStats = {checked: 0, skipped: 0, skippedInvalidTypes: 0};
  const holder = new ClientHolder();
  let runs = 0;
  let round = 0;
  const budget = startSoakBudget(durationMs);
  try {
    while (budget.canStart()) {
      runs++;
      const before = violations.length;
      await fuzzOne(holder, mixSeed(seed, 'roundtrip', round), gen, violations, stats);
      if (onViolation) for (let k = before; k < violations.length; k++) onViolation(violations[k]);
      round++;
      budget.mark();
    }
  } finally {
    holder.close();
  }
  return {
    runs,
    iterations: round,
    seed,
    violations,
    ...stats,
    slowestIterationMs: budget.slowestIterationMs(),
    slowestIterationRound: budget.slowestIterationRound(),
  };
}

async function fuzzOne(
  holder: ClientHolder,
  seed: number,
  gen: GenOptions,
  out: RoundtripViolation[],
  stats: FuzzStats
): Promise<void> {
  const generated = withSeededRandom(seed, () => genType(gen));

  // Recursive types: the in-process linker can't run a cyclic factory graph
  // (the real CircularRefs suite covers their runtime), so skip — same exclusion
  // typeFuzz's behaviour tier makes.
  if (isRecursive(generated)) {
    stats.skipped++;
    return;
  }
  // Only clean serialisable types: the all-strategy round-trip oracle needs a
  // value that provably conforms (valueOracleSafe) and that every codec accepts.
  if (!valueOracleSafe(generated)) {
    stats.skipped++;
    return;
  }

  const before = out.length;
  const compiled = await compileWithTimeout(holder, generated, seed, out);
  if (!compiled) {
    // a TR1-style hang was recorded as a violation; the TS-gate below decides.
    applyTsGate(generated, out, before, stats);
    return;
  }

  // A resolver/eval failure or any Error-severity diagnostic means this isn't a
  // clean serialisable type for the oracle — skip (typeFuzz polices those).
  if (compiled.resolverError || compiled.evalError || compiled.errorDiagnostics.length > 0) {
    stats.skipped++;
    return;
  }

  const {value, floored} = withSeededRandom(mixSeed(seed, 'value', 0), () => genValidValue(generated));
  if (floored) {
    // A truncated recursive/fan-out value may not fully conform — skip rather
    // than risk a false RT-IDENTITY.
    stats.skipped++;
    return;
  }

  // Need at least the clone lane wired to anchor RT-AGREE / the round-trip.
  if (!compiled.validate || !compiled.codecs.clone) {
    stats.skipped++;
    return;
  }

  stats.checked++;
  checkRoundtrip(compiled, value, seed, out);
  applyTsGate(generated, out, before, stats);
}

// TS-validity gate (mirrors typeFuzzRunner): a violation on a type that doesn't
// actually compile is a false positive — tsgo is lenient and still produces a
// RunType for invalid input, but the pipeline's behaviour there is undefined.
// Only typecheck when a violation fired (a clean run pays nothing); if the check
// itself throws, KEEP the violations (never hide a real bug).
function applyTsGate(generated: GeneratedType, out: RoundtripViolation[], before: number, stats: FuzzStats): void {
  if (out.length <= before) return;
  let valid = true;
  try {
    valid = isValidTypeScript(generated);
  } catch {
    valid = true;
  }
  if (!valid) {
    out.length = before;
    stats.skippedInvalidTypes++;
  }
}

// Race compileCodecs against a timeout. On timeout record an RT-THROW-style
// finding and restart the (now wedged) resolver. The abandoned compile promise
// is detached so its eventual rejection isn't unhandled.
async function compileWithTimeout(
  holder: ClientHolder,
  gen: GeneratedType,
  seed: number,
  out: RoundtripViolation[]
): Promise<CompiledCodecs | null> {
  const compile = compileCodecs(holder.get(), gen);
  compile.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<'timeout'>((res) => {
    timer = setTimeout(() => res('timeout'), COMPILE_TIMEOUT_MS);
  });
  const result = await Promise.race([compile, timeout]);
  clearTimeout(timer!);
  if (result === 'timeout') {
    out.push({
      oracle: 'RT-THROW',
      lane: 'all',
      target: describeType(gen),
      seed,
      message: `resolver did not respond within ${COMPILE_TIMEOUT_MS}ms (possible pathological type / hang)`,
      value: snapshot(renderFixture(gen)),
    });
    holder.restart();
    return null;
  }
  return result;
}
