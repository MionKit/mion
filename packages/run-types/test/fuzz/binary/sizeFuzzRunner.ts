// Size-estimate fuzz driver — for each (config, seed) it generates a random
// SERIALISABLE type (the existing typeGen, DATA_GEN_OPTIONS), compiles it with
// that estimator config (so the baked seed matches), then sources values from
// the product `createMockDataFn` with `respectBinarySize`:
//   - true  -> an in-bounds value: the cold buffer MUST NOT resize + round-trips
//   - false -> an oversized value: the cold buffer MUST resize + round-trips
//
// The oracle is dumb (sizeOracle.ts) — all the "does it fit?" logic lives in
// createMockDataFn's bounds (applyInBoundsSizing) and the matching estimate
// (binary_size_estimate.go). Mirrors typeFuzzRunner.ts: deterministic
// per-iteration seeds (mixSeed) and a duration-based soak variant. Bias stays 1
// (in-bounds == within the capped max); items / stringBytes / maxBytes vary,
// including adversarial small-stringBytes configs that stress the string / key
// reserve floors.

import {createMockDataFn} from '@mionjs/run-types';
import type {BinarySizingOptions} from '../../../src/mocking/mockTypes.ts';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {runFuzzLoop} from '../core/runLoop.ts';
import {genType, isRecursive, DATA_GEN_OPTIONS, type GeneratedType} from '../core/typeGen.ts';
import {openClient, compileType, hasBinary, BIN, type CompiledType} from '../type/typeFuzzHarness.ts';
import {checkInBounds, checkOversized, type SizeViolation} from './sizeOracle.ts';
import {type CrashRecord} from '../core/crashGuard.ts';
import {sizeLaneEligible} from './sizeEligible.ts';

export {hasBinary, BIN};

/** Bias-1 configs that vary the count / string / cap anchors (and one clamped
 *  cap). Bias 1 keeps createMockDataFn's in-bounds bounding exact. The last two are
 *  ADVERSARIAL: tiny stringBytes with mismatched items stresses the string / regexp
 *  / index-sig-key reserve floors the audit surfaced (where comparably-sized
 *  configs mask the under-budget). **/
export const SIZE_CONFIGS: ReadonlyArray<Required<BinarySizingOptions>> = [
  {sizeBias: 1, sizeItems: 8, sizeStringBytes: 8, sizeMaxBytes: 65536},
  {sizeBias: 1, sizeItems: 32, sizeStringBytes: 24, sizeMaxBytes: 65536},
  {sizeBias: 1, sizeItems: 64, sizeStringBytes: 48, sizeMaxBytes: 65536},
  {sizeBias: 1, sizeItems: 40, sizeStringBytes: 32, sizeMaxBytes: 2048}, // tight cap -> exercise the clamp
  {sizeBias: 1, sizeItems: 2, sizeStringBytes: 1, sizeMaxBytes: 65536}, // tiny strings + index-sig keys
  {sizeBias: 1, sizeItems: 64, sizeStringBytes: 4, sizeMaxBytes: 65536}, // many items, sub-floor strings
];

/** A fixed, always-eligible type used as the DETERMINISTIC FLOOR (see `runFloor`).
 *  Its in-bounds mock fits the cold buffer (no resize) and its oversized mock
 *  inflates an unbounded position (`tag` / the `items` elements) far past the
 *  tiny seed (grow), so running it under `SIZE_CONFIGS[0]` exercises BOTH lanes
 *  regardless of what the random fuzz happens to produce. The lane guards would
 *  otherwise go vacuous when every fuzz iteration skips — which is what a
 *  resolver dying under full-suite load does (one crash closes the client, so
 *  every later request on it throws and cascades to `skipped`). **/
const FLOOR_TYPE: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [
      {name: 'tag', optional: false, readonly: false, method: false, shape: {kind: 'string'}},
      {name: 'items', optional: false, readonly: false, method: false, shape: {kind: 'array', elem: {kind: 'string'}}},
    ],
  },
};

/** How many times to respawn a FRESH resolver client after one dies before
 *  giving up on a case. A dead client's transport stays closed, so without a
 *  respawn every later request throws — cascading a single transient crash into
 *  skipping the rest of a config (the vacuous-run flake). Node reports spawn
 *  failures asynchronously (the transport just closes), so this covers both a
 *  crashed child and a child that never came up. **/
const RESOLVER_RETRIES = 3;

