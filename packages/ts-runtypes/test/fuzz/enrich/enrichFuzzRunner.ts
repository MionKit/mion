// Seeded driver + shrinker for the enrichment-sync fuzzer. Frame-free (no test
// runner): pure (seed → report), so it runs under Vitest AND as a standalone
// soak. Mirrors the style of test/fuzz/fuzzRunner.ts.
//
// One SEQUENCE = a fresh temp workspace + a deterministic random series of edit
// events. We stop a sequence at its first violating step (so the command log IS
// the path to the failure), then prefix-SHRINK: the smallest command count that
// still fails is the minimal reproducer.

import {makeFixture} from '../../util/enrichReconcile.ts';
import {withSeededRandom, mixSeed} from '../core/seededRng.ts';
import {COMMANDS, bootstrap, type EnrichViolation} from './enrichModel.ts';

export interface SequenceResult {
  seed: number;
  log: string[];
  violations: EnrichViolation[];
}

/** Run ONE sequence of up to `maxCommands` events on a fresh workspace. **/
export function runOneSequence(seed: number, maxCommands: number): SequenceResult {
  const fixture = makeFixture(`fz-${seed >>> 0}`, '');
  const {model, violations} = bootstrap(fixture, seed);
  const log: string[] = [];
  if (violations.length === 0) {
    withSeededRandom(seed, () => {
      for (let step = 0; step < maxCommands; step++) {
        const applicable = COMMANDS.filter((c) => c.canApply(model));
        if (applicable.length === 0) break;
        const command = applicable[Math.floor(Math.random() * applicable.length)];
        log.push(command.name);
        const stepViolations = command.apply(model, {fixture, seed, step}, Math.random);
        violations.push(...stepViolations);
        if (stepViolations.length > 0) break; // stop at the first failing step
      }
    });
  }
  return {seed, log, violations};
}

export interface FuzzReport {
  runs: number;
  sequences: number;
  maxCommands: number;
  seed: number;
  violations: EnrichViolation[];
  firstFailureSeed: number | null;
}

export interface FuzzOptions {
  seed: number;
  sequences: number;
  maxCommands: number;
  /** Called for the first violation of each failing sequence (for soak logs). **/
  onViolation?: (violation: EnrichViolation, seqSeed: number) => void;
  /** Keep going past the first failing sequence (soak mode). Default: stop. **/
  continueOnFailure?: boolean;
}

/** Run many sequences. Stops at the first failing one unless `continueOnFailure`. **/
export function runEnrichFuzz(options: FuzzOptions): FuzzReport {
  const {seed, sequences, maxCommands} = options;
  const violations: EnrichViolation[] = [];
  let firstFailureSeed: number | null = null;
  let runs = 0;
  for (let i = 0; i < sequences; i++) {
    const seqSeed = mixSeed(seed, 'enrich-sync', i);
    runs++;
    const result = runOneSequence(seqSeed, maxCommands);
    if (result.violations.length > 0) {
      if (firstFailureSeed === null) firstFailureSeed = seqSeed;
      violations.push(...result.violations);
      if (options.onViolation) options.onViolation(result.violations[0], seqSeed);
      if (!options.continueOnFailure) break;
    }
  }
  return {runs, sequences, maxCommands, seed, violations, firstFailureSeed};
}

export interface Shrunk {
  seed: number;
  commands: number;
  log: string[];
  violations: EnrichViolation[];
}

/** Prefix-shrink a failing sequence: the smallest command count that still
 *  fails. Deterministic — the same seed replays the same command choices, so a
 *  prefix of length k is exactly the first k events. **/
export function shrinkFailure(seed: number, maxCommands: number): Shrunk {
  for (let k = 1; k <= maxCommands; k++) {
    const result = runOneSequence(seed, k);
    if (result.violations.length > 0) return {seed, commands: k, log: result.log, violations: result.violations};
  }
  // Shouldn't happen (the seed failed at maxCommands), but be defensive.
  const full = runOneSequence(seed, maxCommands);
  return {seed, commands: maxCommands, log: full.log, violations: full.violations};
}

/** Human-readable failure report for `expect.fail`. **/
export function formatReport(report: FuzzReport, shrunk: Shrunk): string {
  const lines: string[] = [];
  lines.push(`enrichment fuzz FAILED after ${report.runs} sequence(s) (base seed 0x${report.seed.toString(16)}).`);
  lines.push('');
  lines.push(`Minimal reproducer — seed 0x${shrunk.seed.toString(16)}, ${shrunk.commands} event(s):`);
  lines.push(`  ${shrunk.log.join('  →  ')}`);
  lines.push('');
  lines.push('Violations:');
  for (const violation of shrunk.violations) {
    lines.push(`  [${violation.rule}] ${violation.command} (step ${violation.step}): ${violation.message}`);
  }
  lines.push('');
  lines.push(`Replay: RT_FUZZ_ENRICH_REPLAY=0x${shrunk.seed.toString(16)} (see the test).`);
  return lines.join('\n');
}
