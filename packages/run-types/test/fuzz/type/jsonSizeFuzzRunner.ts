// JSON size bound fuzz driver — the build-time `jsonMaxBytes` (the Go jsonsize
// walk, emitted on every fully bounded reflection root) must be a true upper
// bound of what the serializer actually emits. For each seed it generates a
// BOUNDED type (typeGen with `boundedSizes`), compiles it, reads the bound off
// the reflection root, then draws values from the product `createMockDataFn`
// and measures them two ways:
//   - JS-MAX-STRINGIFY: `JSON.stringify(value)` in UTF-8 bytes (the raw value)
//   - JS-MAX-ENCODER:   the compiled JSON encoder's output in UTF-8 bytes (what
//                       the router / client really put on the wire)
// Both must be <= jsonMaxBytes. Two generator presets run: the serialisable
// one, and the DataOnly one (functions / symbols / Promise members), so the
// walk's "a dropped member costs at most `null`" rule is checked against the
// encoder that drops them.
//
// The oracle is dumb (a byte comparison); the teeth are the deterministic
// floor (`runFloor`): a fixed bounded type whose hand-inflated value MUST
// exceed its bound, else the comparison could never fire.

import {getRunType} from '@mionjs/run-types';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {runFuzzLoop} from '../core/runLoop.ts';
import {
  genType,
  isRecursive,
  DATA_GEN_OPTIONS,
  NONDATA_GEN_OPTIONS,
  BOUNDED_FORMAT_LEAVES,
  type GenOptions,
  type GeneratedType,
} from '../core/typeGen.ts';
import {openClient, compileType, hasBinary, BIN, type CompiledType} from './typeFuzzHarness.ts';
import {type CrashRecord} from '../core/crashGuard.ts';

export {hasBinary, BIN};

export type JsonSizeOracleId = 'JS-MAX-STRINGIFY' | 'JS-MAX-ENCODER';

export interface JsonSizeViolation {
  oracle: JsonSizeOracleId;
  type: string;
  /** The iteration seed — replay with `runJsonSizeFuzz({seed})`. **/
  seed: number;
  message: string;
  value: string;
}

/** The two presets, both bounded: every string leaf a bounded format, every
 *  array a `maxItems`, every Map / Set a `maxSize`, no records or bigints. **/
export const BOUNDED_PRESETS: ReadonlyArray<{name: string; opts: GenOptions}> = [
  // no `declare class` refs: a class instance may take a registered serializer,
  // so the walk never bounds one and every type reaching a class would only
  // count as unbounded here
  {name: 'data', opts: {...DATA_GEN_OPTIONS, classes: false, boundedSizes: true, formatLeafPool: BOUNDED_FORMAT_LEAVES}},
  {name: 'nondata', opts: {...NONDATA_GEN_OPTIONS, classes: false, boundedSizes: true, formatLeafPool: BOUNDED_FORMAT_LEAVES}},
];

/** Values drawn per checked type. **/
const VALUES_PER_TYPE = 4;

/** The deterministic floor: `{tag: String<{maxLength: 8}>, items: FormattedArray<number[], {maxItems: 3}>}`.
 *  Its mock is checked like any other type, and a hand-inflated value must land
 *  OVER the bound: the proof the comparison has teeth. **/
export const FLOOR_TYPE: GeneratedType = {
  decls: [],
  root: {
    kind: 'object',
    props: [
      {name: 'tag', optional: false, readonly: false, method: false, shape: {kind: 'format', name: 'maxLen8'}},
      {
        name: 'items',
        optional: false,
        readonly: false,
        method: false,
        shape: {kind: 'array', elem: {kind: 'number'}, structural: {maxItems: 3}},
      },
    ],
  },
};
/** `{"tag":<2 + 6 × 8>,"items":[24,24,24]}`, the walk's own arithmetic. **/
export const FLOOR_BOUND = 2 + (5 + 1 + (2 + 6 * 8)) + 1 + (7 + 1 + (2 + 3 * 24 + 2));
/** Nine control characters (each `\uXXXX`, 6 bytes) where the type allows eight
 *  units, next to three longest-spelling doubles: 4 bytes over the bound. **/
const FLOOR_INFLATED = {
  tag: '\u0001'.repeat(9),
  items: [-1.7976931348623157e308, -1.7976931348623157e308, -1.7976931348623157e308],
};

const RESOLVER_RETRIES = 3;
const DEFAULT_SEED = 0x50c1a1;
const DEFAULT_ITERATIONS = 80;

export interface JsonSizeFuzzOptions {
  seed?: number;
  /** Total types to generate across both presets. **/
  iterations?: number;
}

