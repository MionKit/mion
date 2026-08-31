// The FE convert roundtrip lane — the JS-side, real-CLI counterpart of the
// Go atom sweep (ts-go-runtypes/internal/convert/fuzz_atoms_test.go), run over
// the FULL generated type space (core/typeGen.ts) instead of the Go sweep's
// compact atom grammar:
//
//   generate a declarations file (named decls + a root alias + one
//   getRunTypeId probe per declaration, in BOTH call shapes for the root)
//     → spawn the REAL `mion convert` binary over a REAL temp project
//       (the shipped dist package on disk, the same posture a consumer has)
//     → walk a chain of intermediate builders legs — always starting and
//       ending at the type form (the generator only speaks types)
//     → after EVERY leg, re-resolve the probes and assert every declaration
//       kept its structural id (the C2 oracle, per leg)
//     → run a SECOND independently-randomized chain from the first chain's
//       type-form output and assert the two final sources are BYTE-EQUAL —
//       the type form is the converter's canonical fixpoint, so any two
//       paths through the form graph must land on identical text —
//     → and run one MORE type leg over that fixpoint, asserting a byte
//       no-op (C5 at the CLI level: normalization lands on the first pass).
//
// Ids are resolved through the resolver's serve ops (ResolverClient
// setSources + scanFiles — millisecond scans against the same dist package
// overlay), while conversions go through the CLI verb exactly as a user runs
// it. Any convert diagnostic, non-zero exit, id drift, or byte divergence
// fails the iteration with the seed, the shape, and the offending leg.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  genType,
  renderGenerated,
  describeType,
  childShapes,
  FUZZ_FORMAT_PREAMBLE_PACKAGE,
  WILD_GEN_OPTIONS,
  type Decl,
  type GenOptions,
  type GeneratedType,
  type TypeShape,
} from '../core/typeGen.ts';
import {withSeededRandom, mixSeed} from '../core/seededRng.ts';
import {openClient, hasBinary, BIN} from '../type/typeFuzzHarness.ts';
import {MARKER_PACKAGE_OVERLAY, writeMarkerPackage} from '../../../../ts-runtypes-devtools/test/helpers/inline.ts';
import type {ResolverClient} from '../../../../ts-runtypes-devtools/src/resolver-client.ts';

export {hasBinary};

/** The convert lane's generation space: the wild space plus the structural
 *  format surface and labeled tuples — everything the converter ships.
 *  Shapes the converter REFUSES BY DESIGN are filtered out per iteration
 *  (see isConvertibleShape), not silently under-generated. **/
export const CONVERT_GEN_OPTIONS: GenOptions = {
  ...WILD_GEN_OPTIONS,
  structuralFormats: true,
};

/** Shapes with a designed convert refusal — an iteration containing one
 *  REROLLS rather than pinning the refusal as green.
 *
 *  This filter is deliberately as SMALL as it can be, and shrinking it is how
 *  coverage grows: every entry is a shape the generator happily produces and
 *  the lane then refuses to look at, so anything listed here is invisible to
 *  the oracle. Six entries were removed once they started converting —
 *  non-string index keys, several index signatures, named members beside an
 *  index (all now `record` / `intersection` spellings), the binary natives
 *  (`RT.classType`), and typed arrays / DataView (whose id used to move with
 *  the spelling). Symbol-keyed members are the only shape left, and they
 *  refuse because the escape cannot write a symbol's source name down. **/
function isConvertibleShape(shape: TypeShape): boolean {
  switch (shape.kind) {
    case 'object':
      if (shape.indexKey?.includes('symbol')) return false;
      break;
    default:
      break;
  }
  return childShapes(shape).every(isConvertibleShape);
}

/** Exported for sibling lanes that feed the converter (the elision lane
 *  pre-filters its generated shapes with the same designed-refusal list). **/
export function isConvertibleGen(gen: GeneratedType): boolean {
  return isConvertibleShape(gen.root) && gen.decls.every((decl) => declShapes(decl).every(isConvertibleShape));
}

