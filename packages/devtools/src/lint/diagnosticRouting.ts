// Transport-agnostic mapping from the resolver's wire diagnostics to lint reports: the RULE each belongs to,
// the rendered message, and the 0-based-column loc lint APIs expect. The OXlint/ESLint plugin entry (index.ts)
// is one sink over this module; another transport reuses it unchanged.

import path from 'node:path';
import {DIAGNOSTIC_CATALOG, renderHeadline} from '../core/diagnosticCatalog.ts';
import {DOWNGRADED_NOTE} from '../core/downgradeErrors.ts';
import {Level, type Diagnostic, type DiagnosticSite} from '../core/protocol.ts';

// One rule per LEVEL, never per topic: a lint rule has one severity, so a rule per topic let the lint config
// disagree with the level the checker gave a finding (a `warn` rule for a code that stops the build). The code
// (`[VL011]`) rides in the message, and a finding is changed with the directive comments or the tsconfig
// `downgradeErrors`, which the build reads too.
export type RuleName = 'error' | 'warning' | 'info';

// RuleSpec is the single source of truth for a rule; index.ts builds its `rules` record and `recommended`
// config from this table, so nothing hand-lists the rules twice.
export interface RuleSpec {
  readonly name: RuleName;
  readonly default: 'error' | 'warn' | 'off';
  readonly description: string;
}

export const RULE_SPECS: readonly RuleSpec[] = [
  {
    name: 'error',
    default: 'error',
    description:
      'Every mion Error and RuntimeError: the build produced no code for the call, or the code it produced throws or no longer checks what you asked for. The build stops on each of them. Also reports a tsconfig that does not load and a checker that cannot run',
  },
  {
    name: 'warning',
    default: 'warn',
    description:
      'Every mion Warning (the code works, but may surprise you), plus every error a `@mion-downgrade-error` comment or the tsconfig `downgradeErrors` lowered, marked `(downgraded)`',
  },
  {
    name: 'info',
    default: 'off',
    description:
      'Every mion Info message: documented behaviour or advice, such as a member left out of a validator because it holds no data. Off by default, like in the build',
  },
];

export const ALL_RULE_NAMES: readonly RuleName[] = RULE_SPECS.map((spec) => spec.name);

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

// anchoredIn reports whether a diagnostic's site is the linted file: a report carries no file, so a finding
// anchored in another one would land at this file's positions. A relative site resolves against process.cwd().
export function anchoredIn(diagnostic: Diagnostic, file: string): boolean {
  return Boolean(diagnostic.site.filePath) && path.resolve(diagnostic.site.filePath) === path.resolve(file);
}

// routeDiagnostic maps one wire diagnostic to its rule, message and location. Never returns null: an unknown
// code still reports at its wire level with the fallback message, so nothing is silently dropped.
export function routeDiagnostic(diagnostic: Diagnostic): LintReport {
  return {
    ruleName: ruleNameFor(diagnostic),
    message: renderMessage(diagnostic),
    loc: lintLoc(diagnostic.site),
  };
}

// ruleNameFor picks the rule from the level alone; a lowered error is a warning, as the build prints it.
function ruleNameFor(diagnostic: Diagnostic): RuleName {
  if (diagnostic.downgraded) return 'warning';
  switch (diagnostic.level) {
    case Level.Warning:
      return 'warning';
    case Level.Info:
      return 'info';
    default:
      return 'error';
  }
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
  if (diagnostic.downgraded) message += ` ${DOWNGRADED_NOTE}`;
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
