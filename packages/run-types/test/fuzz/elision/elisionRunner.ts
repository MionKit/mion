// Driver for the elision form-equivalence lane, over the FULL generated type
// space: ONE generator (core/typeGen.ts) with a FORM axis, where the builders
// form is derived by the REAL `mion convert --to builders` CLI rather
// than a hand-written builder printer — the product converter owns the
// type→builder spelling knowledge (internal/convert/printbuilder.go), so
// there is no JS twin to keep in sync and every fixture's builder spelling is
// byte-for-byte what a user's conversion would produce.
//
// Per iteration (all randomness under one mixSeed, so a violation replays):
//
//   genType (the convert lane's generation space, designed refusals
//   pre-filtered via its own isConvertibleGen)
//     → render the TYPE-form fixture: decls + `type FzRoot = …` + the three
//       static calls `createXFn<FzRoot>()`
//     → `convert --to builders` gives the STATIC spelling for free: the root
//       becomes `const fzRootRT = …;` + `type FzRoot = InferType<typeof
//       fzRootRT>;` and the calls (they name their type) stay static — a
//       builder const referenced only through `typeof`
//     → the VALUE spelling is a tail swap of our own three calls:
//       `createXFn<FzRoot>()` → `createXFn(fzRootRT)`
//     → compile both through the daemon and check the oracles
//       (elisionOracle.ts): E0 fixture integrity, E1 same fn keys +
//       byte-identical function entries, E2 root graph elided (static) vs
//       kept (value), E3 validator behavior floor on the static form.
//
// E3 runs on the diagnostics-clean, value-generable subset (shapeValue's
// valueOracleSafe — the type lane's tiering); codec BEHAVIOR needs no probing
// here because E1's byte equality already carries it, so E3 keeps to the
// validator probes plus an encoder no-throw smoke.

import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {type CrashRecord} from '../core/crashGuard.ts';
import {runFuzzLoop} from '../core/runLoop.ts';
import {
  genType,
  renderGenerated,
  describeType,
  childShapes,
  FUZZ_FORMAT_PREAMBLE_PACKAGE,
  type GeneratedType,
  type TypeShape,
} from '../core/typeGen.ts';
import {genValidValue, corruptValue, valueOracleSafe} from '../value/shapeValue.ts';
import {
  CONVERT_GEN_OPTIONS,
  isConvertibleGen,
  declShapes,
  createConvertProject,
  destroyConvertProject,
  convertLeg,
  type ConvertProject,
} from '../convert/convertRoundtrip.ts';
import {openClient, hasBinary, BIN} from '../type/typeFuzzHarness.ts';
import {
  MARKER_PACKAGE_OVERLAY,
  evalEntryModules,
  instantiateRunTypes,
} from '../../../../ts-runtypes-devtools/test/helpers/inline.ts';
import {Severity} from '../../../../ts-runtypes-devtools/src/protocol.ts';
import type {ResolverClient} from '../../../../ts-runtypes-devtools/src/resolver-client.ts';
import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';
import {
  checkFnSiteAgreement,
  checkSharedEntriesIdentical,
  checkStaticRootSiteGone,
  checkStaticZeroReflection,
  checkValueRootKept,
  comparableModules,
  type ElisionViolation,
  type SiteShape,
} from './elisionOracle.ts';

export {hasBinary, BIN};

const FIXTURE = 'g.ts';
const CALLS = ['createValidateFn', 'createJsonEncoderFn', 'createJsonDecoderFn'] as const;

/** The ONE fixture renderer, type form — the converter derives the builder
 *  spellings from this output (see deriveBuilderSpellings). **/
export function renderTypeFixture(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen, FUZZ_FORMAT_PREAMBLE_PACKAGE);
  return (
    `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';\n` +
    `${decls}${decls ? '\n' : ''}type FzRoot = ${rootExpr};\n` +
    CALLS.map((fn, i) => `export const fz${i} = ${fn}<FzRoot>();\n`).join('')
  );
}

