// The secgen lane driver: generate a random type whose names and literals
// carry the nasty pool (quotes, backslashes, newlines, a Unicode line
// terminator, a planted marker), compile every family for it, and run the
// generated-code oracles over every emitted body. No input is decoded here:
// the corpus under scan is the JavaScript the emitters produced.

import {evalEntryModules} from '../../../../devtools/test/helpers/inline.ts';
import {withSeededRandom} from '../core/seededRng.ts';
import {runFuzzLoop} from '../core/runLoop.ts';
import {genType, DATA_GEN_OPTIONS, type GenOptions} from '../core/typeGen.ts';
import {ClientHolder, compileWithTimeout, applyTsGate, newStats, targetTitle, type LaneStats} from './laneShared.ts';
import {checkGeneratedCode, INJECT_MARKER, type EmittedBody, type GeneratedCodeViolation} from './generatedCodeOracle.ts';

export interface GeneratedCodeFuzzOptions {
  seed?: number;
  iterations?: number;
  gen?: Partial<GenOptions>;
}

export interface GeneratedCodeReport extends LaneStats {
  runs: number;
  seed: number;
  violations: GeneratedCodeViolation[];
  crashes: {seed: number; message: string}[];
  /** Emitted bodies scanned, over the whole run. **/
  bodies: number;
  /** Bodies that carried the marker inside a literal (the injection oracle
   *  is vacuous without them). **/
  markerBodies: number;
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

const DEFAULT_SEED = 0x5ec6e4;
const DEFAULT_ITERATIONS = 40;

interface Lane {
  holder: ClientHolder;
  gen: GenOptions;
  violations: GeneratedCodeViolation[];
  stats: LaneStats;
  bodies: number;
  markerBodies: number;
}

function openLane(options: GeneratedCodeFuzzOptions): Lane {
  return {
    holder: new ClientHolder(),
    gen: {...DATA_GEN_OPTIONS, weirdKeys: true, ...options.gen},
    violations: [],
    stats: newStats(),
    bodies: 0,
    markerBodies: 0,
  };
}

/** Every emitted body in a set of entry modules. An entry tuple carries its
 *  family tag in slot 0 and the factory body in slot 5 (a hole for a noop or
 *  an alwaysThrow entry, which have no body to scan). **/
export function emittedBodies(entryModules: Record<string, string>): EmittedBody[] {
  const out: EmittedBody[] = [];
  const tuples = evalEntryModules(entryModules);
  for (const [key, tuple] of Object.entries(tuples)) {
    const slots = tuple as readonly unknown[];
    const code = slots[5];
    if (typeof code !== 'string' || code === '') continue;
    const tag = typeof slots[0] === 'string' ? slots[0] : key.split('_')[0];
    out.push({key, family: tag, code});
  }
  return out;
}

export async function runGeneratedCodeFuzz(options: GeneratedCodeFuzzOptions = {}): Promise<GeneratedCodeReport> {
  const lane = openLane(options);
  try {
    const loop = await runFuzzLoop<GeneratedCodeViolation>(
      {seed: options.seed, defaultSeed: DEFAULT_SEED, rounds: options.iterations ?? DEFAULT_ITERATIONS},
      (round) => round.run('secgen', round.round, (iterSeed) => fuzzOne(lane, iterSeed))
    );
    return report(lane, loop);
  } finally {
    lane.holder.close();
  }
}

export async function runGeneratedCodeFuzzForDuration(
  durationMs: number,
  options: GeneratedCodeFuzzOptions = {},
  onViolation?: (v: GeneratedCodeViolation) => void
): Promise<GeneratedCodeReport> {
  const lane = openLane(options);
  try {
    const loop = await runFuzzLoop<GeneratedCodeViolation>(
      {seed: options.seed, defaultSeed: DEFAULT_SEED, durationMs, violations: lane.violations, onViolation},
      (round) => round.run('secgen', round.round, (iterSeed) => fuzzOne(lane, iterSeed))
    );
    return {
      ...report(lane, loop),
      slowestIterationMs: loop.slowestIterationMs,
      slowestIterationRound: loop.slowestIterationRound,
    };
  } finally {
    lane.holder.close();
  }
}

function report(lane: Lane, loop: {runs: number; seed: number; crashes: {seed: number; message: string}[]}): GeneratedCodeReport {
  return {
    runs: loop.runs,
    seed: loop.seed,
    violations: lane.violations,
    crashes: loop.crashes,
    bodies: lane.bodies,
    markerBodies: lane.markerBodies,
    ...lane.stats,
  };
}

async function fuzzOne(lane: Lane, seed: number): Promise<void> {
  const generated = withSeededRandom(seed, () => genType(lane.gen));
  const compiled = await compileWithTimeout(lane.holder, generated);
  if (!compiled || compiled.resolverError || compiled.evalError) {
    lane.stats.skipped++;
    return;
  }
  const before = lane.violations.length;
  let bodies: EmittedBody[];
  try {
    bodies = emittedBodies(compiled.entryModules);
  } catch (err) {
    lane.violations.push({
      oracle: 'GC-PARSE',
      key: targetTitle(generated),
      family: '*',
      message: `entry modules do not evaluate: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  lane.stats.checked++;
  for (const body of bodies) {
    lane.bodies++;
    if (body.code.includes(INJECT_MARKER)) lane.markerBodies++;
    const violations = checkGeneratedCode(body, [INJECT_MARKER]);
    for (const violation of violations) {
      lane.violations.push({...violation, key: `${targetTitle(generated)} · ${violation.key} (seed=0x${seed.toString(16)})`});
      const family = violation.oracle;
      lane.stats.applied[family] = (lane.stats.applied[family] ?? 0) + 1;
    }
  }
  applyTsGate(generated, lane.violations, before, lane.stats);
}
