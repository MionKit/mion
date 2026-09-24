// Transport-agnostic mapping from the resolver's wire diagnostics to lint reports: the RULE each belongs to,
// the rendered message, and the 0-based-column loc lint APIs expect. The OXlint/ESLint plugin entry (index.ts)
// is one sink over this module; another transport reuses it unchanged.

import {DIAGNOSTIC_CATALOG, renderHeadline} from '../core/diagnosticCatalog.ts';
import {Family, Severity, type Diagnostic, type DiagnosticSite} from '../core/protocol.ts';

// Rules are grouped by the DIAGNOSTIC FAMILY that produced them and NAMED for what they catch, not for their
// severity. A family's two tiers are two different errors (a root the feature cannot represent versus a member
// it silently skips), so each is its own rule and a team levels each on its own; severity picks the tier. The
// concrete code (`[VL011]`) always rides in the message, so per-code disable comments and lookups keep working.
// `validate` covers both `createValidateFn` and `createGetValidationErrorsFn` (VL + VE).
export type RuleName =
  | 'broken-tsconfig'
  | 'invalid-expect-error'
  | 'invalid-downgrade-error'
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
  | 'unsafe-property-name'
  | 'other'
  | 'no-enrichment-todo'
  | 'no-orphan-carcass'
  | 'enrichment-field'
  | 'enrichment-message'
  | 'enrichment-broken-source'
  | 'enrichment-misplaced-file'
  // The mion route rules, compiler-fed like every rule above but keeping the names they had as hand-written
  // `@mionjs/*` ESLint rules, so an existing config keeps working.
  | 'strong-typed-routes'
  | 'no-throw-in-handlers'
  | 'returned-error-type'
  | 'no-unsafe-property-names';

// RuleSpec is the single source of truth for a rule. `gate` picks the text pre-filter that admits a file to the
// resolver pass: `compiler` any marker / RT / router file, `enrichment` only generated mirror files. index.ts
// builds its `rules` record and `recommended` config from this table, so nothing hand-lists the rules twice.
export interface RuleSpec {
  readonly name: RuleName;
  // `runtypes` rides the default export OXlint loads, `@mionjs` the named mionPlugin export; index.ts
  // partitions this ONE table on the field so neither plugin hand-lists its rules.
  readonly namespace: 'runtypes' | '@mionjs';
  // Never `warn` while the rule carries a code the Go catalog does not call a Warning: under-reporting a fatal
  // or runtime error is the one wrong direction. The reverse is the rule author's call, and is how something
  // can be worth an editor squiggle without stopping a build (`enrichment-field`).
  readonly default: 'error' | 'warn';
  readonly gate: 'compiler' | 'enrichment';
  readonly description: string;
}

