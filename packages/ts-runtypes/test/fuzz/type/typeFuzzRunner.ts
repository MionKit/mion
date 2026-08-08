// Phase 2 driver — generate random TYPES across the widest space (typeGen.ts),
// run each through the real pipeline (typeFuzzHarness.compileType), and check
// oracles whose tier is chosen from the RESOLVER'S OWN diagnostics:
//
//   Tier A — resolver/emit robustness (TR1–TR4), checked on EVERY type:
//     TR1 no resolver crash
//     TR2 every createX<T>() resolved to a site (6 fn + 1 reflection)
//     TR3 every emitted module is valid JS (evaluates) + the reflection graph
//         knots (no dangling ref)
//     TR4 a CLEAN type (no Error diagnostics) wires every factory without
//         throwing  (a non-serialisable type is allowed to degrade to
//         alwaysThrow — that's the contract, not a bug)
//
//   Tier B — behaviour, tier chosen from diagnostics:
//     • clean + serialisable  → strong value oracles O1–O7 (O2 only when
//       nothing is dropped, i.e. no warnings)
//     • everything else (Error diagnostics, or a non-value-generable type)
//       → robustness probe: validate / getValidationErrors must return sanely
//       or throw an ERROR (never a non-Error, never crash the process)
//
// Each iteration seeds the type AND its value stream from one number, so a
// reported violation replays exactly.

import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {startSoakBudget} from '../core/soakBudget.ts';
import {genType, describeType, isRecursive, DEFAULT_GEN_OPTIONS, type GeneratedType, type GenOptions} from '../core/typeGen.ts';
import {genValidValue, validValue, corruptValue, valueOracleSafe} from '../value/shapeValue.ts';
import {compileType, openClient, renderFixture, type CompiledType, type WiredFns} from './typeFuzzHarness.ts';
import {isValidTypeScript} from './tsValidate.ts';
import {randomJunk} from '../value/fuzzRunner.ts';
import type {ResolverClient} from '../../../../ts-runtypes-devtools/src/resolver-client.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import {
  checkBinaryStable,
  checkCrossWire,
  checkErrorsAgree,
  checkInvalidRejected,
  checkJsonStable,
  checkValidAccepted,
  checkValidateTotal,
  snapshot,
  type FuzzTarget,
  type Violation,
} from '../value/fuzzOracle.ts';

/** Where the behaviour tier sources its conforming value: the abstract-shape
 *  generator (`shapeValue.ts`, the WILD lane) or the REAL product mock
 *  (`createMockDataFn` with nonDataTypes on, the DataOnly non-data lane). **/
export type ValueSource = 'shape' | 'mock';

const EXPECTED_FN_SITES = 6;
const EXPECTED_REFLECTION_SITES = 1;
const FN_KEYS: (keyof WiredFns)[] = [
  'validate',
  'getValidationErrors',
  'jsonEncode',
  'jsonDecode',
  'binaryEncode',
  'binaryDecode',
];

export interface TypeFuzzOptions {
  seed?: number;
  iterations?: number;
  gen?: Partial<GenOptions>;
  /** Value source for the behaviour tier — `'shape'` (default, the WILD lane)
   *  or `'mock'` (the DataOnly non-data lane: REAL createMockDataFn values +
   *  diagnostics-driven serialize/fail tiering). **/
  valueSource?: ValueSource;
}