export interface BuilderSpellings {
  staticSource: string;
  valueSource: string;
  /** The converter printed the ROOT const as the `getRunType<T>()` escape
   *  rather than a builder expression — an id-lookup site that is never
   *  elidable by design, riding both spellings unchanged. **/
  rootPrintsAsEscape: boolean;
  /** Any `getRunType<` escape anywhere in the converted output (root or a
   *  declaration reference) — gates the strict zero-reflection assertion.
   *  The import name is stable in these fixtures (no identifier collides
   *  with `getRunType`, so the converter never renames it). **/
  sourceHasEscape: boolean;
}

// The converted root alias line — `type FzRoot = InferType<typeof <const>>;`
// (the InferType binding may be renamed on collision, so both identifiers are
// wildcards; the const capture is what the value spelling substitutes).
const ROOT_ALIAS = /(?:^|\n)(?:export )?type FzRoot = [A-Za-z_$][\w$]*<typeof ([A-Za-z_$][\w$]*)>;/;

/** Derive both builder spellings from a type-form fixture via the real
 *  converter. Returns null — the caller re-rolls, counting it — when the
 *  converter refuses the shape (a designed CNVxxx diagnostic: the coarse
 *  isConvertibleGen pre-filter cannot model every print-path refusal, and
 *  pinning the refusal surface is the CONVERT lane's job, not this one's) or
 *  when the converted output has no parseable root alias (e.g. the root
 *  printed as a pure reference of a declaration). A non-refusal converter
 *  failure (a crash, no CNV diagnostic) still throws — that is a finding. **/
export function deriveBuilderSpellings(project: ConvertProject, typeSource: string): BuilderSpellings | null {
  let staticSource: string;
  try {
    staticSource = convertLeg(project, typeSource, 'builders');
  } catch (err) {
    if (err instanceof Error && /\bCNV\d{3}\b/.test(err.message)) return null;
    throw err;
  }
  const aliasMatch = ROOT_ALIAS.exec(staticSource);
  if (!aliasMatch) return null;
  const constName = aliasMatch[1];
  let valueSource = staticSource;
  for (const fn of CALLS) {
    const before = valueSource;
    valueSource = valueSource.replace(`${fn}<FzRoot>()`, `${fn}(${constName})`);
    if (valueSource === before) return null;
  }
  return {
    staticSource,
    valueSource,
    rootPrintsAsEscape: staticSource.includes(`const ${constName} = getRunType<`),
    sourceHasEscape: staticSource.includes('getRunType<'),
  };
}

interface CompiledFixture {
  modules: Record<string, string>;
  sites: SiteShape[];
  /** fn-site cache keys in source order (validate, encoder, decoder). **/
  fnKeys: string[];
  errorDiagnostics: string[];
}

async function compileFixture(client: ResolverClient, source: string): Promise<CompiledFixture> {
  await client.setSources({...MARKER_PACKAGE_OVERLAY, [FIXTURE]: source});
  const resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
  const diagnostics = resp.diagnostics ?? [];
  const sites = (resp.sites ?? []).sort((a, b) => a.pos - b.pos);
  return {
    modules: resp.entryModules ?? {},
    sites: sites.map((site) => ({fnId: site.fnId ?? '', id: site.id})),
    fnKeys: sites.filter((site) => site.fnId).map((site) => `${site.fnId}_${site.id}`),
    errorDiagnostics: diagnostics
      .filter((d) => d.severity === Severity.Error)
      .map((d) => `${d.code}(${d.args?.join(', ') ?? ''})`),
  };
}

export interface ElisionFuzzOptions {
  seed?: number;
  iterations?: number;
}