export const RULE_SPECS: readonly RuleSpec[] = [
  {
    name: 'broken-tsconfig',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'The project tsconfig the linter was pointed at (the tsconfig setting, or the default tsconfig.json) is missing or does not parse, so type-aware linting cannot run. The linter reads the same config as your build; fix the config or the configured path',
  },
  {
    name: 'invalid-expect-error',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A `@mion-expect-error` comment that is wrong, at either scope (the line form, or the block comment at the top of a file that covers the whole file): it silenced nothing (so it is stale and should be deleted, the same check TypeScript runs on an unused `@ts-expect-error`), it names a code that is always reported, or it names a code that does not exist',
  },
  {
    name: 'invalid-downgrade-error',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A `@mion-downgrade-error` comment that is wrong, at either scope (the line form, or the block comment at the top of a file that covers the whole file): it lowered nothing (so it is stale and should be deleted), it names a code that always stops the build, it names a code that does not exist, or it names one that is already a warning and was never halting anything',
  },
  {
    name: 'invalid-marker',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'A marker call the build cannot turn into a function: a generic type argument never filled in with a concrete type, an options argument that is not a plain literal the build can read, an import that failed to resolve, or a Temporal type without the Temporal lib enabled',
  },
  {
    name: 'redundant-marker',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A marker that works but probably does not do what you meant: a function called inside a marker just to read its return type (the call itself is wasted), a ValidateOptions flag that has no effect on this particular type, or a batch the server build leaves out (the table comes from the client project, or nothing imports it)',
  },
  {
    name: 'pure-functions',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'A registered pure function that breaks the purity rules (uses this, await, yield, dynamic import, blocked globals, or variables from outside its own body), is registered twice with different bodies, or is referenced by a generated function but never registered',
  },
  {
    name: 'validate-non-serializable',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'A type that can never be validated. Validators check serializable data only (the data-only projection of the type), so a type like symbol or WeakMap at a root position has nothing to check and the generated function will always fail',
  },
  {
    name: 'validate-skipped-member',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the validator silently skips: functions, methods, statics, and symbols are not data and never survive JSON, so the generated validator checks the rest of the object and ignores them',
  },
  {
    name: 'json-non-serializable',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'A type that can never be encoded to or decoded from JSON (a function, symbol, never, or a non-serializable built-in like WeakMap at a root position) — the generated function will always fail',
  },
  {
    name: 'json-skipped-member',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the JSON encoder and decoder silently leave out (a function, method, static, or symbol member) — the rest of the object round-trips normally',
  },
  {
    name: 'binary-non-serializable',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'A type that can never be serialised to or deserialised from binary (a function, symbol, never, or a non-serializable built-in like WeakMap at a root position) — the generated function will always fail',
  },
  {
    name: 'binary-skipped-member',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the binary encoder and decoder silently leave out (a function, method, static, or symbol member) — the rest of the object round-trips normally',
  },
  {
    name: 'clone-unsupported-type',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'A type removeUnknownKeys cannot clone safely: a union of objects (the clone cannot tell which shape to rebuild) or a callable root. A clone that guessed could keep unknown keys, so the build stops instead',
  },
  {
    name: 'clone-shared-reference',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the clone cannot rebuild (a function, symbol, or non-serializable built-in), so it stays pointing at the same value as the original — changes through it are visible on both copies',
  },
  {
    name: 'unknown-keys',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property the `strip` JSON decoder skips when it clears unknown keys, such as a function member; the rest of the object is still cleared',
  },
  {
    name: 'format',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'A custom string format with a broken definition: a mock sample that does not match its own pattern, a sample that violates a sibling constraint like maxLength, invalid format params (including a pattern that does not compile as a JS RegExp), a pattern that a crafted input can make backtrack exponentially, or pattern checks that could not run because no JS runtime was found',
  },
  {
    name: 'invalid-override',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'An override that cannot work: the same (type, function) pair registered twice, or an override redirect pointing at a generated module that does not exist',
  },
  {
    name: 'override-side-effect',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A validate override on a type whose JSON and binary union decoders also run validation internally — the override changes their behaviour too, which may be intended but is worth knowing',
  },
  {
    name: 'non-enumerable',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property marked @nonEnumerable that is not optional — a non-enumerable property can be absent from a plain object, so the type must allow undefined',
  },
  {
    name: 'unsafe-property-name',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property named __proto__. That name is never data: writing it on a plain object swaps the prototype instead of storing a value, so the member is dropped from every compiled function and the value never round-trips. TypeScript accepts the declaration, so nothing else tells you the key is missing at runtime',
  },
  {
    name: 'other',
    namespace: 'runtypes',
    default: 'error',
    gate: 'compiler',
    description:
      'Any other RunTypes compiler diagnostic (reached only when a locally built binary runs ahead of the message catalog)',
  },
  {
    name: 'no-enrichment-todo',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'enrichment',
    description:
      'An unfilled @todo placeholder the generator scaffolded in a FriendlyText / MockData file — fill in the value, then delete the tag line',
  },
  {
    name: 'no-orphan-carcass',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'enrichment',
    description:
      'A commented-out @rtOrphan / @rtOrphanChild block the generator left behind when a type or field disappeared — restore the type, or run `mion enrich --prune` to remove it',
  },
  {
    name: 'enrichment-field',
    namespace: 'runtypes',
    default: 'error',
    gate: 'enrichment',
    description:
      'A FriendlyText / MockData entry that no longer matches its type: a field the type does not declare, a name colliding with the reserved rt$ prefix, or a plural template missing its mandatory other arm',
  },
  {
    name: 'enrichment-message',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'enrichment',
    description:
      'A friendly error message template with a problem: an error key that is not a declared constraint of the field, an unknown $[placeholder], or a plural arm that is not a valid category',
  },
  {
    name: 'enrichment-broken-source',
    namespace: 'runtypes',
    default: 'error',
    gate: 'enrichment',
    description:
      'A generated mirror whose source is gone — the file it mirrors no longer exists, or no longer declares the imported type. Re-run the generator, or delete the mirror',
  },
  {
    name: 'enrichment-misplaced-file',
    namespace: 'runtypes',
    default: 'warn',
    gate: 'enrichment',
    description:
      'A generated mirror that is no longer where the generator would write it, usually after its source file moved — re-run the generator to relocate it',
  },
  // ── the mion route rules (@mionjs/*) ─────────────────────────────────────
  // Same table, same transport; only the namespace differs.
  {
    name: 'strong-typed-routes',
    namespace: '@mionjs',
    default: 'error',
    gate: 'compiler',
    description:
      'A mion route, query, mutation, middleware or headersFn handler that does not declare its types: a missing return type, or a parameter with no type annotation. mion compiles the declared types into the validation and serialization the route runs, and the client reads the same declaration, so an inferred one leaves the build nothing to compile against',
  },
  {
    name: 'no-throw-in-handlers',
    namespace: '@mionjs',
    default: 'error',
    gate: 'compiler',
    description:
      'A throw that escapes a mion handler. Handlers answer with errors instead, so the error stays in the signature and the client handles it at the call site, typed; a thrown one lands in the undeclared slot and the client only sees its public message. A throw caught inside the same handler is left alone',
  },
  {
    name: 'returned-error-type',
    namespace: '@mionjs',
    default: 'error',
    gate: 'compiler',
    description:
      'A mion handler whose declared return type can be an error that is not an RpcError. Only an RpcError, or a subclass such as FatalError, carries the mion brand the dispatcher routes on; any other error is dropped in the undeclared slot instead of its typed one, so the declared return type stops being true',
  },
  {
    name: 'no-unsafe-property-names',
    namespace: '@mionjs',
    default: 'warn',
    gate: 'compiler',
    description:
      'A property named __proto__ in any interface, type literal or class. That name is never data: writing it on a plain object swaps the prototype instead of storing a value, so every compiled function drops the member. TypeScript accepts the declaration, so nothing else tells you. This reports the declaration, so it fires for types no route reaches yet',
  },
];

