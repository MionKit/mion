// Generate every diagnostic-catalog artifact from the Go dump.
//
// internal/diagnostics is the single source of truth for the whole catalog: which
// codes exist, their severities, the user-facing wording (headline + detail
// in internal/diagnostics/messages.go), and the docs prose (summary, fix, example
// in internal/diagnostics/prose.go). `go run ./cmd/gen-diag-catalog` dumps it all
// as JSON; this script fans that dump out into the two generated artifacts:
//
//   1. packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts, the
//      front-end message dictionary (code → headline/detail templates) the
//      bundler plugin, the lint plugin, and the runtime alwaysThrow factory
//      render from. The binary ships only code + args over the wire.
//   2. container/website/app/components/content/go-generated/diagnostics-catalog.json,
//      the website diagnostics page data.
//
// Both outputs are committed so consumers build without the Go toolchain.
// Run `pnpm rtx core codegen diag` after changing internal/diagnostics.

import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const goRoot = resolve(repoRoot, 'ts-go-runtypes');
const generatedTsPath = resolve(repoRoot, 'packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts');
const websiteJsonPath = resolve(repoRoot, 'container/website/app/components/content/go-generated/diagnostics-catalog.json');

// Subsystems group the code prefixes into the sections the page renders, in
// reading order. Descriptions are short, plain-language, and dash-free so they
// satisfy the website voice rules when the component renders them.
const SUBSYSTEMS = [
  {
    key: 'project-config',
    label: 'Project configuration',
    description: 'Raised when the project tsconfig the tooling was pointed at cannot be loaded.',
    prefixes: ['CFG'],
  },
  {
    key: 'markers',
    label: 'Markers and call sites',
    description: 'Raised at a marker call, before the build can turn your type into a function.',
    prefixes: ['MKR', 'CTA', 'PFN', 'TMP'],
  },
  {
    key: 'validation',
    label: 'Validation',
    description: 'From createValidateFn and createGetValidationErrorsFn.',
    prefixes: ['VL', 'VE'],
  },
  {
    key: 'serialization',
    label: 'Serialization',
    description: 'From the JSON and binary families, plus how classes are handled.',
    prefixes: ['PJ', 'PJS', 'RJ', 'SJ', 'TB', 'FB', 'CLS', 'JCP', 'NE'],
  },
  {
    key: 'unknown-keys',
    label: 'Unknown keys',
    description: 'From hasUnknownKeys, cloneExactShape, and the rest of that family.',
    prefixes: ['HUK', 'CES', 'UKE', 'UKU', 'UKW'],
  },
  {
    key: 'formats',
    label: 'Type formats',
    description: 'From the pattern and sample checks on a TypeFormat.',
    prefixes: ['FMT'],
  },
  {
    key: 'pure-functions',
    label: 'Pure functions',
    description: 'From the purity rules for registerPureFnFactory.',
    prefixes: ['PFE'],
  },
  {
    key: 'overrides',
    label: 'Overrides',
    description: 'From custom per-type function overrides.',
    prefixes: ['OVR'],
  },
  {
    key: 'enrichment',
    label: 'Enrichment files',
    description: 'From ts-runtypes check and the lint rules over generated FriendlyText and MockData files.',
    prefixes: ['FT', 'MD', 'GE'],
  },
];

/** Map a code prefix (its leading letters) to a subsystem key. */
const prefixToSubsystem = new Map();
for (const subsystem of SUBSYSTEMS) {
  for (const prefix of subsystem.prefixes) prefixToSubsystem.set(prefix, subsystem.key);
}

/** Leading uppercase letters of a code, e.g. `PJS001` -> `PJS`, `PFE9008` -> `PFE`. */
function codePrefix(code) {
  const match = code.match(/^[A-Z]+/);
  return match ? match[0] : code;
}

