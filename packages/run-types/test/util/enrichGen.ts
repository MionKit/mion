// AI-enrichment generation pipeline:
// write each case's `src` span to its own temp module file under the in-repo
// `.tmp/` dir, run ONE `gen --files … --type Target` batch over all of them,
// then Prettier-normalize both the generated skeletons and the case-authored
// expecteds so the comparison is about shape + keys, not formatting.

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import prettier from 'prettier';

import {loadCategorySpans, type CaseSpans} from './enrichCases.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const BIN = resolve(REPO_ROOT, 'mion-bin/mion');
const TMP_ROOT = resolve(HERE, '../suites/enrich/.tmp');
// The temp modules import `@mionjs/run-types/formats`; the binary no longer forces
// the "source" condition, so point enrich at the repo's test tsconfig — it carries
// customConditions:["source"] to resolve the package name to its in-tree src.
const TSCONFIG_TEST = resolve(REPO_ROOT, 'packages/run-types/tsconfig.test.json');

// The two test entries (`enrichGen`, `enrichCheck`) run in parallel and
// share `.tmp`, so each writes into its OWN lane subdir to avoid clobbering the
// other's files (one entry's afterAll cleanup must not delete the other's temp
// modules mid-run). `Lane` names the subdir.
export type Lane = 'gen' | 'check' | 'reconcile';

// The lane subdir also carries the WORKER's pid. TMP_ROOT is anchored at
// test/util, so every copy of a suite file resolves the same one — and the
// converted-suite trees run the builders and JSON Schema copies of these tests
// side by side in one vitest project. Two copies of a lane then shared a
// directory and cleaned up under each other mid-run ("0 translation file(s)").
// The pid separates concurrent workers without needing to know which tree the
// caller came from; a sequential re-run inside one worker still reuses its own.
const laneDir = (lane: Lane): string => resolve(TMP_ROOT, `${lane}-${process.pid}`);

// One temp module per case carries `import type * as TF` + the case's `src`
// (a `type Target = …;` declaration) re-exported so the program keeps it.
const TEMP_HEADER = "import type * as TF from '@mionjs/run-types/formats';\n";

// What the gen CLI returns per file.
interface GenSkeletons {
  friendly: string;
  mock: string;
}

// One comparison row per case — generated vs expected, all Prettier-normalized.
export interface CaseComparison {
  caseKey: string;
  genFriendly: string;
  genMock: string;
  expectedFriendly: string;
  expectedMock: string;
}

// prettierNormalize formats an object-literal text by wrapping it as
// `const _ = <text>;`, running Prettier, then returning the formatted source.
// Both the emitter output (its own whitespace style) and the case initializer
// (the suite's Prettier style) collapse to the same canonical string.
export async function prettierNormalize(objLiteralText: string): Promise<string> {
  // Collapse the source to a single line first. Prettier PRESERVES an object
  // literal's expansion when the source has a newline right after the opening
  // `{` (its multiline-object heuristic). The generator emits nested objects
  // multi-line while the authored expecteds are inline, so without this collapse
  // the two would never converge. Flattening lets Prettier re-decide expansion
  // purely by `printWidth`, giving both sides one canonical form.
  const oneLine = objLiteralText.replace(/\s*\n\s*/g, ' ');
  const formatted = await prettier.format(`const _ = ${oneLine};`, {
    parser: 'typescript',
    printWidth: 120,
    singleQuote: true,
    bracketSpacing: false,
  });
  return formatted.trim();
}

// runGenBatch writes one temp file per case and runs `gen --files … --type
// Target`. Returns the parsed JSON keyed by temp-file basename. The temp file
// names embed the case key so the JSON maps straight back.
function runGenBatch(fileBase: string, spans: Record<string, CaseSpans>): Record<string, GenSkeletons> {
  const dir = laneDir('gen');
  mkdirSync(dir, {recursive: true});
  const files: string[] = [];
  const keyByBasename: Record<string, string> = {};
  for (const [caseKey, span] of Object.entries(spans)) {
    const basename = `${fileBase}__${caseKey}`;
    const filePath = resolve(dir, `${basename}.ts`);
    writeFileSync(filePath, `${TEMP_HEADER}${span.src}\nexport type {Target};\n`);
    files.push(filePath);
    keyByBasename[basename] = caseKey;
  }

  const result = spawnSync(BIN, ['enrich', '--files', files.join(','), '--type', 'Target', '--tsconfig', TSCONFIG_TEST], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`gen --files failed to launch: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gen --files exited ${result.status}: ${result.stderr}\n${result.stdout}`);

  const byBasename = JSON.parse(result.stdout) as Record<string, GenSkeletons>;
  const byCaseKey: Record<string, GenSkeletons> = {};
  for (const [basename, skeletons] of Object.entries(byBasename)) {
    const caseKey = keyByBasename[basename];
    if (!caseKey) throw new Error(`gen returned an unexpected file key: ${basename}`);
    byCaseKey[caseKey] = skeletons;
  }
  return byCaseKey;
}

