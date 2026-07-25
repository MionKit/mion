// Transport-agnostic mapping from the resolver's wire diagnostics to lint
// reports: which RULE each diagnostic belongs to, the rendered message, and
// the 0-based-column location shape lint APIs expect. The OXlint/ESLint
// plugin entry (index.ts) is one sink over this module; a future LSP sink
// reuses it unchanged (see the spec's transport-agnostic requirement).

import {DIAGNOSTIC_CATALOG, renderHeadline} from '../diagnosticCatalog.ts';
import {Family, Severity, type Diagnostic, type DiagnosticSite} from '../protocol.ts';

// Rules are grouped by the DIAGNOSTIC FAMILY that produced them (the Go
// catalog's code-prefix families) and NAMED for what they catch, not for their
// severity. Within a family the two tiers are two different findings — a root
// the feature cannot represent (the build fails) versus a member it silently
// skips — so each is its own descriptively-named rule, and a team can set the
// level of each on its own. Severity, not the name, decides the tier. The
// concrete code (e.g. `[VL011]`) always rides in the message, so per-code
// disable comments and lookups keep working. `validate` covers both
// `createValidateFn` and `createGetValidationErrorsFn` (VL + VE).
export type RuleName =
  | 'broken-tsconfig'
  | 'invalid-marker'
  | 'redundant-marker'
  | 'pure-functions'
  | 'validate-non-serializable'
  | 'validate-skipped-member'
  | 'json-non-serializable'
  | 'json-skipped-member'
  | 'binary-non-serializable'
  | 'binary-skipped-member'
  | 'clone-unsupported-type'
  | 'clone-shared-reference'
  | 'unknown-keys'
  | 'format'
  | 'invalid-override'
  | 'override-side-effect'
  | 'non-enumerable'
  | 'class-serializer'
  | 'other'
  | 'no-enrichment-todo'
  | 'no-orphan-carcass'
  | 'enrichment-field'
  | 'enrichment-message'
  | 'enrichment-broken-source'
  | 'enrichment-misplaced-file';

// RuleSpec is the single source of truth for a rule: its default level (mirrors
// the Go catalog severity of the codes it carries), which cheap text pre-filter
// admits a file to the resolver pass (`compiler` scans any marker/RT file,
// `enrichment` only generated mirror files), and the one-line description lint
// hosts show. index.ts builds its `rules` record and `recommended` config from
// this table; nothing hand-lists the rules twice.
export interface RuleSpec {
  readonly name: RuleName;
  readonly default: 'error' | 'warn';
  readonly gate: 'compiler' | 'enrichment';
  readonly description: string;
}

