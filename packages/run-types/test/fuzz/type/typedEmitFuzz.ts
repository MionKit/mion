// The emitMode 'ts' lane: every generated type compiles twice, once as emitMode 'both' and once as typed `.ts`
// modules, and three rules hold on every one:
//
//   TE1 strip parity: each typed module minus its types IS its emitMode 'both' twin (code string included), and a
//      type module strips to nothing, so the typed output is the shipped logic with types added.
//   TE2 same verdict: the typed root validator, built from its own typed factory, answers exactly as the 'both'
//      validator on generated valid values and their one-spot corruptions (compare to a trusted source).
//   TE3 strict types: all typed modules of a run type-check with zero errors under the strictest consumer tsconfig,
//      one tsc program per run.
//
// TE1 and TE2 run per type; TE3 runs once at the end over every type the run wrote.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {runFuzzLoop} from '../core/runLoop.ts';
import {type CrashRecord} from '../core/crashGuard.ts';
import {genType, isRecursive, DEFAULT_GEN_OPTIONS, type GenOptions} from '../core/typeGen.ts';
import {genValidValue, corruptValue, valueOracleSafe} from '../value/shapeValue.ts';
import {getRTUtils} from '../../../src/runtypes/rtUtils.ts';
import {compileType, generateModules, openClient, renderFixture} from './typeFuzzHarness.ts';
import {evalEntryModules} from '../../../../devtools/test/helpers/inline.ts';
import {
  stripParityViolation,
  stripTypeScript,
  strictestTypeCheck,
  typeModuleViolation,
} from '../../../../devtools/test/helpers/typedEmit.ts';
import type {ResolverClient} from '../../../../devtools/src/core/resolver-client.ts';

export interface TypedEmitViolation {
  oracle: 'TE1' | 'TE2' | 'TE3';
  seed: number;
  target: string;
  message: string;
}

export interface TypedEmitReport {
  seed: number;
  runs: number;
  violations: TypedEmitViolation[];
  crashes: CrashRecord[];
  /** Typed modules TE1 compared, the lane's anti-vacuity count. **/
  typedModules: number;
  /** Types whose validator TE2 compared on real values. **/
  verdictRuns: number;
}

export interface TypedEmitOptions {
  seed?: number;
  iterations?: number;
  durationMs?: number;
  gen?: GenOptions;
}

const PACKAGE_ROOT = path.resolve(__dirname, '../../..');
const VALUES_PER_TYPE = 5;
// The createRTFn slot of a type-fn tuple (FN_TYPE_TUPLE_KEYS in src/runtypes/entryTuple.ts).
const CREATE_RT_FN_SLOT = 9;

/** TE2's rule: the typed validator answers every value exactly as the trusted one; null when it does. **/
export function verdictViolation(
  typed: (value: unknown) => boolean,
  trusted: (value: unknown) => boolean,
  values: unknown[]
): string | null {
  for (const value of values) {
    const want = trusted(value);
    const got = typed(value);
    if (got !== want) return `typed validator says ${got}, emitMode both says ${want}, for ${describe(value)}`;
  }
  return null;
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? `${item}n` : item))?.slice(0, 200) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Rewrites a served module's virtual specifiers to the on-disk `.ts` layout under one run dir. **/
function onDisk(name: string, source: string): string {
  return source.replace(/from 'rtmod:\/([^']+)\.js'/g, (_match, target: string) => {
    let relative = path.posix.relative(path.posix.dirname(name), target);
    if (!relative.startsWith('.')) relative = `./${relative}`;
    return `from '${relative}.ts'`;
  });
}