/** Exported alongside isConvertibleGen for sibling lanes walking a generated
 *  type's full shape set (root + declarations). **/
export function declShapes(decl: Decl): TypeShape[] {
  switch (decl.kind) {
    case 'interface':
      return [...decl.props.map((prop) => prop.shape), ...(decl.calls ?? []).flatMap((sig) => [...sig.params, sig.ret])];
    case 'class':
      return decl.props.map((prop) => prop.shape);
    case 'enum':
      return [];
    case 'type':
      return [decl.shape];
  }
}

export interface ConvertFixture {
  source: string;
  /** Probe names in written order — the root alias plus every named decl,
   *  closed by the root's value-shape twin (VALUE_PROBE). **/
  probeNames: string[];
}

/** The value-shape probe's key in the id maps: `getRunTypeId(value)` over a
 *  declared const of the root type. Every fixture carries BOTH marker call
 *  shapes (the marker test coverage rule), and the runner asserts the two
 *  root probes resolve to the SAME id on every iteration. **/
export const VALUE_PROBE = 'FzRoot(value)';

/** The INLINE-type probe's key. Every other probe names its type, and a call
 *  that names its type is left alone — so without this one the lane never
 *  exercised call-site CONVERSION at all, only the paths that skip it. This
 *  probe writes its type inline, so each leg rewrites it into that form's value
 *  spelling (`getRunTypeId(RT.object({…}))`) and back, with the id pinned
 *  across all of it.
 *
 *  Its shape is fixed rather than generated on purpose: the generated space is
 *  already covered by the declaration probes, and a shape that referenced a
 *  declaration would print the `getRunType<Name>()` escape — an extra marker
 *  site, which would shift the position-ordered probe slice below. **/
export const INLINE_PROBE = 'FzRoot(inline)';

/** Render the generated type as a DECLARATIONS file the converter rewrites:
 *  package-import preamble, the named decls, the root as `type FzRoot = …`,
 *  and one `getRunTypeId<Name>()` probe per declaration plus one
 *  reflection-shape `getRunTypeId(probeValue)` probe of the root, and one
 *  INLINE-type probe. The probes are marker call sites: the named and
 *  reflection ones must survive every target untouched, the inline one must be
 *  REWRITTEN into each form and back — and all of them re-resolve their id
 *  after every leg. **/
export function renderConvertFixture(gen: GeneratedType): ConvertFixture {
  const {decls, rootExpr} = renderGenerated(gen, FUZZ_FORMAT_PREAMBLE_PACKAGE);
  const declNames = gen.decls.map((decl) => decl.name);
  const probeNames = ['FzRoot', ...declNames, VALUE_PROBE, INLINE_PROBE];
  const body =
    `import {getRunTypeId} from '@mionjs/run-types';\n${decls}${decls ? '\n' : ''}` +
    `export type FzRoot = ${rootExpr};\ndeclare const fzRootValueProbe: FzRoot;\n`;
  const probes = ['FzRoot', ...declNames].map((name) => `getRunTypeId<${name}>();\n`).join('');
  return {
    source: body + probes + 'getRunTypeId(fzRootValueProbe);\ngetRunTypeId<{fzInlineProbe: boolean}>();\n',
    probeNames,
  };
}

// --- the on-disk project the CLI converts -----------------------------------

