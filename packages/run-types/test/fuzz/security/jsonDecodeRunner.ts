// The secjson lane driver: generate a random SERIALISABLE type, compile it,
// encode one conforming value to its JSON wire, walk the parsed tree for every
// attackable position, and run the dictionary (plus blind junk mutations)
// through the three JSON decoders and `parse`, in process.

import {mixSeed, withSeededRandom, mulberry32} from '../core/seededRng.ts';
import {runFuzzLoop} from '../core/runLoop.ts';
import {genType, isRecursive, DATA_GEN_OPTIONS, type GenOptions} from '../core/typeGen.ts';
import {genValidValue, valueOracleSafe} from '../value/shapeValue.ts';
import {
  ClientHolder,
  compileWithTimeout,
  applyTsGate,
  newStats,
  mergeCounts,
  targetTitle,
  type SecurityReport,
  type LaneStats,
} from './laneShared.ts';
import {collectPositions, type Position} from './positions.ts';
import {dictionaryAttacks, blindAttack, type TreeAttack} from './treeMutations.ts';
import {checkJsonDecode, checkGlobals, snapshotGlobals, type JsonProbe, type SecurityViolation} from './securityOracle.ts';

export interface JsonFuzzOptions {
  seed?: number;
  iterations?: number;
  gen?: Partial<GenOptions>;
  /** Positions attacked with the whole dictionary per type (sampled past this). **/
  positionLimit?: number;
  /** Blind mutations per type. **/
  blindCount?: number;
}

const DEFAULT_SEED = 0x5ec150;
const DEFAULT_ITERATIONS = 40;
const DEFAULT_POSITION_LIMIT = 24;
const DEFAULT_BLIND = 32;

interface Lane {
  holder: ClientHolder;
  gen: GenOptions;
  positionLimit: number;
  blindCount: number;
  violations: SecurityViolation[];
  stats: LaneStats;
}

function openLane(options: JsonFuzzOptions): Lane {
  return {
    holder: new ClientHolder(),
    gen: {...DATA_GEN_OPTIONS, ...options.gen},
    positionLimit: options.positionLimit ?? DEFAULT_POSITION_LIMIT,
    blindCount: options.blindCount ?? DEFAULT_BLIND,
    violations: [],
    stats: newStats(),
  };
}

export async function runJsonFuzz(options: JsonFuzzOptions = {}): Promise<SecurityReport> {
  const lane = openLane(options);
  try {
    const loop = await runFuzzLoop<SecurityViolation>(
      {seed: options.seed, defaultSeed: DEFAULT_SEED, rounds: options.iterations ?? DEFAULT_ITERATIONS},
      (round) => round.run('secjson', round.round, (iterSeed) => fuzzOne(lane, iterSeed))
    );
    return {runs: loop.runs, seed: loop.seed, violations: lane.violations, crashes: loop.crashes, ...lane.stats};
  } finally {
    lane.holder.close();
  }
}

export async function runJsonFuzzForDuration(
  durationMs: number,
  options: JsonFuzzOptions = {},
  onViolation?: (v: SecurityViolation) => void
): Promise<SecurityReport> {
  const lane = openLane(options);
  try {
    const loop = await runFuzzLoop<SecurityViolation>(
      {seed: options.seed, defaultSeed: DEFAULT_SEED, durationMs, violations: lane.violations, onViolation},
      (round) => round.run('secjson', round.round, (iterSeed) => fuzzOne(lane, iterSeed))
    );
    return {
      runs: loop.runs,
      seed: loop.seed,
      violations: lane.violations,
      crashes: loop.crashes,
      ...lane.stats,
      slowestIterationMs: loop.slowestIterationMs,
      slowestIterationRound: loop.slowestIterationRound,
    };
  } finally {
    lane.holder.close();
  }
}

async function fuzzOne(lane: Lane, seed: number): Promise<void> {
  const generated = withSeededRandom(seed, () => genType(lane.gen));
  if (isRecursive(generated) || !valueOracleSafe(generated)) {
    lane.stats.skipped++;
    return;
  }
  const compiled = await compileWithTimeout(lane.holder, generated);
  if (!compiled || compiled.resolverError || compiled.evalError || compiled.errorDiagnostics.length > 0) {
    lane.stats.skipped++;
    return;
  }
  if (!compiled.validate || !compiled.jsonEncode || Object.keys(compiled.decoders).length === 0) {
    lane.stats.skipped++;
    return;
  }
  const {value, floored} = withSeededRandom(mixSeed(seed, 'value', 0), () => genValidValue(generated));
  if (floored) {
    lane.stats.skipped++;
    return;
  }
  let text: string | undefined;
  try {
    text = compiled.jsonEncode(value);
  } catch {
    lane.stats.skipped++;
    return;
  }
  if (text === undefined) {
    lane.stats.skipped++;
    return;
  }
  const tree = JSON.parse(text) as unknown;
  const positions = collectPositions(generated, tree);
  const probe: JsonProbe = {parse: compiled.parse, decoders: compiled.decoders, validate: compiled.validate};
  const ctx = {target: targetTitle(generated), seed};
  const rng = mulberry32(mixSeed(seed, 'attacks', 0));
  const before = lane.violations.length;
  const globals = snapshotGlobals();
  lane.stats.checked++;

  // Attacks are generated and dropped one position at a time: a type's full
  // attack set (positions × entries × decoders) would otherwise sit in memory
  // at once, texts and trees included.
  const runAttack = (attack: TreeAttack): void => {
    const result = checkJsonDecode(probe, attack, ctx);
    lane.violations.push(...result.violations);
    mergeCounts(lane.stats.outcomes, result.throws);
    const family = attack.id.replace(/\.\d+$/, '');
    lane.stats.applied[family] = (lane.stats.applied[family] ?? 0) + 1;
  };
  for (const position of samplePositions(positions, lane.positionLimit, rng)) {
    for (const attack of dictionaryAttacks(tree, position, rng)) runAttack(attack);
  }
  withSeededRandom(mixSeed(seed, 'blind', 0), () => {
    for (let i = 0; i < lane.blindCount; i++) {
      const attack = blindAttack(tree, positions, i);
      if (attack) runAttack(attack);
    }
  });
  const global = checkGlobals(globals, 'run', ctx);
  if (global) lane.violations.push(global);
  applyTsGate(generated, lane.violations, before, lane.stats);
}

function samplePositions(positions: Position[], limit: number, rng: () => number): Position[] {
  if (positions.length <= limit) return positions;
  // Keep every distinct kind at least once, then fill up at random.
  const byKind = new Map<string, Position>();
  for (const position of positions) if (!byKind.has(position.kind)) byKind.set(position.kind, position);
  const chosen = new Set<Position>(byKind.values());
  while (chosen.size < limit) chosen.add(positions[Math.floor(rng() * positions.length)]);
  return [...chosen];
}
