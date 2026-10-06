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

// Sections group the area prefixes, in page order; every prefix in internal/diagnostics's slugRE must sit in one.
// Descriptions stay plain and dash-free: the website voice rules apply when the component renders them.
const SUBSYSTEMS = [
  {
    key: 'project-config',
    label: 'Project configuration',
    description: 'Raised when the project tsconfig the tooling was pointed at cannot be loaded.',
    prefixes: ['config-'],
  },
  {
    key: 'markers',
    label: 'Markers and call sites',
    description: 'Raised at a marker call, before the build can turn your type into a function.',
    prefixes: ['marker-'],
  },
  {
    key: 'comments',
    label: 'Comments',
    description: 'Raised when a @mion-expect-error or @mion-downgrade-error comment is itself wrong.',
    prefixes: ['comment-'],
  },
  {
    key: 'validation',
    label: 'Validation',
    description: 'From createValidateFn and createGetValidationErrorsFn.',
    prefixes: ['validate-', 'validation-errors-'],
  },
  {
    key: 'serialization',
    label: 'Serialization',
    description: 'From the JSON families, plus members that can never be data.',
    prefixes: ['json-prepare-', 'json-restore-', 'data-'],
  },
  {
    key: 'unknown-keys',
    label: 'Unknown keys',
    description: 'From removeUnknownKeys.',
    prefixes: ['unknown-keys-'],
  },
  {
    key: 'formats',
    label: 'Type formats',
    description: 'From the pattern and sample checks on a TypeFormat.',
    prefixes: ['format-'],
  },
  {
    key: 'pure-functions',
    label: 'Pure functions',
    description: 'From PureFunction arguments and the purity rules for registerPureFnFactory.',
    prefixes: ['purefn-'],
  },
  {
    key: 'overrides',
    label: 'Overrides',
    description: 'From custom per-type function overrides.',
    prefixes: ['override-'],
  },
  {
    key: 'drizzle',
    label: 'Drizzle',
    description: 'Slim schema isolation and public database type boundaries.',
    prefixes: ['drizzle-'],
  },
  {
    key: 'mion-routes',
    label: 'mion routes',
    description: 'From the rules over mion route, middleware and headersMiddleware handlers, reported as you write them.',
    prefixes: ['rpc-handler-'],
  },
  {
    key: 'batches',
    label: 'Batches',
    description: 'From a batch() call the build cannot read, or two batches that collide.',
    prefixes: ['rpc-batch-'],
  },
  {
    key: 'clients',
    label: 'Clients',
    description: 'From a client build that ships the routes it calls, or that imports the API type as a value.',
    prefixes: ['rpc-client-'],
  },
  {
    key: 'enrichment',
    label: 'Enrichment files',
    description: 'From mion enrich --no-emit and the lint rules over generated FriendlyText and MockData files.',
    prefixes: ['enrich-text-', 'enrich-mock-', 'enrich-mirror-'],
  },
  {
    key: 'internal',
    label: 'Internal errors',
    description: 'A bug in the build itself. Please file an issue.',
    prefixes: ['internal-'],
  },
];

const prefixToSubsystem = SUBSYSTEMS.flatMap((subsystem) => subsystem.prefixes.map((prefix) => [prefix, subsystem.key]));

/** The section a name belongs to, from its area prefix, e.g. `validate-symbol-root` -> `validation`. */
function subsystemOf(code) {
  return prefixToSubsystem.find(([prefix]) => code.startsWith(prefix))?.[1];
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
      `  ${JSON.stringify(record.code)}: {`,
      `    headline: ${tsString(record.headline)},`,
      `    level: ${tsString(record.level)},`,
      `    family: ${tsString(record.family)},`,
    ];
    if (record.slots?.length) lines.push(`    slots: [${record.slots.map(tsString).join(', ')}],`);
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
// helpers in ./diagnosticCatalog.ts fill each \`{name}\` slot with the arg at its
// index in \`slots\`.

export interface DiagnosticEntry {
  /** Single-line headline. Mandatory. */
  readonly headline: string;
  /** The headline's \`{name}\` slots in first-appearance order, the order of the wire args. */
  readonly slots?: readonly string[];
  /** The code's level: did the build produce the code for
   *  this thing (\`error\`: no), and is what it produced broken when called
   *  (\`runtimeError\`: yes). Read by the config validators, which refuse to
   *  downgrade an \`error\`. */
  readonly level: 'error' | 'runtimeError' | 'warning' | 'info';
  /** Which part of the compiler raises the code. */
  readonly family: 'purefn' | 'marker' | 'runtype' | 'enrich' | 'mionroute' | 'drizzle';
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
  // Fatal, not a warning: an unmapped prefix would ship a code that is in the data and on no page.
  const subsystem = subsystemOf(record.code);
  if (!subsystem) {
    throw new Error(
      `gen-diag-catalog: no subsystem for ${record.code}; add its prefix to SUBSYSTEMS in ${'scripts/core/gen-diagnostics-catalog.mjs'}`
    );
  }
  return {
    code: record.code,
    subsystem,
    level: record.level,
    ...(record.internal ? {internal: true} : {}),
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
