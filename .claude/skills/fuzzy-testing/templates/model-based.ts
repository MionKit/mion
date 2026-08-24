/**
 * A sequence-of-actions skeleton for code that has MEMORY (use this when a valid input
 * is a list of operations, not one value). Adapt from
 * packages/ts-runtypes/test/fuzz/enrich/{enrichModel,enrichFuzzRunner}.ts.
 *
 * Each Command changes a small MODEL of the code's state, drives the real code, and
 * checks a rule (returning Violations). The input maker picks an applicable command
 * each step; the runner replays the whole sequence from one seed, and on a failure cuts
 * it down to the fewest leading actions that still fail. If fast-check is available,
 * `fc.commands([...]) + fc.modelRun` replaces the runner — the Command and rule design
 * carries over unchanged.
 */
import type {Violation, CheckCtx} from './oracle-layer.ts';
import {withSeededRandom, mixSeed, prefixShrink} from './seeded-runner.ts';

/** Just enough of the code's state to STATE the rules (not a re-implementation of it). */
export interface Model {
  // TODO: e.g. fields?: Map<string, string>; authored?: Map<string, string>;
  steps?: number;
}

/** A handle to the real code under test — the outside-world boundary you wrapped. */
export interface Sut {
  // TODO: e.g. run?: (args: string[]) => {ok: boolean; output: string};
  reset?: () => void;
}

export interface World {
  model: Model;
  sut: Sut;
}

export interface Command {
  readonly name: string;
  canApply(model: Model): boolean; // when this action is allowed — keeps generated sequences valid
  apply(world: World, ctx: CheckCtx, rng: () => number): Violation[]; // change model + drive the code + check
}

// --- the set of possible actions: fill in your commands -----------------------
export const COMMANDS: Command[] = [
  // {
  //   name: 'addField',
  //   canApply: (model) => true,
  //   apply(world, ctx, rng) {
  //     // 1. change world.model;  2. drive world.sut;  3. look at what came out;
  //     // 4. return [] if the rule holds, else [violation].
  //     return [];
  //   },
  // },
];

export interface SequenceResult {
  seed: number;
  log: string[];
  violations: Violation[];
}

/** Run ONE repeatable sequence of up to maxSteps actions on a fresh world. */
export function runOneSequence(makeWorld: () => World, seed: number, maxSteps: number): SequenceResult {
  const world = makeWorld(); // a fresh copy of the code + model for each sequence
  const log: string[] = [];
  const violations: Violation[] = [];
  withSeededRandom(seed, () => {
    for (let step = 0; step < maxSteps; step++) {
      const applicable = COMMANDS.filter((command) => command.canApply(world.model));
      if (!applicable.length) break;
      const command = applicable[Math.floor(Math.random() * applicable.length)];
      log.push(command.name);
      const found = command.apply(world, {seed, step}, Math.random);
      if (found.length) {
        violations.push(...found);
        break; // stop at the first failing step, so the log IS the path to the failure
      }
    }
  });
  return {seed, log, violations};
}

export interface ModelFuzzReport {
  firstFailSeed: number | null;
  minSteps: number;
  log: string[];
  violations: Violation[];
}

/** Run many sequences; on the first failure, cut it down to the fewest leading actions. */
export function runModelFuzz(makeWorld: () => World, baseSeed: number, sequences: number, maxSteps: number): ModelFuzzReport {
  for (let i = 0; i < sequences; i++) {
    const seed = mixSeed(baseSeed, 'seq', i);
    const result = runOneSequence(makeWorld, seed, maxSteps);
    if (result.violations.length) {
      const minSteps = prefixShrink((k) => runOneSequence(makeWorld, seed, k).violations.length > 0, maxSteps);
      const shrunk = runOneSequence(makeWorld, seed, minSteps);
      return {firstFailSeed: seed, minSteps, log: shrunk.log, violations: shrunk.violations};
    }
  }
  return {firstFailSeed: null, minSteps: 0, log: [], violations: []};
}
