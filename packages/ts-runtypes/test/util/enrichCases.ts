// Shared harness for the AI-enrichment generation suite: extract every case's
// `case()` arrow-function body from a category file via `ts-go-runtypes/cmd/extract-fn-bodies`,
// then split each body by the `// ##### … #####` markers into its `src` /
// `friendly` / `mock` spans.

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GO_ROOT = resolve(HERE, '../../../../ts-go-runtypes');
const CASES_DIR = resolve(HERE, '../suites/enrich/cases');

// The four marker-delimited spans of a `case()` body. `result` is the runtime
// return and is not used by the shape comparison.
export interface CaseSpans {
  src: string;
  friendly: string;
  mock: string;
}

// extractFnBodies spawns the Go extractor over a category file and returns the
// raw arrow-function-body source text per case key. The extractor's JSON
// mirrors the const's object nesting: `{ <caseKey>: { case: "<body text>" } }`.
function extractFnBodies(categoryFile: string, constName: string): Record<string, {case?: string}> {
  const result = spawnSync('go', ['run', './cmd/extract-fn-bodies', '--file', categoryFile, '--identifier', constName], {
    cwd: GO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`extract-fn-bodies failed to launch: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`extract-fn-bodies exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout) as Record<string, {case?: string}>;
}

// Markers — must appear in this exact order inside every `case()` body.
const MARKERS = ['// ##### src #####', '// ##### friendly #####', '// ##### mock #####', '// ##### result #####'] as const;

// splitByMarkers slices a case body into its four spans, then reduces the
// `friendly` / `mock` declaration spans to the bare object-literal initializer
// (strips the `const … = ` prefix and the trailing `;`) and the `src` span to
// the `type Target = …;` declaration. Throws when a marker is missing so a
// mis-authored case fails loudly.
function splitByMarkers(caseKey: string, body: string): CaseSpans {
  const positions = MARKERS.map((marker) => {
    const at = body.indexOf(marker);
    if (at < 0) throw new Error(`case '${caseKey}': missing marker ${JSON.stringify(marker)}`);
    return at;
  });
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] <= positions[i - 1]) throw new Error(`case '${caseKey}': markers out of order`);
  }
  const span = (i: number): string => {
    const start = positions[i] + MARKERS[i].length;
    const end = i + 1 < positions.length ? positions[i + 1] : body.length;
    return body.slice(start, end).trim();
  };
  return {
    src: span(0),
    friendly: initializerOf(caseKey, 'friendlyTarget', span(1)),
    mock: initializerOf(caseKey, 'mockTarget', span(2)),
  };
}

// initializerOf strips a `const <name>: <Annotation> = <initializer>;`
// declaration down to just the bare object-literal `<initializer>`
// (whitespace-trimmed, trailing `;` removed). The annotation may itself contain
// `=` only inside generics, so we anchor on the declared const name and take
// everything after the FIRST ` = ` following it.
//
// A trailing ` as <Type>` assertion is stripped: a few divergent leaf kinds
// (tuple, Map, Set — the emitter treats them as opaque leaves and emits a
// `{pool: []}` mock that is NOT structurally assignable to `MockData<T>`, since
// that type models tuples as `{rt$items, rt$length}` and Map/Set as homomorphic
// object maps) author their mock as `{pool: []} as MockData<Target>`. We strip
// the cast so the comparison sees the bare literal the generator emits.
function initializerOf(caseKey: string, constName: string, declaration: string): string {
  const eq = declaration.indexOf(' = ');
  if (eq < 0 || !declaration.includes(`const ${constName}`)) {
    throw new Error(`case '${caseKey}': could not parse '${constName}' declaration from:\n${declaration}`);
  }
  let initializer = declaration.slice(eq + 3).trim();
  if (initializer.endsWith(';')) initializer = initializer.slice(0, -1).trim();
  return stripTrailingAs(initializer);
}

// stripTrailingAs drops a top-level ` as <Type>` assertion that follows the
// leading balanced object literal. Returns the input unchanged when there is no
// such trailing cast (the common case).
function stripTrailingAs(initializer: string): string {
  if (initializer[0] !== '{') return initializer;
  let depth = 0;
  for (let i = 0; i < initializer.length; i++) {
    const char = initializer[i];
    if (char === '{' || char === '[' || char === '(') depth++;
    else if (char === '}' || char === ']' || char === ')') {
      depth--;
      if (depth === 0) {
        const rest = initializer.slice(i + 1).trimStart();
        if (rest.startsWith('as ')) return initializer.slice(0, i + 1).trim();
        return initializer;
      }
    }
  }
  return initializer;
}

// loadCategorySpans extracts + splits every case of a category. `constName` is
// the exported const (e.g. `ATOMIC`); the file is derived as
// `cases/<TitleCaseName>.ts`. Returns `{ caseKey → spans }`.
export function loadCategorySpans(fileBase: string, constName: string): Record<string, CaseSpans> {
  const categoryFile = resolve(CASES_DIR, `${fileBase}.ts`);
  const bodies = extractFnBodies(categoryFile, constName);
  const out: Record<string, CaseSpans> = {};
  for (const [caseKey, leaves] of Object.entries(bodies)) {
    if (!leaves.case) throw new Error(`case '${caseKey}' in ${fileBase}: no extracted case() body`);
    out[caseKey] = splitByMarkers(caseKey, leaves.case);
  }
  return out;
}