export interface SizeFuzzOptions {
  seed?: number;
  /** Total types to generate across all configs. **/
  iterations?: number;
}

export interface SizeFuzzStats {
  /** In-bounds values run through the no-resize lane (every checked type). **/
  noGrowChecked: number;
  /** Oversized values that genuinely exceeded the seed and exercised the grow path. **/
  negativesExercised: number;
  /** Types skipped (resolver/eval error, recursive, no estimate slot, clamped seed). **/
  skipped: number;
}

export interface SizeFuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: SizeViolation[];
  /** Hard failures captured by the crash guard (core/crashGuard.ts), each with
   *  its replay seed. The deterministic floor stays UNGUARDED on purpose — its
   *  loud failure is the resolver-reachable proof. **/
  crashes: CrashRecord[];
  stats: SizeFuzzStats;
  /** Duration runs only: the slowest single iteration and its zero-based round,
   *  for the soak pathology tripwire (SOAK_ITERATION_CEILING_MS). **/
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

const DEFAULT_SEED = 0xc0ffee;
const DEFAULT_ITERATIONS = 80;

interface OneResult {
  violations: SizeViolation[];
  noGrow: number;
  exercised: number;
  skipped: number;
  /** The resolver call itself errored (the child likely died) — the caller
   *  respawns a fresh client and retries rather than cascading to `skipped`. **/
  resolverFailed: boolean;
}

function makeMock(compiled: CompiledType, respectBinarySize: boolean, binarySizingOptions: BinarySizingOptions): () => unknown {
  return createMockDataFn(
    undefined,
    {mock: {respectBinarySize, binarySizingOptions}},
    compiled.reflectionTuple as never
  ) as () => unknown;
}

// Compile + check a single generated type. Never throws.
async function runOne(
  client: ReturnType<typeof openClient>,
  cfg: Required<BinarySizingOptions>,
  iterSeed: number
): Promise<OneResult> {
  const out: OneResult = {violations: [], noGrow: 0, exercised: 0, skipped: 0, resolverFailed: false};
  const gen = withSeededRandom(iterSeed, () => genType(DATA_GEN_OPTIONS));
  // The in-process linker can't faithfully run a cyclic factory graph (typeFuzz
  // restricts recursive types to the resolver/emit oracles) — skip them here.
  // sizeLaneEligible only excludes the non-data leaves DATA_GEN doesn't emit.
  if (isRecursive(gen) || !sizeLaneEligible(gen)) {
    out.skipped = 1;
    return out;
  }
  const compiled = await compileType(client, gen);
  // A resolver error (setSources / scanFiles threw) means the child likely died,
  // so flag it for a respawn+retry — otherwise every later request on this now
  // closed client throws too, cascading to an all-skipped (vacuous) run.
  if (compiled.resolverError) {
    out.skipped = 1;
    out.resolverFailed = true;
    return out;
  }
  if (
    compiled.evalError ||
    compiled.errorDiagnostics.length ||
    compiled.seed === undefined ||
    !compiled.binarySizer ||
    !compiled.wired.binaryEncode ||
    !compiled.reflectionTuple
  ) {
    out.skipped = 1;
    return out;
  }
  // A clamped estimate (a subtree exceeded sizeMaxBytes -> the whole seed is
  // >= sizeMaxBytes) deliberately under-allocates so a huge declared type doesn't
  // seed a multi-MB cold buffer; grow-in-place covers it. The todo scopes this
  // "larger than the rules assume" case OUT, so skip in-bounds checking it.
  if (compiled.seed >= cfg.sizeMaxBytes) {
    out.skipped = 1;
    return out;
  }
  const ctx = {seed: iterSeed};

  let inBoundsValue: unknown;
  let oversizedValue: unknown;
  try {
    inBoundsValue = withSeededRandom(mixSeed(iterSeed, 'value', 0), () => makeMock(compiled, true, cfg)());
    oversizedValue = withSeededRandom(mixSeed(iterSeed, 'over', 0), () => makeMock(compiled, false, cfg)());
  } catch {
    out.skipped = 1; // mock wiring degraded (alwaysThrow factory etc.)
    return out;
  }

  out.violations.push(...checkInBounds(compiled, inBoundsValue, ctx));
  out.noGrow = 1;

  const neg = checkOversized(compiled, oversizedValue, ctx);
  if (neg.violation) out.violations.push(neg.violation);
  if (neg.exercised) out.exercised = 1;
  return out;
}