export const RULE_SPECS: readonly RuleSpec[] = [
  {
    name: 'broken-tsconfig',
    default: 'error',
    gate: 'compiler',
    description:
      'The project tsconfig the linter was pointed at (the tsconfig setting, or the default tsconfig.json) is missing or does not parse, so type-aware linting cannot run. The linter reads the same config as your build; fix the config or the configured path',
  },
  {
    name: 'invalid-marker',
    default: 'error',
    gate: 'compiler',
    description:
      'A marker call the build cannot turn into a function: a generic type argument never filled in with a concrete type, an options argument that is not a plain literal the build can read, an import that failed to resolve, or a Temporal type without the Temporal lib enabled',
  },
  {
    name: 'redundant-marker',
    default: 'warn',
    gate: 'compiler',
    description:
      'A marker that works but probably does not do what you meant: a function called inside a marker just to read its return type (the call itself is wasted), or a ValidateOptions flag that has no effect on this particular type',
  },
  {
    name: 'pure-functions',
    default: 'error',
    gate: 'compiler',
    description:
      'A registered pure function that breaks the purity rules (uses this, await, yield, dynamic import, blocked globals, or variables from outside its own body), is registered twice with different bodies, or is referenced by a generated function but never registered',
  },
  {
    name: 'validate-non-serializable',
    default: 'error',
    gate: 'compiler',
    description:
      'A type that can never be validated. Validators check serializable data only (the data-only projection of the type), so a type like symbol or Map at a root position has nothing to check and the generated function will always fail',
  },
  {
    name: 'validate-skipped-member',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the validator silently skips: functions, methods, statics, and symbols are not data and never survive JSON, so the generated validator checks the rest of the object and ignores them',
  },
  {
    name: 'json-non-serializable',
    default: 'error',
    gate: 'compiler',
    description:
      'A type that can never be encoded to or decoded from JSON (a function, symbol, never, or a non-serializable built-in like Map at a root position) — the generated function will always fail',
  },
  {
    name: 'json-skipped-member',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the JSON encoder and decoder silently leave out (a function, method, static, or symbol member) — the rest of the object round-trips normally',
  },
  {
    name: 'binary-non-serializable',
    default: 'error',
    gate: 'compiler',
    description:
      'A type that can never be serialised to or deserialised from binary (a function, symbol, never, or a non-serializable built-in like Map at a root position) — the generated function will always fail',
  },
  {
    name: 'binary-skipped-member',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the binary encoder and decoder silently leave out (a function, method, static, or symbol member) — the rest of the object round-trips normally',
  },
  {
    name: 'clone-unsupported-type',
    default: 'error',
    gate: 'compiler',
    description:
      'A type cloneExactShape cannot clone safely: a union of objects (the clone cannot tell which shape to rebuild) or a callable root. A clone that guessed could keep unknown keys, so the build stops instead',
  },
  {
    name: 'clone-shared-reference',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the clone cannot rebuild (a function, symbol, or non-serializable built-in), so it stays pointing at the same value as the original — changes through it are visible on both copies',
  },
  {
    name: 'unknown-keys',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the unknown-keys helpers (hasUnknownKeys, unknownKeyErrors, unknownKeysToUndefined) silently skip, such as a function member — the check covers the rest of the object',
  },
  {
    name: 'format',
    default: 'error',
    gate: 'compiler',
    description:
      'A custom string format with a broken definition: a mock sample that does not match its own pattern, a sample that violates a sibling constraint like maxLength, or invalid format params. Also fires when the linter re-checks samples the build could not verify (allowUncheckedPatterns)',
  },
  {
    name: 'invalid-override',
    default: 'error',
    gate: 'compiler',
    description:
      'An override that cannot work: the same (type, function) pair registered twice, or an override redirect pointing at a generated module that does not exist',
  },
  {
    name: 'override-side-effect',
    default: 'warn',
    gate: 'compiler',
    description:
      'A validate override on a type whose JSON and binary union decoders also run validation internally — the override changes their behaviour too, which may be intended but is worth knowing',
  },
  {
    name: 'non-enumerable',
    default: 'error',
    gate: 'compiler',
    description:
      'A property marked @nonEnumerable that is not optional — a non-enumerable property can be absent from a plain object, so the type must allow undefined',
  },
  {
    name: 'class-serializer',
    default: 'warn',
    gate: 'compiler',
    description:
      'A class that will be serialized structurally (declared properties only) because no custom serializer is registered — the data survives, but the decoded value is a plain object, not a class instance. Register one with registerClassSerializer to round-trip real instances',
  },
  {
    name: 'other',
    default: 'error',
    gate: 'compiler',
    description:
      'Any other RunTypes compiler diagnostic (reached only when a locally built binary runs ahead of the message catalog)',
  },
  {
    name: 'no-enrichment-todo',
    default: 'error',
    gate: 'enrichment',
    description:
      'An unfilled @todo placeholder the generator scaffolded in a FriendlyText / MockData file — fill in the value, then delete the tag line',
  },
  {
    name: 'no-orphan-carcass',
    default: 'error',
    gate: 'enrichment',
    description:
      'A commented-out @rtOrphan / @rtOrphanChild block the generator left behind when a type or field disappeared — restore the type, or run `ts-runtypes gen --prune` to remove it',
  },
  {
    name: 'enrichment-field',
    default: 'error',
    gate: 'enrichment',
    description:
      'A FriendlyText / MockData entry that no longer matches its type: a field the type does not declare, a name colliding with the reserved rt$ prefix, or a plural template missing its mandatory other arm',
  },
  {
    name: 'enrichment-message',
    default: 'warn',
    gate: 'enrichment',
    description:
      'A friendly error message template with a problem: an error key that is not a declared constraint of the field, an unknown $[placeholder], or a plural arm that is not a valid category',
  },
  {
    name: 'enrichment-broken-source',
    default: 'error',
    gate: 'enrichment',
    description:
      'A generated mirror whose source is gone — the file it mirrors no longer exists, or no longer declares the imported type. Re-run the generator, or delete the mirror',
  },
  {
    name: 'enrichment-misplaced-file',
    default: 'warn',
    gate: 'enrichment',
    description:
      'A generated mirror that is no longer where the generator would write it, usually after its source file moved — re-run the generator to relocate it',
  },
];

