// Seeded driver + shrinker for the FriendlyText i18n-sync fuzzer. Frame-free
// (no test runner): pure (seed → report), so it runs under Vitest AND as a
// standalone soak. Mirrors enrichFuzzRunner.ts — one SEQUENCE is a fresh temp
// workspace + a deterministic random series of translator/source events; a
// failing sequence prefix-shrinks to the minimal reproducer.

import {makeFixture} from '../../util/enrichReconcile.ts';
import {withSeededRandom, mixSeed} from '../core/seededRng.ts';
import {I18N_COMMANDS, bootstrapI18n, type I18nViolation, type I18nCtx} from './i18nModel.ts';

export interface I18nSequenceResult {
  seed: number;
  log: string[];
  violations: I18nViolation[];
}

/** Run ONE sequence of up to `maxCommands` events on a fresh workspace. **/
export function runOneI18nSequence(seed: number, maxCommands: number): I18nSequenceResult {
  const fixture = makeFixture(`fz-i18n-${seed >>> 0}`, '');
  const {model, violations} = bootstrapI18n(fixture, seed);
  const log: string[] = [];
  if (violations.length === 0) {
    withSeededRandom(seed, () => {
      for (let step = 0; step < maxCommands; step++) {
        const ctx: I18nCtx = {fixture, seed, step};
        const applicable = I18N_COMMANDS.filter((command) => command.canApply(model, ctx));
        if (applicable.length === 0) break;
        const command = applicable[Math.floor(Math.random() * applicable.length)];
        log.push(command.name);
        const stepViolations = command.apply(model, ctx, Math.random);
        violations.push(...stepViolations);
        if (stepViolations.length > 0) break; // stop at the first failing step
      }
    });
  }
  return {seed, log, violations};
}

export interface I18nFuzzReport {
  runs: number;
  sequences: number;
  maxCommands: number;
  seed: number;
  violations: I18nViolation[];
  firstFailureSeed: number | null;
}

export interface I18nFuzzOptions {
  seed: number;
  sequences: number;
  maxCommands: number;
  continueOnFailure?: boolean;
}

/** Run many sequences. Stops at the first failing one unless `continueOnFailure`. **/
export function runI18nFuzz(options: I18nFuzzOptions): I18nFuzzReport {
  const {seed, sequences, maxCommands} = options;
  const violations: I18nViolation[] = [];
  let firstFailureSeed: number | null = null;
  let runs = 0;
  for (let i = 0; i < sequences; i++) {
    const seqSeed = mixSeed(seed, 'i18n-sync', i);
    runs++;
    const result = runOneI18nSequence(seqSeed, maxCommands);
    if (result.violations.length > 0) {
      if (firstFailureSeed === null) firstFailureSeed = seqSeed;
      violations.push(...result.violations);
      if (!options.continueOnFailure) break;
    }
  }
  return {runs, sequences, maxCommands, seed, violations, firstFailureSeed};
}

export interface I18nShrunk {
  seed: number;
  commands: number;
  log: string[];
  violations: I18nViolation[];
}

/** Prefix-shrink a failing sequence to the smallest command count that fails. **/
export function shrinkI18nFailure(seed: number, maxCommands: number): I18nShrunk {
  for (let k = 1; k <= maxCommands; k++) {
    const result = runOneI18nSequence(seed, k);
    if (result.violations.length > 0) return {seed, commands: k, log: result.log, violations: result.violations};
  }
  const full = runOneI18nSequence(seed, maxCommands);
  return {seed, commands: maxCommands, log: full.log, violations: full.violations};
}

/** Human-readable failure report for `expect.fail`. **/
export function formatI18nReport(report: I18nFuzzReport, shrunk: I18nShrunk): string {
  const lines: string[] = [];
  lines.push(`i18n-sync fuzz FAILED after ${report.runs} sequence(s) (base seed 0x${report.seed.toString(16)}).`);
  lines.push('');
  lines.push(`Minimal reproducer — seed 0x${shrunk.seed.toString(16)}, ${shrunk.commands} event(s):`);
  lines.push(`  ${shrunk.log.join('  →  ')}`);
  lines.push('');
  lines.push('Violations:');
  for (const item of shrunk.violations) {
    lines.push(`  [${item.rule}] ${item.command} (step ${item.step}): ${item.message}`);
  }
  lines.push('');
  lines.push(`Replay: RT_FUZZ_I18N_REPLAY=0x${shrunk.seed.toString(16)} (see the test).`);
  return lines.join('\n');
}