interface FloorResult {
  violations: SizeViolation[];
  noGrow: number;
  exercised: number;
}

// Compile + check the deterministic FLOOR case under SIZE_CONFIGS[0], respawning
// a fresh client if the resolver dies mid-attempt. This is what keeps the lane
// guards non-vacuous: whenever the resolver is reachable AT ALL, the floor drives
// one in-bounds no-grow check and one oversized grow, so noGrowChecked and
// negativesExercised are > 0 by construction — the random fuzz then piles variety
// on top. Throws ONLY when the resolver can't compile a trivial type across every
// retry (a genuine "resolver unavailable" — reported as such instead of the
// misleading "no-resize lane never ran") or when the floor loses its teeth (the
// oversized negative control stops growing — a real mock-sizing regression).
async function runFloor(seed: number): Promise<FloorResult> {
  const cfg = SIZE_CONFIGS[0];
  let lastError = 'unknown';
  for (let attempt = 0; attempt <= RESOLVER_RETRIES; attempt++) {
    const client = openClient(cfg);
    try {
      const compiled = await compileType(client, FLOOR_TYPE);
      if (compiled.resolverError) {
        lastError = compiled.resolverError; // client died — respawn + retry
        continue;
      }
      if (
        compiled.evalError ||
        compiled.errorDiagnostics.length ||
        compiled.seed === undefined ||
        compiled.seed >= cfg.sizeMaxBytes ||
        !compiled.binarySizer ||
        !compiled.wired.binaryEncode ||
        !compiled.reflectionTuple
      ) {
        // The floor is hand-picked to always yield a clean binary surface with a
        // small seed; losing it is a real regression, not a transient blip.
        throw new Error(
          `size fuzz floor lost its binary surface (seed=${compiled.seed}, errs=${compiled.errorDiagnostics.length}, evalError=${compiled.evalError ?? 'none'})`
        );
      }
      const ctx = {seed};
      let inBoundsValue: unknown;
      let oversizedValue: unknown;
      try {
        inBoundsValue = withSeededRandom(mixSeed(seed, 'floor-value', 0), () => makeMock(compiled, true, cfg)());
        oversizedValue = withSeededRandom(mixSeed(seed, 'floor-over', 0), () => makeMock(compiled, false, cfg)());
      } catch (err) {
        throw new Error(`size fuzz floor mock wiring failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      const violations = [...checkInBounds(compiled, inBoundsValue, ctx)];
      const neg = checkOversized(compiled, oversizedValue, ctx);
      if (neg.violation) violations.push(neg.violation);
      if (!neg.exercised) {
        throw new Error(
          'size fuzz floor: the oversized value did not grow the cold buffer — the respectBinarySize:false negative control lost its teeth (mock-sizing regression?)'
        );
      }
      return {violations, noGrow: 1, exercised: 1};
    } finally {
      client.close();
    }
  }
  throw new Error(
    `size fuzz could not compile its floor type after ${RESOLVER_RETRIES + 1} attempts — the resolver appears unavailable ` +
      `(last error: ${lastError}). This is an environment failure, not a size regression.`
  );
}

// Run one fuzz case, respawning the client on resolver death so a single
// transient crash doesn't cascade to skipping the config's remaining iterations.
// Returns the (possibly respawned) client for the caller to keep using.
async function runOneWithRespawn(
  client: ReturnType<typeof openClient>,
  cfg: Required<BinarySizingOptions>,
  iterSeed: number
): Promise<{result: OneResult; client: ReturnType<typeof openClient>}> {
  let result = await runOne(client, cfg, iterSeed);
  for (let retry = 0; result.resolverFailed && retry < RESOLVER_RETRIES; retry++) {
    client.close();
    client = openClient(cfg);
    result = await runOne(client, cfg, iterSeed);
  }
  return {result, client};
}

function emptyStats(): SizeFuzzStats {
  return {noGrowChecked: 0, negativesExercised: 0, skipped: 0};
}

/** Iterations one config block runs in the soak before the next config takes
 *  over on a fresh client. **/
const SOAK_BLOCK_ITERATIONS = 25;

// This lane fuzzes in BLOCKS: a run of iterations sharing one config and one
// resolver client. The shared loop (core/runLoop.ts) counts flat rounds, so the
// block index is derived from the round and this holder swaps the client when
// the block changes. `runOneWithRespawn` can also swap it mid-block after a
// resolver death, which is what `replace` is for.
class BlockClient {
  private client: ReturnType<typeof openClient> | null = null;
  private block = -1;
  forBlock(block: number, cfg: Required<BinarySizingOptions>): ReturnType<typeof openClient> {
    if (block !== this.block) {
      this.close();
      this.client = openClient(cfg);
      this.block = block;
    }
    return this.client!;
  }
  replace(client: ReturnType<typeof openClient>): void {
    this.client = client;
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

function accumulate(
  stats: SizeFuzzStats,
  violations: SizeViolation[],
  r: {violations: SizeViolation[]; noGrow: number; exercised: number; skipped?: number}
): void {
  violations.push(...r.violations);
  stats.noGrowChecked += r.noGrow;
  stats.negativesExercised += r.exercised;
  stats.skipped += r.skipped ?? 0;
}

/** Run a fixed number of generated types, distributed across the configs. **/
export async function runSizeFuzz(options: SizeFuzzOptions = {}): Promise<SizeFuzzReport> {
  if (!hasBinary()) throw new Error(`mion binary not built: ${BIN}`);
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const perConfig = Math.ceil(iterations / SIZE_CONFIGS.length);
  const violations: SizeViolation[] = [];
  const stats = emptyStats();
  const clients = new BlockClient();

  try {
    const loop = await runFuzzLoop<SizeViolation>(
      {
        seed: options.seed,
        defaultSeed: DEFAULT_SEED,
        rounds: iterations,
        // Deterministic floor first: guarantees both lanes ran (or fails loudly
        // with a resolver-unavailable / lost-teeth message) so the guards can't
        // trip on a run the random fuzz left vacuous. It stays OUTSIDE the crash
        // guard on purpose — its loud failure is the resolver-reachable proof.
        setup: async (seed) => accumulate(stats, violations, await runFloor(seed)),
      },
      async (round) => {
        const block = Math.floor(round.round / perConfig);
        const cfg = SIZE_CONFIGS[block];
        await round.run(`cfg${block}`, round.round % perConfig, async (iterSeed) => {
          const step = await runOneWithRespawn(clients.forBlock(block, cfg), cfg, iterSeed);
          clients.replace(step.client);
          accumulate(stats, violations, step.result);
        });
      }
    );
    return {runs: loop.runs, iterations, seed: loop.seed, violations, crashes: loop.crashes, stats};
  } finally {
    clients.close();
  }
}

/** Soak variant — generate types continuously for `durationMs`, logging each
 *  violation via `onViolation`. Mirrors runTypeFuzzForDuration. **/
export async function runSizeFuzzForDuration(
  durationMs: number,
  options: SizeFuzzOptions = {},
  onViolation?: (v: SizeViolation) => void,
  now: () => number = () => Date.now()
): Promise<SizeFuzzReport> {
  if (!hasBinary()) throw new Error(`mion binary not built: ${BIN}`);
  const violations: SizeViolation[] = [];
  const stats = emptyStats();
  const clients = new BlockClient();

  try {
    const loop = await runFuzzLoop<SizeViolation>(
      {
        seed: options.seed,
        defaultSeed: DEFAULT_SEED,
        durationMs,
        now,
        violations,
        onViolation,
        // Same deterministic floor as runSizeFuzz — keeps the lanes non-vacuous
        // and proves the resolver is reachable before the soak commits to a long
        // run. Its cost counts against the budget (as it always has) but is not
        // marked as an iteration: it is fixed setup, not a sample of per-type
        // cost. Its violations stream here because the loop only streams steps.
        setup: async (seed) => {
          const floor = await runFloor(seed);
          accumulate(stats, violations, floor);
          for (const v of floor.violations) onViolation?.(v);
        },
      },
      async (round) => {
        const block = Math.floor(round.round / SOAK_BLOCK_ITERATIONS);
        const cfg = SIZE_CONFIGS[block % SIZE_CONFIGS.length];
        await round.run(`soak${block}`, round.round % SOAK_BLOCK_ITERATIONS, async (iterSeed) => {
          const step = await runOneWithRespawn(clients.forBlock(block, cfg), cfg, iterSeed);
          clients.replace(step.client);
          accumulate(stats, violations, step.result);
        });
      }
    );
    return {
      runs: loop.runs,
      iterations: loop.runs,
      seed: loop.seed,
      violations,
      crashes: loop.crashes,
      stats,
      slowestIterationMs: loop.slowestIterationMs,
      slowestIterationRound: loop.slowestIterationRound,
    };
  } finally {
    clients.close();
  }
}