export const ALL_RULE_NAMES: readonly RuleName[] = RULE_SPECS.map((spec) => spec.name);

// FamilyRules names the rule per severity tier: `primary` takes the error-severity codes (and every code of a
// family that only warns), `warn` the Warning-severity ones of a family spanning both tiers.
interface FamilyRules {
  primary: RuleName;
  warn?: RuleName;
}

// PREFIX_TO_FAMILY maps a compiler code's letter prefix to its family rules, at PRODUCT-family granularity: the
// JSON prefixes share the json rules, the two binary halves share binary, validate absorbs validationErrors, and
// the marker-scanner prefixes share the marker rules. Enrichment (FT/MD/GE) and mion route (MRT) codes route by
// concern instead (enrichFamily, mionRouteFamily), so they are absent here.
const PREFIX_TO_FAMILY: Record<string, FamilyRules> = {
  CFG: {primary: 'broken-tsconfig'},
  EXP: {primary: 'invalid-expect-error'},
  DWN: {primary: 'invalid-downgrade-error'},
  MKR: {primary: 'invalid-marker', warn: 'redundant-marker'},
  CTA: {primary: 'invalid-marker'},
  PFN: {primary: 'invalid-marker'},
  // Batch transport: a batch the build cannot read is an error like any other marker, while one that works but
  // does nothing for this server (BAT008) or a table nothing imports (BAT009) is the redundant-marker kind.
  BAT: {primary: 'invalid-marker', warn: 'redundant-marker'},
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
  RUK: {primary: 'clone-unsupported-type', warn: 'clone-shared-reference'},
  UKU: {primary: 'unknown-keys'},
  UKW: {primary: 'unknown-keys'},
  FMT: {primary: 'format'},
  OVR: {primary: 'invalid-override', warn: 'override-side-effect'},
  NE: {primary: 'non-enumerable'},
  UPN: {primary: 'unsafe-property-name'},
};

// codePrefix is the leading uppercase letters of a code (VL011 → VL, PFE9012 → PFE).
function codePrefix(code: string): string {
  const match = code.match(/^[A-Z]+/);
  return match ? match[0] : code;
}