export interface JsonSizeFuzzStats {
  /** Types that carried a bound and had their values measured. **/
  checked: number;
  /** Values measured (both oracles each). **/
  valuesChecked: number;
  /** Generated types the resolver reported unbounded (no `jsonMaxBytes`):
   *  expected for a share of the space (an intersection over a class, say),
   *  never for the floor. **/
  unbounded: number;
  /** Types skipped (resolver / eval error, recursive, mock or encoder not wired). **/
  skipped: number;
  /** The floor's inflated value exceeded its bound (the negative control). **/
  negativesExercised: number;
}

export interface JsonSizeFuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: JsonSizeViolation[];
  crashes: CrashRecord[];
  stats: JsonSizeFuzzStats;
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

interface StepResult {
  violations: JsonSizeViolation[];
  checked: number;
  valuesChecked: number;
  unbounded: number;
  skipped: number;
  negativesExercised: number;
  resolverFailed: boolean;
}

function emptyStep(): StepResult {
  return {violations: [], checked: 0, valuesChecked: 0, unbounded: 0, skipped: 0, negativesExercised: 0, resolverFailed: false};
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** The bound the build wrote on the compiled type's reflection root. **/
function boundOf(compiled: CompiledType): number | undefined {
  const reflectionId = compiled.sites.find((site) => !site.fnId)?.id;
  if (reflectionId === undefined) return undefined;
  return getRunType(undefined, reflectionId as never).jsonMaxBytes;
}

function measure(compiled: CompiledType, bound: number, value: unknown, seed: number): JsonSizeViolation[] {
  const out: JsonSizeViolation[] = [];
  // a root that stringifies to nothing (undefined, a function) puts no bytes on the wire
  const raw = JSON.stringify(value) ?? '';
  const rawBytes = utf8Bytes(raw);
  if (rawBytes > bound) {
    out.push({
      oracle: 'JS-MAX-STRINGIFY',
      type: compiled.title,
      seed,
      message: `JSON.stringify is ${rawBytes} bytes, over the type's jsonMaxBytes ${bound}`,
      value: raw.slice(0, 300),
    });
  }
  const encoded = compiled.wired.jsonEncode?.(value);
  if (typeof encoded === 'string') {
    const encodedBytes = utf8Bytes(encoded);
    if (encodedBytes > bound) {
      out.push({
        oracle: 'JS-MAX-ENCODER',
        type: compiled.title,
        seed,
        message: `the compiled JSON encoder emits ${encodedBytes} bytes, over the type's jsonMaxBytes ${bound}`,
        value: encoded.slice(0, 300),
      });
    }
  }
  return out;
}

async function runOne(client: ReturnType<typeof openClient>, opts: GenOptions, iterSeed: number): Promise<StepResult> {
  const out = emptyStep();
  const gen = withSeededRandom(iterSeed, () => genType(opts));
  if (isRecursive(gen)) {
    out.skipped = 1;
    return out;
  }
  const compiled = await compileType(client, gen);
  if (compiled.resolverError) {
    out.skipped = 1;
    out.resolverFailed = true;
    return out;
  }
  if (compiled.evalError || compiled.errorDiagnostics.length || !compiled.wired.mock || !compiled.wired.jsonEncode) {
    out.skipped = 1;
    return out;
  }
  let bound: number | undefined;
  try {
    bound = boundOf(compiled);
  } catch {
    out.skipped = 1;
    return out;
  }
  if (bound === undefined) {
    out.unbounded = 1;
    return out;
  }
  for (let i = 0; i < VALUES_PER_TYPE; i++) {
    let value: unknown;
    try {
      value = withSeededRandom(mixSeed(iterSeed, 'value', i), () => compiled.wired.mock!());
    } catch {
      out.skipped = 1;
      return out;
    }
    out.violations.push(...measure(compiled, bound, value, iterSeed));
    out.valuesChecked++;
  }
  out.checked = 1;
  return out;
}

async function runFloor(seed: number): Promise<StepResult> {
  let lastError = 'unknown';
  for (let attempt = 0; attempt <= RESOLVER_RETRIES; attempt++) {
    const client = openClient();
    try {
      const compiled = await compileType(client, FLOOR_TYPE);
      if (compiled.resolverError) {
        lastError = compiled.resolverError;
        continue;
      }
      if (compiled.evalError || compiled.errorDiagnostics.length || !compiled.wired.mock || !compiled.wired.jsonEncode) {
        throw new Error(
          `json size fuzz floor did not compile cleanly (errs=${compiled.errorDiagnostics.length}, evalError=${compiled.evalError ?? 'none'})`
        );
      }
      const bound = boundOf(compiled);
      if (bound !== FLOOR_BOUND) {
        throw new Error(`json size fuzz floor: expected jsonMaxBytes ${FLOOR_BOUND} on the root, got ${bound}`);
      }
      const value = withSeededRandom(mixSeed(seed, 'floor-value', 0), () => compiled.wired.mock!());
      const out = emptyStep();
      out.violations = measure(compiled, bound, value, seed);
      out.checked = 1;
      out.valuesChecked = 1;
      // the negative control: the comparison must fire on a value over the bound
      if (measure(compiled, bound, FLOOR_INFLATED, seed).length === 0) {
        throw new Error(
          `json size fuzz floor: the inflated value (${utf8Bytes(JSON.stringify(FLOOR_INFLATED))} bytes) did not pass the bound ${bound}, the comparison lost its teeth`
        );
      }
      out.negativesExercised = 1;
      return out;
    } finally {
      client.close();
    }
  }
  throw new Error(
    `json size fuzz could not compile its floor type after ${RESOLVER_RETRIES + 1} attempts, the resolver appears unavailable ` +
      `(last error: ${lastError}). This is an environment failure, not a size regression.`
  );
}

async function runOneWithRespawn(
  client: ReturnType<typeof openClient>,
  opts: GenOptions,
  iterSeed: number
): Promise<{result: StepResult; client: ReturnType<typeof openClient>}> {
  let result = await runOne(client, opts, iterSeed);
  for (let retry = 0; result.resolverFailed && retry < RESOLVER_RETRIES; retry++) {
    client.close();
    client = openClient();
    result = await runOne(client, opts, iterSeed);
  }
  return {result, client};
}

function emptyStats(): JsonSizeFuzzStats {
  return {checked: 0, valuesChecked: 0, unbounded: 0, skipped: 0, negativesExercised: 0};
}

function accumulate(stats: JsonSizeFuzzStats, violations: JsonSizeViolation[], step: StepResult): void {
  violations.push(...step.violations);
  stats.checked += step.checked;
  stats.valuesChecked += step.valuesChecked;
  stats.unbounded += step.unbounded;
  stats.skipped += step.skipped;
  stats.negativesExercised += step.negativesExercised;
}

const SOAK_BLOCK_ITERATIONS = 25;

class BlockClient {
  private client: ReturnType<typeof openClient> | null = null;
  private block = -1;
  forBlock(block: number): ReturnType<typeof openClient> {
    if (block !== this.block) {
      this.close();
      this.client = openClient();
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

/** Run a fixed number of generated types, split across the two presets. **/
export async function runJsonSizeFuzz(options: JsonSizeFuzzOptions = {}): Promise<JsonSizeFuzzReport> {
  if (!hasBinary()) throw new Error(`mion binary not built: ${BIN}`);
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const perPreset = Math.ceil(iterations / BOUNDED_PRESETS.length);
  const violations: JsonSizeViolation[] = [];
  const stats = emptyStats();
  const clients = new BlockClient();
  try {
    const loop = await runFuzzLoop<JsonSizeViolation>(
      {
        seed: options.seed,
        defaultSeed: DEFAULT_SEED,
        rounds: iterations,
        setup: async (seed) => accumulate(stats, violations, await runFloor(seed)),
      },
      async (round) => {
        const block = Math.floor(round.round / perPreset);
        const preset = BOUNDED_PRESETS[block % BOUNDED_PRESETS.length];
        await round.run(preset.name, round.round % perPreset, async (iterSeed) => {
          const step = await runOneWithRespawn(clients.forBlock(block), preset.opts, iterSeed);
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

/** Soak variant: generate bounded types continuously for `durationMs`. **/
export async function runJsonSizeFuzzForDuration(
  durationMs: number,
  options: JsonSizeFuzzOptions = {},
  onViolation?: (v: JsonSizeViolation) => void,
  now: () => number = () => Date.now()
): Promise<JsonSizeFuzzReport> {
  if (!hasBinary()) throw new Error(`mion binary not built: ${BIN}`);
  const violations: JsonSizeViolation[] = [];
  const stats = emptyStats();
  const clients = new BlockClient();
  try {
    const loop = await runFuzzLoop<JsonSizeViolation>(
      {
        seed: options.seed,
        defaultSeed: DEFAULT_SEED,
        durationMs,
        now,
        violations,
        onViolation,
        setup: async (seed) => {
          const floor = await runFloor(seed);
          accumulate(stats, violations, floor);
          for (const v of floor.violations) onViolation?.(v);
        },
      },
      async (round) => {
        const block = Math.floor(round.round / SOAK_BLOCK_ITERATIONS);
        const preset = BOUNDED_PRESETS[block % BOUNDED_PRESETS.length];
        await round.run(`soak${block}`, round.round % SOAK_BLOCK_ITERATIONS, async (iterSeed) => {
          const step = await runOneWithRespawn(clients.forBlock(block), preset.opts, iterSeed);
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