export interface ConvertProject {
  dir: string;
  mainPath: string;
}

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "rootDir": "src", "outDir": "dist", "strict": true
  },
  "include": ["src"]
}
`;

/** One temp project per run, reused across iterations — the marker dist copy
 *  is the expensive part. Each leg overwrites src/main.ts in place. **/
export function createConvertProject(): ConvertProject {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-convert-fuzz-'));
  writeMarkerPackage(dir);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  fs.mkdirSync(path.join(dir, 'src'));
  return {dir, mainPath: path.join(dir, 'src', 'main.ts')};
}

export function destroyConvertProject(project: ConvertProject): void {
  fs.rmSync(project.dir, {recursive: true, force: true});
}

export type ConvertTarget = 'type' | 'builders';

/** Run one CLI conversion leg over the project's src/main.ts. Throws with the
 *  full context on any non-zero exit (a refusal diagnostic, a crash). **/
export function convertLeg(project: ConvertProject, source: string, target: ConvertTarget): string {
  fs.writeFileSync(project.mainPath, source);
  const result = spawnSync(
    BIN,
    ['convert', '--tsconfig', path.join(project.dir, 'tsconfig.json'), '--to', target, path.join(project.dir, 'src')],
    {encoding: 'utf8', cwd: project.dir, maxBuffer: 64 * 1024 * 1024}
  );
  if (result.status !== 0) {
    throw new Error(`convert --to ${target} exited ${result.status}\n--- stderr ---\n${result.stderr}\n--- input ---\n${source}`);
  }
  return fs.readFileSync(project.mainPath, 'utf8');
}

// --- id probes over the serve ops --------------------------------------------

const FIXTURE = 'convert-fuzz.ts';

/** Resolve every probe's id: scan the source and zip the LAST N reflection
 *  sites (position order) with the probe names. The probes are the tail of
 *  the file on every form — conversion rewrites declarations above them and
 *  leaves marker call sites untouched — while any builder consts a converted
 *  form introduces sit earlier in the file, so the tail N reflection sites
 *  are exactly the probes in written order. **/
export async function scanProbeIds(
  client: ResolverClient,
  fixture: ConvertFixture,
  source: string
): Promise<Map<string, string>> {
  await client.setSources({...MARKER_PACKAGE_OVERLAY, [FIXTURE]: source});
  const resp = await client.scanFiles([FIXTURE]);
  const probeCount = fixture.probeNames.length;
  const reflectionSites = (resp.sites ?? []).filter((site) => !site.fnId).sort((a, b) => a.pos - b.pos);
  if (reflectionSites.length < probeCount) {
    throw new Error(`expected at least ${probeCount} reflection sites, got ${reflectionSites.length}\n--- source ---\n${source}`);
  }
  const probeSites = reflectionSites.slice(-probeCount);
  const ids = new Map<string, string>();
  fixture.probeNames.forEach((name, index) => ids.set(name, probeSites[index].id));
  return ids;
}

// --- the randomized chain ----------------------------------------------------

/** The intermediate walk: with two forms shipping, every chain is one
 *  builders leg closed by the type form (a same-form leg is a byte no-op
 *  skip, so no longer walks exist). **/
export function randomChain(): ConvertTarget[] {
  return ['builders', 'type'];
}

export interface ChainResult {
  finalSource: string;
  chain: ConvertTarget[];
}

/** Walk one randomized chain from a type-form source, asserting every probe id
 *  stays exactly baseline on every leg. **/
export async function runChain(
  client: ResolverClient,
  project: ConvertProject,
  fixture: ConvertFixture,
  startSource: string,
  baseline: Map<string, string>,
  chain: ConvertTarget[]
): Promise<ChainResult> {
  let current = startSource;
  for (const target of chain) {
    current = convertLeg(project, current, target);
    const ids = await scanProbeIds(client, fixture, current);
    for (const [name, id] of baseline) {
      if (ids.get(name) !== id) {
        throw new Error(
          `id moved for ${name} after --to ${target} (chain ${chain.join(' → ')}): ${id} → ${ids.get(name)}\n--- form ---\n${current}`
        );
      }
    }
  }
  return {finalSource: current, chain};
}

// --- the runner ---------------------------------------------------------------

export interface ConvertFuzzReport {
  iterations: number;
  rerolls: number;
  /** Iterations that hit a DESIGNED loud refusal (EXPECTED_REFUSALS) — skipped,
   *  ceiling-checked so the allowlist can never swallow the lane. **/
  expectedRefusals: number;
  failures: string[];
}

/** The designed CNV001 refusals the generated space can legitimately reach —
 *  each is a documented loud lane, not a bug. Anything else is a failure.
 *  The list is EMPTY since every named recursive declaration converts: the
 *  embedded-self-reference and tuple-slot entries left when those shapes
 *  started converting to the LAZY PAIR (a kept real type plus a
 *  `getRunType<Name>()` handle const). Only call-site/unnamed cycles refuse,
 *  and the generator never writes those. **/
const EXPECTED_REFUSALS: RegExp[] = [];

function isExpectedRefusal(message: string): boolean {
  return EXPECTED_REFUSALS.some((pattern) => pattern.test(message));
}

export interface ConvertFuzzOptions {
  seed: number;
  iterations: number;
}

const REROLL_LIMIT = 40;

export async function runConvertFuzz(options: ConvertFuzzOptions): Promise<ConvertFuzzReport> {
  const report: ConvertFuzzReport = {iterations: 0, rerolls: 0, expectedRefusals: 0, failures: []};
  const client = openClient();
  const project = createConvertProject();
  try {
    for (let iteration = 0; iteration < options.iterations; iteration++) {
      report.iterations++;
      // Seeded generation with a seeded reroll ladder — a rejected draw moves
      // to the next attempt seed, so replay is exact.
      let gen: GeneratedType | undefined;
      for (let attempt = 0; attempt < REROLL_LIMIT && !gen; attempt++) {
        const candidate = withSeededRandom(mixSeed(options.seed, `convert:${attempt}`, iteration), () =>
          genType(CONVERT_GEN_OPTIONS)
        );
        if (isConvertibleGen(candidate)) gen = candidate;
        else report.rerolls++;
      }
      if (!gen) {
        report.failures.push(`iteration ${iteration}: no convertible draw in ${REROLL_LIMIT} attempts`);
        continue;
      }
      const fixture = renderConvertFixture(gen);
      const title = describeType(gen);
      try {
        const baseline = await scanProbeIds(client, fixture, fixture.source);
        // Marker form equivalence, fuzz-strength: the static and value call
        // shapes of getRunTypeId must agree on the root's id for EVERY draw.
        if (baseline.get(VALUE_PROBE) !== baseline.get('FzRoot')) {
          throw new Error(
            `getRunTypeId<FzRoot>() and getRunTypeId(value) diverged: ${baseline.get('FzRoot')} vs ${baseline.get(VALUE_PROBE)}\n--- source ---\n${fixture.source}`
          );
        }
        const [chainA, chainB] = withSeededRandom(mixSeed(options.seed, 'convert:chains', iteration), () => [
          randomChain(),
          randomChain(),
        ]);
        // Pass 1 normalizes the generated text into the converter's canonical
        // type form; pass 2 must land on the SAME BYTES through an
        // independently random path.
        const passA = await runChain(client, project, fixture, fixture.source, baseline, chainA);
        const passB = await runChain(client, project, fixture, passA.finalSource, baseline, chainB);
        if (passB.finalSource !== passA.finalSource) {
          throw new Error(
            `type-form fixpoint diverged between chains ${chainA.join(' → ')} and ${chainB.join(' → ')}\n--- pass A ---\n${passA.finalSource}\n--- pass B ---\n${passB.finalSource}`
          );
        }
        // C5 at the CLI level: the shared fixpoint must already BE converged —
        // one more `--to type` leg over it is a byte no-op. Any normalization
        // the converter applies (collapsed unknown unions, canonical arm and
        // import order, slot spellings) has to be reached on the first pass,
        // never asymptotically.
        const settled = convertLeg(project, passB.finalSource, 'type');
        if (settled !== passB.finalSource) {
          throw new Error(
            `type-form fixpoint not stable under re-conversion\n--- fixpoint ---\n${passB.finalSource}\n--- re-converted ---\n${settled}`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isExpectedRefusal(message)) {
          report.expectedRefusals++;
          continue;
        }
        report.failures.push(`iteration ${iteration} (seed ${options.seed}, ${title}): ${message}`);
      }
    }
  } finally {
    client.close();
    destroyConvertProject(project);
  }
  return report;
}
