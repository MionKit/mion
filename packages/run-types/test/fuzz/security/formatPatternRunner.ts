// The secformat lane driver: every shipped format leaf the type generator
// knows (compiled through the resolver to its real `validate`) and every
// registered pattern regex, pumped with strings shaped to make a scanner do
// super-linear work. Oracles: the call returns a boolean, never throws, and
// stays under the budget.

import {mixSeed, mulberry32} from '../core/seededRng.ts';
import {runFuzzLoop} from '../core/runLoop.ts';
import {FORMAT_LEAVES, FUZZ_FORMAT_PREAMBLE, type FormatLeafName} from '../core/typeGen.ts';
import * as patterns from '../../../src/formats/string/string-patterns.ts';
import {ClientHolder, newStats, type SecurityReport, type LaneStats} from './laneShared.ts';
import {compileValidateOnly} from './securityHarness.ts';
import {pumpStrings} from './stringPumps.ts';
import {checkFormatCall, type SecurityViolation} from './securityOracle.ts';

export interface FormatFuzzOptions {
  seed?: number;
  /** Rounds: each round draws a fresh pump set for every leaf and pattern. **/
  iterations?: number;
}

const DEFAULT_SEED = 0x5ecf0;
const DEFAULT_ITERATIONS = 3;

interface Target {
  label: string;
  samples: readonly string[];
  run: (input: string) => unknown;
}

/** Every registered pattern, as a bare regex test. **/
export function patternTargets(): Target[] {
  const out: Target[] = [];
  for (const [name, value] of Object.entries(patterns)) {
    const pattern = value as {source?: unknown; flags?: unknown; mockSamples?: readonly string[]};
    if (typeof pattern?.source !== 'string') continue;
    const regex = new RegExp(pattern.source, typeof pattern.flags === 'string' ? pattern.flags.replace(/[gy]/g, '') : '');
    out.push({label: `pattern:${name}`, samples: pattern.mockSamples ?? [], run: (input) => regex.test(input)});
  }
  return out;
}

/** Compile every string-family format leaf to its real validator. **/
export async function leafTargets(holder: ClientHolder): Promise<{targets: Target[]; errors: string[]}> {
  const targets: Target[] = [];
  const errors: string[] = [];
  for (const name of Object.keys(FORMAT_LEAVES) as FormatLeafName[]) {
    const leaf = FORMAT_LEAVES[name];
    if (leaf.family !== 'string') continue;
    const compiled = await compileValidateOnly(holder.get(), FUZZ_FORMAT_PREAMBLE, leaf.tsText);
    if (!compiled.validate) {
      errors.push(`${name}: ${compiled.error ?? 'no validate'}`);
      continue;
    }
    const validate = compiled.validate;
    targets.push({label: `format:${name}`, samples: leaf.valid as readonly string[], run: (input) => validate(input)});
  }
  return {targets, errors};
}

export async function runFormatFuzz(
  options: FormatFuzzOptions = {}
): Promise<SecurityReport & {compileErrors: string[]; targets: number}> {
  const holder = new ClientHolder();
  const violations: SecurityViolation[] = [];
  const stats: LaneStats = newStats();
  try {
    const {targets: leaves, errors} = await leafTargets(holder);
    const targets = [...leaves, ...patternTargets()];
    const loop = await runFuzzLoop<SecurityViolation>(
      {seed: options.seed, defaultSeed: DEFAULT_SEED, rounds: options.iterations ?? DEFAULT_ITERATIONS},
      async (round) => {
        for (const target of targets) {
          await round.run(target.label, round.round, async (stepSeed) => pumpOne(target, stepSeed, violations, stats));
        }
      }
    );
    return {
      runs: loop.runs,
      seed: loop.seed,
      violations,
      crashes: loop.crashes,
      ...stats,
      compileErrors: errors,
      targets: targets.length,
    };
  } finally {
    holder.close();
  }
}

export async function runFormatFuzzForDuration(
  durationMs: number,
  options: FormatFuzzOptions = {},
  onViolation?: (v: SecurityViolation) => void
): Promise<SecurityReport & {compileErrors: string[]; targets: number}> {
  const holder = new ClientHolder();
  const violations: SecurityViolation[] = [];
  const stats: LaneStats = newStats();
  try {
    const {targets: leaves, errors} = await leafTargets(holder);
    const targets = [...leaves, ...patternTargets()];
    const loop = await runFuzzLoop<SecurityViolation>(
      {seed: options.seed, defaultSeed: DEFAULT_SEED, durationMs, violations, onViolation},
      async (round) => {
        for (const target of targets) {
          await round.run(target.label, round.round, async (stepSeed) => pumpOne(target, stepSeed, violations, stats));
        }
      }
    );
    return {
      runs: loop.runs,
      seed: loop.seed,
      violations,
      crashes: loop.crashes,
      ...stats,
      compileErrors: errors,
      targets: targets.length,
      slowestIterationMs: loop.slowestIterationMs,
      slowestIterationRound: loop.slowestIterationRound,
    };
  } finally {
    holder.close();
  }
}

function pumpOne(target: Target, seed: number, out: SecurityViolation[], stats: LaneStats): void {
  const rng = mulberry32(mixSeed(seed, target.label, 0));
  const ctx = {target: target.label, seed};
  const timeOracle = target.label.startsWith('pattern:') ? 'SF-PATTERN-TIME' : 'SF-TIME';
  stats.checked++;
  for (const pump of pumpStrings(rng, target.samples)) {
    const result = checkFormatCall(target.label, target.run, pump.input, pump.id, ctx, timeOracle);
    out.push(...result.violations);
    const family = pump.id.replace(/\.\d+$/, '');
    stats.applied[family] = (stats.applied[family] ?? 0) + 1;
  }
}