export async function runTypedEmitFuzz(options: TypedEmitOptions = {}): Promise<TypedEmitReport> {
  const gen: GenOptions = {...DEFAULT_GEN_OPTIONS, ...options.gen};
  const violations: TypedEmitViolation[] = [];
  const counts = {typedModules: 0, verdictRuns: 0};
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-typed-emit-'));
  const scope = path.join(runDir, 'node_modules', '@mionjs');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(PACKAGE_ROOT, path.join(scope, 'run-types'), 'dir');
  const both = openClient('both');
  const typed = openClient('ts');
  try {
    const loop = await runFuzzLoop<TypedEmitViolation>(
      {
        seed: options.seed,
        defaultSeed: 0x75ed,
        ...(options.durationMs === undefined ? {rounds: options.iterations ?? 30} : {durationMs: options.durationMs}),
        violations,
      },
      (round) => round.run('typed', round.round, (seed) => fuzzOneType(both, typed, seed, gen, runDir, violations, counts))
    );
    // TE3: one strict type check over every module the run wrote.
    const output = strictestTypeCheck(runDir, ['seed-*/**/*.ts']);
    for (const line of output.split('\n').filter((entry) => /error TS\d+/.test(entry))) {
      const seed = Number(/seed-(\d+)/.exec(line)?.[1] ?? 0);
      violations.push({oracle: 'TE3', seed, target: line.split('(')[0] ?? line, message: line});
    }
    return {seed: loop.seed, runs: loop.runs, violations, crashes: loop.crashes, ...counts};
  } finally {
    both.close();
    typed.close();
    fs.rmSync(runDir, {recursive: true, force: true});
  }
}

async function fuzzOneType(
  bothClient: ResolverClient,
  typedClient: ResolverClient,
  seed: number,
  gen: GenOptions,
  runDir: string,
  out: TypedEmitViolation[],
  counts: {typedModules: number; verdictRuns: number}
): Promise<void> {
  const generated = withSeededRandom(seed, () => genType(gen));
  const compiled = await compileType(bothClient, generated);
  if (compiled.resolverError || compiled.evalError) return;
  const typedModules = await generateModules(typedClient, renderFixture(generated));
  const seedDir = path.join(runDir, `seed-${seed}`);
  for (const [name, typedModule] of Object.entries(typedModules)) {
    const file = path.join(seedDir, `${name}.ts`);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, onDisk(name, typedModule));
    counts.typedModules++;
    if (name.startsWith('t/')) {
      const violation = typeModuleViolation(name, typedModule);
      if (violation) out.push({oracle: 'TE1', seed, target: name, message: violation});
      continue;
    }
    const twin = compiled.entryModules[name];
    const violation = twin === undefined ? `${name}: no emitMode both twin` : stripParityViolation(name, typedModule, twin);
    if (violation) out.push({oracle: 'TE1', seed, target: name, message: violation});
  }
  const trusted = compiled.wired.validate;
  const key = compiled.fnCacheKeys.validate;
  if (!trusted || !key || !typedModules[key] || !valueOracleSafe(generated) || isRecursive(generated)) return;
  // The typed root factory, materialised against the registry the 'both' compile linked its dependencies into.
  // Stripping leaves blanks where the `: any` export annotation was; the evaluator reads `export const X=`.
  const runnable = stripTypeScript(typedModules[key]).replace(/^(export const __rt_[\w$]+)\s+=/gm, '$1=');
  const tuple = evalEntryModules({[key]: runnable})[key];
  const factory = tuple?.[CREATE_RT_FN_SLOT];
  if (typeof factory !== 'function') return;
  const typedValidate = factory(getRTUtils()) as (value: unknown) => boolean;
  const values = withSeededRandom(mixSeed(seed, 'value', 0), () => {
    const drawn: unknown[] = [];
    for (let i = 0; i < VALUES_PER_TYPE; i++) {
      const valid = genValidValue(generated).value;
      drawn.push(valid);
      const corrupted = corruptValue(generated, valid);
      if (corrupted) drawn.push(corrupted.value);
    }
    return drawn;
  });
  counts.verdictRuns++;
  const violation = verdictViolation(typedValidate, trusted, values);
  if (violation) out.push({oracle: 'TE2', seed, target: key, message: violation});
}