// enrichFamily buckets an enrichment code into its concern family; FT02x and MD02x express the same concerns,
// so both families share them. An unknown enrich code is treated as a field error rather than dropped.
function enrichFamily(code: string): FamilyRules {
  switch (code) {
    // Field errors: the map names something the type does not declare, or collides with the reserved `rt$`
    // prefix. Listed per code because FT002 and MD001 are Warnings, so picking the tier by severity would
    // route them to the message rule.
    case 'FT002':
    case 'FT011':
    case 'MD001':
    case 'MD011':
      return {primary: 'enrichment-field'};
    // Message errors: the template is wrong, so what a user reads is wrong or falls back. Per code for the
    // same reason in reverse.
    case 'FT003':
    case 'FT005':
    case 'FT006':
    case 'FT007':
    case 'FT008':
    case 'FT009':
      return {primary: 'enrichment-message'};
    case 'FT020':
    case 'MD020':
    case 'FT023':
    case 'MD023':
      // A @todo marker and a blank value both mean "not finished yet", so both ride the todo rule.
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

// mionRouteFamily buckets a mion route code into its rule: one Go-catalog family, four separate errors a team
// levels on its own, so they route per code rather than through PREFIX_TO_FAMILY. An unknown MRT code rides
// strong-typed-routes rather than being dropped.
function mionRouteFamily(code: string): FamilyRules {
  switch (code) {
    case 'MRT003':
      return {primary: 'no-throw-in-handlers'};
    case 'MRT004':
      return {primary: 'returned-error-type'};
    case 'MRT005':
      return {primary: 'no-unsafe-property-names'};
    // MRT001 (missing return type) + MRT002 (missing parameter type).
    default:
      return {primary: 'strong-typed-routes'};
  }
}

// fallbackFamily routes a code whose prefix isn't mapped (a locally built binary running ahead of the catalog)
// by its coarse wire family, so a diagnostic is never silently dropped.
function fallbackFamily(family: Family): FamilyRules {
  switch (family) {
    case Family.Marker:
      return {primary: 'invalid-marker', warn: 'redundant-marker'};
    case Family.PureFn:
      return {primary: 'pure-functions'};
    case Family.Enrich:
      return {primary: 'enrichment-field', warn: 'enrichment-message'};
    case Family.MionRoute:
      return {primary: 'strong-typed-routes'};
    default:
      return {primary: 'other'};
  }
}

// LintLoc is the report location: 1-based line, 0-based column, the ESLint/OXlint convention; wire sites are
// 1-based on both.
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

// routeDiagnostic maps one wire diagnostic to its rule, message and location. Never returns null: an unknown
// code still reports through its family rule with the fallback message, so nothing is silently dropped.
export function routeDiagnostic(diagnostic: Diagnostic): LintReport {
  return {
    ruleName: ruleNameFor(diagnostic),
    message: renderMessage(diagnostic),
    loc: lintLoc(diagnostic.site),
  };
}

// ruleNameFor picks the rule a diagnostic reports under: enrichment and mion route codes route per code, every
// other by its prefix family, and all of them then pick the error or warn rule by severity.
function ruleNameFor(diagnostic: Diagnostic): RuleName {
  let family: FamilyRules;
  if (diagnostic.family === Family.Enrich) family = enrichFamily(diagnostic.code);
  else if (diagnostic.family === Family.MionRoute) family = mionRouteFamily(diagnostic.code);
  else family = PREFIX_TO_FAMILY[codePrefix(diagnostic.code)] ?? fallbackFamily(diagnostic.family);
  return diagnostic.severity === Severity.Warning && family.warn ? family.warn : family.primary;
}

// renderMessage prefixes the stable code (so users can look it up or disable-comment it) and appends related
// locations inline, lint reports having no related-location field. The unknown-code arm is unreachable in a
// released install (binary and catalog publish together) but a locally built mion-bin/mion can run ahead of it.
export function renderMessage(diagnostic: Diagnostic): string {
  const known = diagnostic.code in DIAGNOSTIC_CATALOG;
  const headline = known
    ? renderHeadline(diagnostic.code, diagnostic.args)
    : '(message unavailable — regenerate the catalog via `pnpm miondevx core codegen diag`)';
  let message = `[${diagnostic.code}] ${headline}`;
  for (const related of diagnostic.related ?? []) {
    message += `\n  related: ${related.filePath}(${related.startLine},${related.startCol}): ${related.message}`;
  }
  return message;
}

// lintLoc converts a 1-based wire site to 0-based columns. A site missing an end keeps a start-only loc; an
// unanchored one clamps to 1:0 so the report still lands in the file.
function lintLoc(site: DiagnosticSite): LintLoc {
  const loc: LintLoc = {
    start: {line: Math.max(1, site.startLine), column: Math.max(0, site.startCol - 1)},
  };
  if (site.endLine && site.endCol && (site.endLine > site.startLine || site.endCol > site.startCol)) {
    loc.end = {line: site.endLine, column: Math.max(0, site.endCol - 1)};
  }
  return loc;
}