// generateCategory runs the full pipeline for a category and returns one
// normalized comparison row per case. Asserts the generator emitted output for
// every case (a typo'd / missing case yields no CLI row → throw here).
export async function generateCategory(fileBase: string, constName: string): Promise<Record<string, CaseComparison>> {
  const spans = loadCategorySpans(fileBase, constName);
  const generated = runGenBatch(fileBase, spans);

  const out: Record<string, CaseComparison> = {};
  for (const [caseKey, span] of Object.entries(spans)) {
    const gen = generated[caseKey];
    if (!gen) throw new Error(`category ${fileBase}: case '${caseKey}' produced no gen output`);
    out[caseKey] = {
      caseKey,
      genFriendly: await prettierNormalize(gen.friendly),
      genMock: await prettierNormalize(gen.mock),
      expectedFriendly: await prettierNormalize(span.friendly),
      expectedMock: await prettierNormalize(span.mock),
    };
  }
  return out;
}

// One `check` finding (the JSON shape the CLI emits per finding).
export interface CheckFinding {
  code: string;
  family?: number;
  severity: number;
  site?: {filePath: string; startLine: number; startCol: number; endLine?: number; endCol?: number};
}

// One check row per case: the synthesized `.rt.ts` path + its findings.
export interface CaseCheck {
  caseKey: string;
  findings: CheckFinding[];
}

// checkCategory synthesizes a `.rt.ts` per case (the case's `src` declaration +
// the authored `friendlyTarget` / `mockTarget` consts + the marker imports),
// runs `check <file> --json` over each, and returns the findings per case. These
// are the valid, tsc-checked maps → `check` must report ZERO findings (no false
// positives across the type ranges). The `friendly` / `mock` initializers come
// from the case spans WITH any `as MockData<Target>` cast already stripped, so
// `check` sees a bare object-literal initializer it will actually walk.
export function checkCategory(fileBase: string, constName: string): Record<string, CaseCheck> {
  const spans = loadCategorySpans(fileBase, constName);
  const dir = laneDir('check');
  mkdirSync(dir, {recursive: true});

  const out: Record<string, CaseCheck> = {};
  for (const [caseKey, span] of Object.entries(spans)) {
    const filePath = resolve(dir, `${fileBase}__${caseKey}.rt.ts`);
    const source =
      `${TEMP_HEADER}` +
      "import type {FriendlyText, MockData} from '@mionjs/run-types';\n" +
      `${span.src}\n` +
      `const friendlyTarget: FriendlyText<Target> = ${span.friendly};\n` +
      `const mockTarget: MockData<Target> = ${span.mock};\n` +
      'export {friendlyTarget, mockTarget};\n';
    writeFileSync(filePath, source);

    const result = spawnSync(BIN, ['enrich', filePath, '--no-emit', '--json', '--tsconfig', TSCONFIG_TEST], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) throw new Error(`check failed to launch: ${result.error.message}`);
    // check exits 1 only when an Error-severity finding is present; for these
    // valid maps it should exit 0 with `null` / `[]`. A non-(0|1) exit is a real
    // failure (e.g. could not resolve the type) — surface it.
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`check exited ${result.status} for '${caseKey}': ${result.stderr}\n${result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout || 'null') as CheckFinding[] | null;
    out[caseKey] = {caseKey, findings: parsed ?? []};
  }
  return out;
}

// cleanupTempDir removes a lane's synthesized temp module subdir (gitignored
// via the repo-root `.gitignore`; recreated by the next run). Each test entry
// cleans only its OWN lane so the two parallel entries never delete each other's
// in-flight files. Call from afterAll.
export function cleanupTempDir(lane: Lane): void {
  rmSync(laneDir(lane), {recursive: true, force: true});
}