export const ALL_RULE_NAMES: readonly RuleName[] = RULE_SPECS.map((spec) => spec.name);

// FamilyRules names the rule for each severity tier a family produces.
// `primary` is the rule for its error-severity codes (and the sole rule for a
// family that only warns); `warn` is the separate rule a family that spans both
// tiers routes its Warning-severity codes to. Severity, not the code, picks the
// tier.
interface FamilyRules {
  primary: RuleName;
  warn?: RuleName;
}

// PREFIX_TO_FAMILY maps a compiler code's letter prefix to its family rules.
// Product-family granularity: the four JSON primitives + the composite
// (PJ/PJS/RJ/SJ/JCP) share the json rules, the two binary halves (TB/FB) share
// binary, validate absorbs validationErrors (VL/VE), and the marker-scanner
// prefixes (MKR/CTA/PFN/TMP) share the marker rules. Enrichment codes (FT/MD/GE)
// route by concern instead (see enrichFamily), so they are absent here.
const PREFIX_TO_FAMILY: Record<string, FamilyRules> = {
  CFG: {primary: 'broken-tsconfig'},
  MKR: {primary: 'invalid-marker', warn: 'redundant-marker'},
  CTA: {primary: 'invalid-marker'},
  PFN: {primary: 'invalid-marker'},
  TMP: {primary: 'invalid-marker'},
  PFE: {primary: 'pure-functions'},
  VL: {primary: 'validate-non-serializable', warn: 'validate-skipped-member'},
  VE: {primary: 'validate-non-serializable', warn: 'validate-skipped-member'},
  PJ: {primary: 'json-non-serializable', warn: 'json-skipped-member'},
  PJS: {primary: 'json-non-serializable', warn: 'json-skipped-member'},
  RJ: {primary: 'json-non-serializable', warn: 'json-skipped-member'},
  SJ: {primary: 'json-non-serializable', warn: 'json-skipped-member'},
  JCP: {primary: 'json-non-serializable'},
  TB: {primary: 'binary-non-serializable', warn: 'binary-skipped-member'},
  FB: {primary: 'binary-non-serializable', warn: 'binary-skipped-member'},
  CES: {primary: 'clone-unsupported-type', warn: 'clone-shared-reference'},
  HUK: {primary: 'unknown-keys'},
  UKE: {primary: 'unknown-keys'},
  UKU: {primary: 'unknown-keys'},
  UKW: {primary: 'unknown-keys'},
  FMT: {primary: 'format'},
  OVR: {primary: 'invalid-override', warn: 'override-side-effect'},
  NE: {primary: 'non-enumerable'},
  CLS: {primary: 'class-serializer'},
};

// codePrefix is the leading uppercase letters of a code (VL011 → VL, PFE9012 → PFE).
function codePrefix(code: string): string {
  const match = code.match(/^[A-Z]+/);
  return match ? match[0] : code;
}

// enrichFamily buckets an enrichment code into its concern family. The
// per-family hygiene codes (FT02x in a FriendlyText mirror, MD02x in a MockData
// mirror) express the same concerns, so both families share them. An unknown
// enrich code is treated as a field/content finding rather than dropped.
function enrichFamily(code: string): FamilyRules {
  switch (code) {
    case 'FT020':
    case 'MD020':
    case 'FT023':
    case 'MD023':
      // Unfilled scaffolds: a @todo marker (FT020/MD020) or a blank value
      // (FT023/MD023) — both mean "not finished yet", so both ride the todo rule.
      return {primary: 'no-enrichment-todo'};
    case 'FT021':
    case 'FT022':
    case 'MD021':
    case 'MD022':
      return {primary: 'no-orphan-carcass'};
    case 'GE000':
    case 'GE001':
    case 'GE002':
    case 'GE003':
      return {primary: 'enrichment-broken-source', warn: 'enrichment-misplaced-file'};
    default:
      return {primary: 'enrichment-field', warn: 'enrichment-message'};
  }
}