export interface TypeFuzzReport {
  runs: number;
  /** How many generated types actually reached the STRONG oracles (the value
   *  tier, or the mock lane's serialize tier) rather than the robustness probe.
   *  `runs` alone only proves the loop turned; this proves the lane asserted
   *  something non-trivial, so a generator regression that produced only
   *  robustness-probed types cannot pass as green. **/
  strongOracleRuns: number;
  iterations: number;
  seed: number;
  violations: Violation[];
  /** How many generated types had violations that were DROPPED because the type
   *  did not actually compile (invalid TypeScript). tsgo is lenient and still
   *  produces a RunType for non-compilable input, so a violation there is a
   *  false positive, not a pipeline bug. See the TS-validity gate in fuzzOneType. **/
  skippedInvalidTypes: number;
  /** Duration runs only: the slowest single iteration and its zero-based round,
   *  for the soak pathology tripwire (SOAK_ITERATION_CEILING_MS). **/
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

/** Mutable counter threaded into fuzzOneType so the report can surface how many
 *  false positives the TS-validity gate filtered. **/
interface FuzzStats {
  skippedInvalidTypes: number;
  strongOracleRuns: number;
}

const DEFAULT_ITERATIONS = 60;
// A generous per-type ceiling: with disjoint-named intersections the resolver
// handles the wild space in tens of ms, so anything this slow is a genuine
// pathology worth flagging (and the wedged client is restarted so the run goes on).
const COMPILE_TIMEOUT_MS = 10_000;

// Owns the inline-server resolver and can restart it after a hang (a single
// unanswered request wedges the whole request queue, so we kill + respawn).
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

export async function runTypeFuzz(options: TypeFuzzOptions = {}): Promise<TypeFuzzReport> {
  const seed = options.seed ?? 0x7ee5;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const gen: GenOptions = {...DEFAULT_GEN_OPTIONS, ...options.gen};
  const valueSource = options.valueSource ?? 'shape';
  const violations: Violation[] = [];
  const stats: FuzzStats = {skippedInvalidTypes: 0, strongOracleRuns: 0};
  const holder = new ClientHolder();
  let runs = 0;
  try {
    for (let i = 0; i < iterations; i++) {
      runs++;
      await fuzzOneType(holder, mixSeed(seed, 'type', i), gen, valueSource, violations, stats);
    }
  } finally {
    holder.close();
  }
  return {runs, iterations, seed, violations, ...stats};
}

export async function runTypeFuzzForDuration(
  durationMs: number,
  options: TypeFuzzOptions = {},
  onViolation?: (v: Violation) => void
): Promise<TypeFuzzReport> {
  const seed = options.seed ?? Date.now() >>> 0;
  const gen: GenOptions = {...DEFAULT_GEN_OPTIONS, ...options.gen};
  const valueSource = options.valueSource ?? 'shape';
  const violations: Violation[] = [];
  const stats: FuzzStats = {skippedInvalidTypes: 0, strongOracleRuns: 0};
  const holder = new ClientHolder();
  let runs = 0;
  let round = 0;
  const budget = startSoakBudget(durationMs);
  try {
    while (budget.canStart()) {
      runs++;
      const before = violations.length;
      await fuzzOneType(holder, mixSeed(seed, 'type', round), gen, valueSource, violations, stats);
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

async function fuzzOneType(
  holder: ClientHolder,
  seed: number,
  gen: GenOptions,
  valueSource: ValueSource,
  out: Violation[],
  stats: FuzzStats
): Promise<void> {
  const generated = withSeededRandom(seed, () => genType(gen));
  const before = out.length;
  const compiled = await compileWithTimeout(holder, generated, seed, out);
  if (compiled) {
    checkResolverTier(compiled, seed, out);
    withSeededRandom(mixSeed(seed, 'value', 0), () => checkBehaviourTier(compiled, seed, out, valueSource, stats));
  }
  // TS-validity gate. A violation recorded for this type (compile hang, resolver/
  // emit, or behaviour) is a FALSE POSITIVE when the generated type does not
  // actually compile: tsgo is lenient and still produces a RunType for invalid
  // input, but the pipeline's behaviour on a non-compilable type is undefined, so
  // it must not be reported as a bug. Drop those violations (and count them). The
  // typecheck runs ONLY when a violation fired, so a clean run pays nothing; if
  // the check itself throws we KEEP the violation (never hide a real bug).
  if (out.length > before) {
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
}

// Race compileType against a timeout. On timeout, record a TR1 finding and
// restart the (now wedged) resolver. The abandoned compile promise is detached
// with a no-op catch so its eventual rejection (resolver killed) is not unhandled.
async function compileWithTimeout(
  holder: ClientHolder,
  gen: GeneratedType,
  seed: number,
  out: Violation[]
): Promise<CompiledType | null> {
  const compile = compileType(holder.get(), gen);
  compile.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<'timeout'>((res) => {
    timer = setTimeout(() => res('timeout'), COMPILE_TIMEOUT_MS);
  });
  const result = await Promise.race([compile, timeout]);
  clearTimeout(timer!);
  if (result === 'timeout') {
    out.push({
      oracle: 'TR1',
      target: describeType(gen),
      seed,
      phase: 'compile',
      message: `resolver did not respond within ${COMPILE_TIMEOUT_MS}ms (possible pathological type / hang)`,
      value: snapshot(renderFixture(gen)),
    });
    holder.restart();
    return null;
  }
  return result;
}

// --- Tier A: resolver / emit robustness ---
function checkResolverTier(compiled: CompiledType, seed: number, out: Violation[]): void {
  const base = {target: compiled.title, seed, phase: 'compile' as const, value: snapshot(compiled.source)};

  if (compiled.resolverError) {
    out.push({oracle: 'TR1', message: `resolver crashed on a generated type: ${compiled.resolverError}`, ...base});
    return;
  }
  if (compiled.fnSiteCount !== EXPECTED_FN_SITES || compiled.reflectionSiteCount !== EXPECTED_REFLECTION_SITES) {
    out.push({
      oracle: 'TR2',
      message: `site coverage mismatch: ${compiled.fnSiteCount} fn + ${compiled.reflectionSiteCount} reflection (want ${EXPECTED_FN_SITES} + ${EXPECTED_REFLECTION_SITES})`,
      ...base,
    });
  }
  if (compiled.evalError) {
    out.push({
      oracle: 'TR3',
      message: `emitted module failed to evaluate (invalid JS or dangling ref): ${compiled.evalError}`,
      ...base,
    });
    return;
  }
  if (compiled.entryModuleCount === 0) {
    out.push({oracle: 'TR3', message: 'no entry modules emitted for a type with call sites', ...base});
  }
  // TR4: a clean type (no Error diagnostics) must wire every factory. A
  // non-serialisable type legitimately degrades to alwaysThrow — allowed.
  // Recursive types are exempt: the in-process linker can't materialise a cyclic
  // function graph (the real CircularRefs suite covers their runtime), so wiring
  // them in-process is a harness limitation, not a product defect.
  if (!isRecursive(compiled.gen)) {
    for (const key of FN_KEYS) {
      const err = compiled.wireErrors[key];
      // A CONTROLLED alwaysThrow (`[CODE] …`) is the contract for a
      // non-serialisable type — expected. Only an UNCONTROLLED wire failure is a
      // bug (e.g. a TypeError from the runtime / a malformed factory).
      if (err && !isControlledThrow(err)) {
        out.push({oracle: 'TR4', message: `factory ${key} failed to wire with an uncontrolled error: ${err}`, ...base});
      }
    }
  }
}

// alwaysThrow messages are rendered by the Go binary as `[CODE] …` (internal/diagnostics).
function isControlledThrow(message: string): boolean {
  return /^\[[A-Z][A-Z0-9]*\]/.test(message);
}

// --- Tier B: behaviour ---
function checkBehaviourTier(
  compiled: CompiledType,
  seed: number,
  out: Violation[],
  valueSource: ValueSource,
  stats: FuzzStats
): void {
  if (compiled.resolverError || compiled.evalError) return;
  // Recursive types: resolve/emit/reflection were already policed (TR1–TR3);
  // their runtime is covered by the real CircularRefs suite. The in-process
  // linker can't execute a cyclic function graph, so skip the behaviour tier.
  if (isRecursive(compiled.gen)) return;
  // DataOnly non-data lane: values come from the REAL product mock and the
  // serialize/fail tier is read off the resolver's own diagnostics.
  if (valueSource === 'mock') {
    checkMockBehaviour(compiled, seed, out, stats);
    return;
  }
  const serialisable = valueOracleSafe(compiled.gen);
  const target = asFuzzTarget(compiled);

  if (serialisable && target) {
    // A truncated (floored) recursive value may not fully conform — fall back to
    // the robustness probe rather than risk a false O1.
    const {value, floored} = genValidValue(compiled.gen);
    if (floored) runRobustnessProbe(compiled, seed, out);
    else {
      stats.strongOracleRuns++;
      runValueOracles(compiled, target, value, seed, out);
    }
  } else {
    runRobustnessProbe(compiled, seed, out);
  }
}

// Strong/medium value oracles over a conforming value. O2 (corruption) is only
// sound when nothing is dropped (no warnings) — a corrupted dropped member would
// still validate.
function runValueOracles(compiled: CompiledType, target: FuzzTarget, valid: unknown, seed: number, out: Violation[]): void {
  const validCtx = {seed, phase: 'valid' as const};
  push(out, checkValidAccepted(target, valid, validCtx));
  push(out, checkValidateTotal(target, valid, validCtx));
  push(out, checkErrorsAgree(target, valid, validCtx));
  push(out, checkJsonStable(target, valid, validCtx));
  push(out, checkBinaryStable(target, valid, validCtx));

  if (compiled.warningDiagnostics.length === 0) {
    const corrupted = corruptValue(compiled.gen, valid);
    if (corrupted) {
      const invalidCtx = {seed, phase: 'invalid' as const};
      push(out, checkInvalidRejected(target, corrupted.value, invalidCtx));
      push(out, checkValidateTotal(target, corrupted.value, invalidCtx));
      push(out, checkErrorsAgree(target, corrupted.value, invalidCtx));
    }
  }

  const junk = randomJunk(0);
  const junkCtx = {seed, phase: 'junk' as const};
  push(out, checkValidateTotal(target, junk, junkCtx));
  push(out, checkErrorsAgree(target, junk, junkCtx));
}

// For non-serialisable / error-diagnostic types we can't assert acceptance, but
// the runtime must still be ROBUST: a wired validate / getValidationErrors must
// return a sane shape or throw an ERROR — never a non-Error, never hang/crash.
function runRobustnessProbe(compiled: CompiledType, seed: number, out: Violation[]): void {
  const base = {target: compiled.title, seed, phase: 'junk' as const, value: snapshot(compiled.source)};
  const samples: unknown[] = [randomJunk(0), randomJunk(0), {}, [], null, undefined, 'x', 42];
  const {validate, getValidationErrors} = compiled.wired;

  for (const sample of samples) {
    if (validate) {
      try {
        const r = validate(sample);
        if (typeof r !== 'boolean')
          out.push({
            oracle: 'O3',
            message: `validate returned a non-boolean (${typeof r}) on a wild type`,
            ...base,
            value: snapshot(sample),
          });
      } catch (err) {
        if (!(err instanceof Error))
          out.push({
            oracle: 'O3',
            message: `validate threw a non-Error (${typeof err}) on a wild type`,
            ...base,
            value: snapshot(sample),
          });
      }
    }
    if (getValidationErrors) {
      try {
        const r = getValidationErrors(sample);
        if (!Array.isArray(r))
          out.push({
            oracle: 'O4',
            message: `getValidationErrors returned a non-array (${typeof r}) on a wild type`,
            ...base,
            value: snapshot(sample),
          });
      } catch (err) {
        if (!(err instanceof Error))
          out.push({
            oracle: 'O4',
            message: `getValidationErrors threw a non-Error (${typeof err}) on a wild type`,
            ...base,
            value: snapshot(sample),
          });
      }
    }
  }
}

// --- Tier B (mock lane) — values from the REAL createMockDataFn (nonDataTypes on).
// The serialize-vs-fail tier is read from the ACTUAL encoder behaviour, not the
// resolver's diagnostics: the resolver over-reports Error-severity diagnostics
// for non-serialisable positions inside DROPPED subtrees (e.g. a dropped
// `Promise<Set<Float64Array>>` property), so a type can carry an Error and still
// serialize. The encoder either works or `alwaysThrow`s — that's the ground truth.
function checkMockBehaviour(compiled: CompiledType, seed: number, out: Violation[], stats: FuzzStats): void {
  const target = asFuzzTarget(compiled);
  const mock = compiled.wired.mock;
  if (!target || !mock) {
    // Some factory failed to wire (a wire-time alwaysThrow on a collapse type —
    // controlled-ness already policed by TR4). Behaviour is robustness-only.
    runRobustnessProbe(compiled, seed, out);
    return;
  }
  let value: unknown;
  try {
    value = mock();
  } catch {
    // The mock can't always build a value (e.g. a stray `never` deep inside a
    // serialisable shell); fall back to robustness rather than risk a false find.
    runRobustnessProbe(compiled, seed, out);
    return;
  }
  const base = {target: compiled.title, seed, phase: 'valid' as const, value: snapshot(value)};

  // Probe each encoder: does it serialize, alwaysThrow (controlled), or throw
  // uncontrolled (a bug)?
  const json = probeEncode(target.jsonEncode!, value);
  const bin = probeEncode(target.binaryEncode!, value);
  if (json.uncontrolled) out.push({oracle: 'O7', message: `jsonEncode threw an uncontrolled error: ${json.error}`, ...base});
  if (bin.uncontrolled) out.push({oracle: 'O7', message: `binaryEncode threw an uncontrolled error: ${bin.error}`, ...base});

  // O14 — JSON and binary must AGREE on serialize-vs-fail (the rule is the same
  // for every serialization family).
  if (json.ok !== bin.ok) {
    out.push({
      oracle: 'O14',
      message: `serialization families disagree: jsonEncode ${json.ok ? 'serialized' : 'alwaysThrew'} but binaryEncode ${bin.ok ? 'serialized' : 'alwaysThrew'}`,
      ...base,
    });
    return;
  }

  // Collapse: both encoders alwaysThrow. The contract says a collapse must carry
  // an Error-severity diagnostic (fail ⇒ error).
  if (!json.ok) {
    if (compiled.errorDiagnostics.length === 0)
      out.push({oracle: 'O10', message: 'both encoders alwaysThrow but no Error-severity diagnostic was emitted', ...base});
    return;
  }

  // Serialize tier — the stripped members are dropped; the round-trips must be
  // wire-stable and the two wires must agree on the decoded value.
  const ctx = {seed, phase: 'valid' as const};
  stats.strongOracleRuns++;
  push(out, checkValidAccepted(target, value, ctx)); // O1 — mock conforms
  push(out, checkValidateTotal(target, value, ctx)); // O3
  push(out, checkErrorsAgree(target, value, ctx)); // O4
  push(out, checkJsonStable(target, value, ctx)); // O5 + O7 (JSON wire-stable)
  push(out, checkBinaryStable(target, value, ctx)); // O6 + O7 (binary byte-stable)
  push(out, checkCrossWire(target, value, ctx)); // O12 (wires agree on the value)
}

interface EncodeProbe {
  ok: boolean;
  uncontrolled: boolean;
  error?: string;
}

// Run an encoder once: ok when it returns, controlled-throw when it alwaysThrows
// a `[CODE]` error, uncontrolled when it throws anything else (a bug).
function probeEncode(fn: (v: unknown) => unknown, value: unknown): EncodeProbe {
  try {
    fn(value);
    return {ok: true, uncontrolled: false};
  } catch (err) {
    const controlled = err instanceof Error && isControlledThrow(err.message);
    return {ok: false, uncontrolled: !controlled, error: err instanceof Error ? err.message : String(err)};
  }
}

function asFuzzTarget(compiled: CompiledType): FuzzTarget | null {
  const w = compiled.wired;
  if (!w.validate || !w.getValidationErrors || !w.jsonEncode || !w.jsonDecode || !w.binaryEncode || !w.binaryDecode) return null;
  return {
    title: compiled.title,
    schema: {kind: 0} as RunType,
    mock: () => validValue(compiled.gen),
    validate: w.validate,
    getValidationErrors: w.getValidationErrors,
    jsonEncode: w.jsonEncode,
    jsonDecode: w.jsonDecode,
    binaryEncode: w.binaryEncode,
    binaryDecode: w.binaryDecode,
  };
}

function push(out: Violation[], violation: Violation | null): void {
  if (violation) out.push(violation);
}