// The authoritative dump: codes, severities, wording, prose, all from Go.
const goDump = execFileSync('go', ['run', './cmd/gen-diag-catalog'], {
  cwd: goRoot,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
const goRecords = JSON.parse(goDump);

const missingHeadlines = goRecords.filter((record) => !record.headline).map((record) => record.code);
if (missingHeadlines.length) {
  // internal/diagnostics's TestEveryCodeHasHeadline pins this; fail loudly if it slips.
  throw new Error(`gen-diag-catalog: codes with no headline in internal/diagnostics/messages.go: ${missingHeadlines.join(', ')}`);
}

// ── Artifact 1: the front-end message dictionary ────────────────────────────

/** Quote a template as a TS string literal the way prettier would (fewest escapes, single-quote tie-break). */
function tsString(value) {
  const singles = (value.match(/'/g) ?? []).length;
  const doubles = (value.match(/"/g) ?? []).length;
  const quote = singles > doubles ? '"' : "'";
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll(quote, '\\' + quote)
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t');
  return quote + escaped + quote;
}

const entries = goRecords
  .map((record) => {
    const lines = [`  ${record.code}: {`, `    headline: ${tsString(record.headline)},`, `    severity: ${tsString(record.severity)},`];
    if (record.detail) lines.push(`    detail: ${tsString(record.detail)},`);
    lines.push('  },');
    return lines.join('\n');
  })
  .join('\n');

const generatedTs = `// GENERATED FILE. DO NOT EDIT. Run \`pnpm rtx core codegen diag\` to refresh.
//
// The message dictionary for every diagnostic code the Go binary can emit,
// exported from the authoritative catalog in internal/diagnostics (wording lives in
// internal/diagnostics/messages.go). The wire carries only code + args; the render
// helpers in ./diagnosticCatalog.ts substitute \`{0}\`, \`{1}\`, … placeholders
// against the args array to produce the final text.

export interface DiagnosticEntry {
  /** Single-line headline. Mandatory. */
  readonly headline: string;
  /** Catalog severity: the default lint-rule tier this code routes to. */
  readonly severity: 'error' | 'warning' | 'info';
  /** Optional multi-line detail block (explanation + code-example fix). */
  readonly detail?: string;
}

export const DIAGNOSTIC_CATALOG: Record<string, DiagnosticEntry> = {
${entries}
};
`;

writeFileSync(generatedTsPath, generatedTs);
// Normalise style with the repo's own prettier config so check-format stays green.
execFileSync('pnpm', ['exec', 'prettier', '--write', generatedTsPath], {cwd: repoRoot, stdio: 'inherit'});

// ── Artifact 2: the website diagnostics-page JSON ───────────────────────────

const codes = goRecords.map((record) => {
  const subsystem = prefixToSubsystem.get(codePrefix(record.code)) ?? 'other';
  if (subsystem === 'other') console.warn(`gen-diag-catalog: no subsystem for ${record.code}`);
  return {
    code: record.code,
    subsystem,
    severity: record.severity,
    headline: record.headline,
    detail: record.detail ?? null,
    summary: record.summary ?? null,
    fix: record.fix ?? null,
    example: record.example ?? null,
  };
});

const undocumented = codes.filter((code) => !code.summary).map((code) => code.code);

const subsystemOrder = new Map(SUBSYSTEMS.map((subsystem, index) => [subsystem.key, index]));
codes.sort((left, right) => {
  const bySection = (subsystemOrder.get(left.subsystem) ?? 99) - (subsystemOrder.get(right.subsystem) ?? 99);
  return bySection !== 0 ? bySection : left.code.localeCompare(right.code);
});

const output = {
  $generated:
    'by scripts/core/gen-diagnostics-catalog.mjs from internal/diagnostics. Do not edit; run `pnpm rtx core codegen diag`.',
  subsystems: SUBSYSTEMS.map(({key, label, description}) => ({key, label, description})),
  codes,
};

writeFileSync(websiteJsonPath, JSON.stringify(output, null, 2) + '\n');

// Report so the dev sees coverage at a glance.
const bySeverity = codes.reduce((acc, code) => ({...acc, [code.severity]: (acc[code.severity] ?? 0) + 1}), {});
console.log(`gen-diag-catalog: wrote ${codes.length} codes to ${generatedTsPath.replace(repoRoot + '/', '')}`);
console.log(`gen-diag-catalog: wrote ${codes.length} codes to ${websiteJsonPath.replace(repoRoot + '/', '')}`);
console.log(`  severities: ${JSON.stringify(bySeverity)}`);
console.log(`  by subsystem: ${JSON.stringify(
  codes.reduce((acc, code) => ({...acc, [code.subsystem]: (acc[code.subsystem] ?? 0) + 1}), {}),
)}`);
console.log(`  prose written for ${codes.length - undocumented.length}/${codes.length} codes`);
if (undocumented.length) console.log(`  still need a hand-written summary: ${undocumented.join(', ')}`);
