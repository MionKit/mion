// The secbinary lane driver: generate a random SERIALISABLE type, compile it,
// encode one conforming value to its binary wire, and hand the type's entry
// modules + wire to the heap-capped worker, which runs the blind byte
// mutators and the dictionary's byte payloads at every wire-map position and
// reports the oracle verdicts. A worker crash (out of memory, hang) is a crash
// record with the attack and the seed.

import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {runFuzzLoop} from '../core/runLoop.ts';
import {genType, isRecursive, DATA_GEN_OPTIONS, type GenOptions} from '../core/typeGen.ts';
import {genValidValue, valueOracleSafe} from '../value/shapeValue.ts';
import type {CrashRecord} from '../core/crashGuard.ts';
import {SecurityWorkerHost, type WorkerHostOptions} from './securityWorkerHost.ts';
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
import type {SecurityViolation} from './securityOracle.ts';

export interface BinaryFuzzOptions {
  seed?: number;
  iterations?: number;
  gen?: Partial<GenOptions>;
  /** Blind mutations per type. **/
  blindCount?: number;
  /** Wire-map records attacked with the dictionary per type. **/
  recordLimit?: number;
  worker?: Partial<WorkerHostOptions>;
}

const DEFAULT_SEED = 0x5ec0b1;
const DEFAULT_ITERATIONS = 30;
const DEFAULT_BLIND = 48;
const DEFAULT_RECORD_LIMIT = 40;

interface Lane {
  holder: ClientHolder;
  host: SecurityWorkerHost;
  gen: GenOptions;
  blindCount: number;
  recordLimit: number;
  violations: SecurityViolation[];
  workerCrashes: CrashRecord[];
  stats: LaneStats;
}

function openLane(options: BinaryFuzzOptions): Lane {
  return {
    holder: new ClientHolder(),
    host: new SecurityWorkerHost(options.worker),
    gen: {...DATA_GEN_OPTIONS, ...options.gen},
    blindCount: options.blindCount ?? DEFAULT_BLIND,
    recordLimit: options.recordLimit ?? DEFAULT_RECORD_LIMIT,
    violations: [],
    workerCrashes: [],
    stats: newStats(),
  };
}

function closeLane(lane: Lane): void {
  lane.holder.close();
  lane.host.close();
}

export async function runBinaryFuzz(options: BinaryFuzzOptions = {}): Promise<SecurityReport> {
  const lane = openLane(options);
  try {
    const loop = await runFuzzLoop<SecurityViolation>(
      {seed: options.seed, defaultSeed: DEFAULT_SEED, rounds: options.iterations ?? DEFAULT_ITERATIONS},
      (round) => round.run('secbinary', round.round, (iterSeed) => fuzzOne(lane, iterSeed))
    );
    return {
      runs: loop.runs,
      seed: loop.seed,
      violations: lane.violations,
      crashes: [...loop.crashes, ...lane.workerCrashes],
      ...lane.stats,
    };
  } finally {
    closeLane(lane);
  }
}

export async function runBinaryFuzzForDuration(
  durationMs: number,
  options: BinaryFuzzOptions = {},
  onViolation?: (v: SecurityViolation) => void
): Promise<SecurityReport> {
  const lane = openLane(options);
  try {
    const loop = await runFuzzLoop<SecurityViolation>(
      {seed: options.seed, defaultSeed: DEFAULT_SEED, durationMs, violations: lane.violations, onViolation},
      (round) => round.run('secbinary', round.round, (iterSeed) => fuzzOne(lane, iterSeed))
    );
    return {
      runs: loop.runs,
      seed: loop.seed,
      violations: lane.violations,
      crashes: [...loop.crashes, ...lane.workerCrashes],
      ...lane.stats,
      slowestIterationMs: loop.slowestIterationMs,
      slowestIterationRound: loop.slowestIterationRound,
    };
  } finally {
    closeLane(lane);
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
  if (!compiled.validate || !compiled.binaryEncode || !compiled.binaryDecode) {
    lane.stats.skipped++;
    return;
  }
  const {value, floored} = withSeededRandom(mixSeed(seed, 'value', 0), () => genValidValue(generated));
  if (floored) {
    lane.stats.skipped++;
    return;
  }
  let wire: Uint8Array;
  try {
    wire = compiled.binaryEncode(value);
  } catch {
    // The encoder refusing the value is the round-trip lane's business.
    lane.stats.skipped++;
    return;
  }
  lane.stats.checked++;
  const before = lane.violations.length;
  const target = targetTitle(generated);
  const result = await lane.host.run({
    type: 'binary',
    seed,
    target,
    entryModules: compiled.entryModules,
    rootKeys: compiled.rootKeys,
    wire,
    blindCount: lane.blindCount,
    recordLimit: lane.recordLimit,
  });
  if (result.crash) {
    lane.workerCrashes.push({seed, message: `[SB-OOM] ${target} · ${result.crash.attack}: ${result.crash.message}`});
    return;
  }
  const done = result.done!;
  lane.violations.push(...done.violations);
  mergeCounts(lane.stats.applied, done.applied);
  mergeCounts(lane.stats.outcomes, done.outcomes);
  applyTsGate(generated, lane.violations, before, lane.stats);
}
