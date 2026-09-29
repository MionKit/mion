// Fans the Go dump of internal/diagnostics, the one source of every message, out into the headline
// dictionary the bundler and lint plugins render from (the wire carries only code + args) and the
// website page JSON. Both are committed so consumers build without Go; run
// `pnpm miondevx core codegen diag` after changing internal/diagnostics.

import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const goRoot = resolve(repoRoot, 'ts-go-runtypes');
const generatedTsPath = resolve(repoRoot, 'packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts');
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
    prefixes: ['MKR', 'CTA', 'PFN', 'TMP', 'BAT', 'EXP', 'DWN'],
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
    description: 'From the JSON families, plus how classes are handled.',
    prefixes: ['PJ', 'PJS', 'RJ', 'CLS', 'JCP', 'TFN', 'NE', 'UPN'],
  },
  {
    key: 'unknown-keys',
    label: 'Unknown keys',
    description: 'From removeUnknownKeys.',
    prefixes: ['RUK'],
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
    key: 'mion-routes',
    label: 'mion routes',
    description: 'From the rules over mion route, middleware and headersFn handlers, reported as you write them.',
    prefixes: ['MRT'],
  },
  {
    key: 'bundled-api',
    label: 'Bundled API',
    description: 'From a client build that ships the routes it calls, rather than asking the server for them.',
    prefixes: ['MET'],
  },
  {
    key: 'client-imports',
    label: 'Client imports',
    description: 'From a client file that imports the API type it passes to initClient as a value.',
    prefixes: ['SRV'],
  },
  {
    key: 'enrichment',
    label: 'Enrichment files',
    description: 'From mion enrich --no-emit and the lint rules over generated FriendlyText and MockData files.',
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

const missingSummaries = goRecords.filter((record) => !record.summary).map((record) => record.code);
if (missingSummaries.length) {
  // TestEveryCodeHasSummary pins this too; else the page shows a code with no explanation.
  throw new Error(`gen-diag-catalog: codes with no summary in internal/diagnostics/prose.go: ${missingSummaries.join(', ')}`);
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
    const lines = [
      `  ${record.code}: {`,
      `    headline: ${tsString(record.headline)},`,
      `    level: ${tsString(record.level)},`,
      `    family: ${tsString(record.family)},`,
    ];
    if (record.completeness) lines.push(`    completeness: true,`);
    lines.push('  },');
    return lines.join('\n');
  })
  .join('\n');

const generatedTs = `// GENERATED FILE. DO NOT EDIT. Run \`pnpm miondevx core codegen diag\` to refresh.
//
// The message dictionary for every diagnostic code the Go binary can emit,
// exported from the authoritative catalog in internal/diagnostics (wording lives in
// internal/diagnostics/messages.go). The wire carries only code + args; the render
// helpers in ./diagnosticCatalog.ts substitute \`{0}\`, \`{1}\`, … placeholders
// against the args array to produce the final text.

export interface DiagnosticEntry {
  /** Single-line headline. Mandatory. */
  readonly headline: string;
  /** The code's level: did the build produce the code for
   *  this thing (\`error\`: no), and is what it produced broken when called
   *  (\`runtimeError\`: yes). Read by the config validators, which refuse to
   *  downgrade an \`error\`. */
  readonly level: 'error' | 'runtimeError' | 'warning' | 'info';
  /** Which part of the compiler raises the code. */
  readonly family: 'purefn' | 'marker' | 'runtype' | 'enrich' | 'mionroute';
  /** Set on the unfilled-enrichment-scaffold codes. Orthogonal to level: those
   *  are warnings, and this bit is what the completeness gates promote. */
  readonly completeness?: boolean;
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
  // Fatal, not a warning: the page renders one section per declared subsystem, so an unmapped
  // prefix would ship a code that is in the data and on no page.
  const subsystem = prefixToSubsystem.get(codePrefix(record.code));
  if (!subsystem) {
    throw new Error(
      `gen-diag-catalog: no subsystem for ${record.code}; add its prefix to SUBSYSTEMS in ${'scripts/core/gen-diagnostics-catalog.mjs'}`
    );
  }
  return {
    code: record.code,
    subsystem,
    level: record.level,
    headline: record.headline,
    summary: record.summary,
    fix: record.fix ?? null,
    example: record.example ?? null,
  };
});

const subsystemOrder = new Map(SUBSYSTEMS.map((subsystem, index) => [subsystem.key, index]));
codes.sort((left, right) => {
  const bySection = (subsystemOrder.get(left.subsystem) ?? 99) - (subsystemOrder.get(right.subsystem) ?? 99);
  return bySection !== 0 ? bySection : left.code.localeCompare(right.code);
});

const output = {
  $generated:
    'by scripts/core/gen-diagnostics-catalog.mjs from internal/diagnostics. Do not edit; run `pnpm miondevx core codegen diag`.',
  subsystems: SUBSYSTEMS.map(({key, label, description}) => ({key, label, description})),
  codes,
};

writeFileSync(websiteJsonPath, JSON.stringify(output, null, 2) + '\n');

// Report so the dev sees coverage at a glance.
const byLevel = codes.reduce((acc, code) => ({...acc, [code.level]: (acc[code.level] ?? 0) + 1}), {});
console.log(`gen-diag-catalog: wrote ${codes.length} codes to ${generatedTsPath.replace(repoRoot + '/', '')}`);
console.log(`gen-diag-catalog: wrote ${codes.length} codes to ${websiteJsonPath.replace(repoRoot + '/', '')}`);
console.log(`  levels: ${JSON.stringify(byLevel)}`);
console.log(`  by subsystem: ${JSON.stringify(
  codes.reduce((acc, code) => ({...acc, [code.subsystem]: (acc[code.subsystem] ?? 0) + 1}), {}),
)}`);