export interface ElisionFuzzReport {
  runs: number;
  seed: number;
  /** Iterations that reached the E3 validator probes (the anti-vacuity floor). **/
  strongRuns: number;
  /** Generated shapes discarded before compiling: designed convert refusals
   *  (symbol-keyed members) and unparseable root spellings (a pure-reference
   *  root). Reported so a generator regression cannot silently hollow the lane. **/
  rerolls: number;
  violations: ElisionViolation[];
  /** Hard failures captured by the crash guard (core/crashGuard.ts) — a
   *  resolver error, a converter crash — each with its replay seed. **/
  crashes: CrashRecord[];
  /** Duration runs only: the slowest single iteration and its zero-based round,
   *  for the soak pathology tripwire (SOAK_ITERATION_CEILING_MS). **/
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

interface IterationState {
  violations: ElisionViolation[];
  strongRuns: number;
  rerolls: number;
}

// Re-rolls allowed while producing ONE iteration's fixture before the lane
// declares generator starvation (the refusal space is a sliver, so hitting
// this means the generator or filter regressed).
const MAX_REROLLS_PER_ITERATION = 25;

async function fuzzOne(client: ResolverClient, project: ConvertProject, seed: number, state: IterationState): Promise<void> {
  let gen!: GeneratedType;
  let spellings: BuilderSpellings | null = null;
  for (let attempt = 0; attempt < MAX_REROLLS_PER_ITERATION && !spellings; attempt++) {
    gen = withSeededRandom(mixSeed(seed, 'shape', attempt), () => genType(CONVERT_GEN_OPTIONS));
    if (!isConvertibleGen(gen)) {
      state.rerolls++;
      continue;
    }
    spellings = deriveBuilderSpellings(project, renderTypeFixture(gen));
    if (!spellings) state.rerolls++;
  }
  const title = describeType(gen);
  if (!spellings) {
    state.violations.push({
      oracle: 'E0-fixture',
      seed,
      title,
      message: `no convertible fixture within ${MAX_REROLLS_PER_ITERATION} re-rolls — generator starvation`,
    });
    return;
  }

  // A resolver ERROR here (a scanFiles-level failure, not a diagnostic) is
  // caught by the crash guard the shared run loop (core/runLoop.ts) wraps every
  // step in — recorded with this iteration's seed, the soak keeps hunting.
  const staticSide = await compileFixture(client, spellings.staticSource);
  const valueSide = await compileFixture(client, spellings.valueSource);

  // E0 — each spelling resolves exactly its three createX sites.
  for (const [form, side] of [
    ['static', staticSide],
    ['value', valueSide],
  ] as const) {
    if (side.fnKeys.length !== CALLS.length) {
      state.violations.push({
        oracle: 'E0-fixture',
        seed,
        title,
        message: `${form} form resolved ${side.fnKeys.length} fn sites (want ${CALLS.length})`,
      });
      return;
    }
  }
  const rootId = valueSide.fnKeys[0].split('_', 2)[1];

  const push = (violation: ElisionViolation | undefined): void => {
    if (violation) state.violations.push(violation);
  };
  push(checkFnSiteAgreement(seed, title, staticSide.fnKeys, valueSide.fnKeys));
  push(checkSharedEntriesIdentical(seed, title, comparableModules(staticSide.modules), comparableModules(valueSide.modules)));
  push(checkStaticRootSiteGone(seed, title, staticSide.sites, rootId, spellings.rootPrintsAsEscape));
  // Strict zero-reflection needs a fixture with nothing legitimately
  // reflective: no declaration escapes AND no escape-printed fragments.
  if (gen.decls.length === 0 && !spellings.sourceHasEscape) {
    push(checkStaticZeroReflection(seed, title, staticSide.modules, staticSide.sites));
  }
  let valueRootRow = false;
  try {
    valueRootRow = instantiateRunTypes(evalEntryModules(valueSide.modules))[rootId] !== undefined;
  } catch (err) {
    push({oracle: 'E0-fixture', seed, title, message: `value form modules failed to evaluate: ${errMsg(err)}`});
    return;
  }
  push(checkValueRootKept(seed, title, staticSide.sites, valueSide.sites, rootId, spellings.rootPrintsAsEscape, valueRootRow));

  // E3 — behavior floor on the STATIC form (the elided spelling is the
  // feature's risk surface), on the diagnostics-clean value-generable tier.
  // Structural-format shapes (contains / uniqueItems / min-max entries) are
  // excluded: shapeValue does not model those constraints (its home lanes
  // never generate them), so its "conforming" values can be honestly invalid
  // — they still get full E0-E2 coverage.
  if (staticSide.errorDiagnostics.length > 0 || !valueOracleSafe(gen) || genHasStructuralFormat(gen)) return;
  let tuples: Record<string, readonly unknown[]>;
  try {
    tuples = evalEntryModules(staticSide.modules);
  } catch (err) {
    push({oracle: 'E3-behavior', seed, title, message: `static form modules failed to evaluate: ${errMsg(err)}`});
    return;
  }
  try {
    const {value: valid, floored} = withSeededRandom(mixSeed(seed, 'value', 0), () => genValidValue(gen));
    // A floored (budget-truncated) value may not fully conform — the type
    // lane skips its accept assertion the same way.
    if (floored) return;
    const corrupt = withSeededRandom(mixSeed(seed, 'corrupt', 0), () => corruptValue(gen, valid));
    const isT = createValidateFn(undefined, undefined, tuples[staticSide.fnKeys[0]] as never);
    const encT = createJsonEncoderFn(undefined, undefined, tuples[staticSide.fnKeys[1]] as never);
    if (isT(valid) !== true) {
      push({oracle: 'E3-behavior', seed, title, message: `validate rejected a conforming value: ${safeRender(valid)}`});
    }
    if (corrupt && corrupt.proven && isT(corrupt.value) !== false) {
      push({oracle: 'E3-behavior', seed, title, message: `validate accepted a corrupted value: ${safeRender(corrupt.value)}`});
    }
    // Codec BEHAVIOR is covered by E1's byte equality; this is a no-throw smoke.
    encT(valid);
    state.strongRuns++;
  } catch (err) {
    push({oracle: 'E3-behavior', seed, title, message: `wiring/probing threw: ${errMsg(err)}`});
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Structural formats ride `shape.structural` on array / record nodes.
function shapeHasStructuralFormat(shape: TypeShape): boolean {
  if ((shape.kind === 'array' || shape.kind === 'record') && shape.structural !== undefined) return true;
  return childShapes(shape).some(shapeHasStructuralFormat);
}

function genHasStructuralFormat(gen: GeneratedType): boolean {
  if (shapeHasStructuralFormat(gen.root)) return true;
  return gen.decls.some((decl) => declShapes(decl).some(shapeHasStructuralFormat));
}

// Wide-space values may carry bigint / Map / Set, which JSON.stringify cannot
// render — failure messages degrade to String() rather than throwing.
function safeRender(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// The lane's resources (the resolver client and the convert project) open in the
// shared loop's `setup`, so their cost is charged to the soak budget exactly as
// it was when the loop was hand-written here.
async function runLoop(control: {seed?: number; iterations?: number; durationMs?: number}): Promise<ElisionFuzzReport> {
  const state: IterationState = {violations: [], strongRuns: 0, rerolls: 0};
  let client: ResolverClient | undefined;
  let project: ConvertProject | undefined;
  try {
    const loop = await runFuzzLoop<ElisionViolation>(
      {
        seed: control.seed,
        rounds: control.iterations,
        durationMs: control.durationMs,
        setup: () => {
          client = openClient();
          project = createConvertProject();
        },
      },
      (round) => round.run('elision', round.round, (iterSeed) => fuzzOne(client!, project!, iterSeed, state))
    );
    return {
      runs: loop.runs,
      seed: loop.seed,
      strongRuns: state.strongRuns,
      rerolls: state.rerolls,
      violations: state.violations,
      crashes: loop.crashes,
      slowestIterationMs: loop.slowestIterationMs,
      slowestIterationRound: loop.slowestIterationRound,
    };
  } finally {
    client?.close();
    if (project) destroyConvertProject(project);
  }
}

export async function runElisionFuzz(options: ElisionFuzzOptions = {}): Promise<ElisionFuzzReport> {
  return runLoop({seed: options.seed, iterations: options.iterations ?? 10});
}

export async function runElisionFuzzForDuration(
  durationMs: number,
  options: ElisionFuzzOptions = {}
): Promise<ElisionFuzzReport> {
  return runLoop({seed: options.seed, durationMs});
}