// fallbackFamily routes a code whose prefix isn't mapped (a locally built
// binary running ahead of the catalog) by its coarse wire family, so a
// diagnostic is never silently dropped.
function fallbackFamily(family: Family): FamilyRules {
  switch (family) {
    case Family.Marker:
      return {primary: 'invalid-marker', warn: 'redundant-marker'};
    case Family.PureFn:
      return {primary: 'pure-functions'};
    case Family.Enrich:
      return {primary: 'enrichment-field', warn: 'enrichment-message'};
    default:
      return {primary: 'other'};
  }
}

// LintLoc is the report location: 1-based line, 0-based column (the
// ESLint/OXlint `loc` convention — our wire sites are 1-based columns).
export interface LintLoc {
  start: {line: number; column: number};
  end?: {line: number; column: number};
}

// LintReport is one routed diagnostic, ready for `context.report`.
export interface LintReport {
  ruleName: RuleName;
  message: string;
  loc: LintLoc;
}

// routeDiagnostic maps one wire diagnostic to its rule + rendered message +
// location. Never returns null — an unknown code still reports (through its
// family rule and severity tier) with the fallback message, so a diagnostic is
// never silently dropped.
export function routeDiagnostic(diagnostic: Diagnostic): LintReport {
  return {
    ruleName: ruleNameFor(diagnostic),
    message: renderMessage(diagnostic),
    loc: lintLoc(diagnostic.site),
  };
}

// ruleNameFor picks the rule a diagnostic reports under: enrichment codes route
// by concern, every other code by its prefix family, and both then pick the
// error or warn rule by the diagnostic's severity.
function ruleNameFor(diagnostic: Diagnostic): RuleName {
  const family =
    diagnostic.family === Family.Enrich
      ? enrichFamily(diagnostic.code)
      : (PREFIX_TO_FAMILY[codePrefix(diagnostic.code)] ?? fallbackFamily(diagnostic.family));
  return diagnostic.severity === Severity.Warning && family.warn ? family.warn : family.primary;
}

// renderMessage resolves code+args through the catalog, prefixes the stable
// code (so users can look it up / disable-comment it), and appends related
// locations inline — lint reports have no first-class related-location field.
//
// Unknown-code fallback: a code the catalog lacks should be unreachable in a
// released install (binary + catalog publish from this one package), but a
// locally-built bin/ts-runtypes can run ahead of the catalog during
// development. Render a useful line instead of dropping the diagnostic.
export function renderMessage(diagnostic: Diagnostic): string {
  const known = diagnostic.code in DIAGNOSTIC_CATALOG;
  const headline = known
    ? renderHeadline(diagnostic.code, diagnostic.args)
    : '(message unavailable — regenerate the catalog via `pnpm run gen:diag-catalog`)';
  let message = `[${diagnostic.code}] ${headline}`;
  for (const related of diagnostic.related ?? []) {
    message += `\n  related: ${related.filePath}(${related.startLine},${related.startCol}): ${related.message}`;
  }
  return message;
}

// lintLoc converts a 1-based wire site to the lint loc shape (0-based
// columns). Sites missing an end keep a start-only loc; a degenerate site
// (unanchored) clamps to 1:0 so the report still lands in the file.
function lintLoc(site: DiagnosticSite): LintLoc {
  const loc: LintLoc = {
    start: {line: Math.max(1, site.startLine), column: Math.max(0, site.startCol - 1)},
  };
  if (site.endLine && site.endCol && (site.endLine > site.startLine || site.endCol > site.startCol)) {
    loc.end = {line: site.endLine, column: Math.max(0, site.endCol - 1)};
  }
  return loc;
}
