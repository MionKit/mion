// @ts-runtypes/devtools/eslint — the RunTypes lint plugin, served from the
// package's `./eslint` subpath. One module works as BOTH an OXlint JS plugin
// (`jsPlugins` in .oxlintrc.json — the primary target; diagnostics reach the
// editor live through the oxc language server) and an ESLint v9 flat-config
// plugin (every rule uses plain `create`, no oxlint-only lifecycle).
//
// The Go resolver is the single diagnostics engine — these rules are pure
// transport. Each linted file takes ONE resolver pass (marker scan +
// enrichment health, see Request.checkEnrich); the routing layer
// (diagnosticRouting.ts) then fans the wire diagnostics out to rules grouped
// by DIAGNOSTIC FAMILY and NAMED for what they catch, not for severity:
// `runtypes/validate-non-serializable` + `runtypes/validate-skipped-member`,
// `runtypes/json-non-serializable` + `runtypes/json-skipped-member`, … plus the
// enrichment concern rules. Severity is the linter's job: each rule ships with
// the Go catalog default, and the host's per-rule level is what applies. The
// full set is the RULE_SPECS table.
//
// The plugin needs no RunTypes-specific configuration: it resolves the host
// resolver binary itself (@ts-runtypes/bin) and runs in process.cwd(), like
// any other linter. The one optional knob is `settings.runtypes.timeoutMs`
// (the per-file wait budget); rules take no per-rule options.

import {createRequire} from 'node:module';
import {routeDiagnostic, RULE_SPECS, type RuleName} from './diagnosticRouting.ts';
import {looksLikeEnrichmentFile, needsResolverPass} from './prefilter.ts';
import {prewarmSession, sharedSession, type LintSessionOptions} from './session.ts';

// Start the session's worker NOW, at plugin load, and hold the load until
// its launcher child exists: hosts that embed the Rust linter in-process
// (oxlint) reserve tens of GB of address space once linting starts, after
// which the resolver child could no longer be forked on Linux — the launcher
// must exist strictly before that. RT_LINT_PRESPAWN=0 opts out.
await prewarmSession();

// Minimal structural view of the rule context — the subset OXlint and ESLint
// both provide. Typed locally so the plugin depends on neither host's types.
interface RuleContext {
  physicalFilename?: string;
  filename?: string;
  sourceCode: {text: string};
  settings?: Record<string, unknown>;
  report(descriptor: {message: string; loc: {start: {line: number; column: number}; end?: {line: number; column: number}}}): void;
}

interface RuleModule {
  meta: {type: 'problem'; docs: {description: string}};
  create(context: RuleContext): Record<string, unknown>;
}

// engineErrorClaims: an engine failure (missing binary, timeout) must surface
// exactly ONCE per file, not once per enabled rule — the first rule to lint a
// file claims its engine-error reporting for the process lifetime.
const engineErrorClaims = new Map<string, RuleName>();

// sessionOptions pulls the plugin's knobs from `settings.runtypes`: the per-file
// timeout (`timeoutMs`) and the project `tsconfig` the resolver reads for its
// resolution options (like the bundler plugins). Those two ARE the contract —
// LINT_SETTING_KEYS (session-protocol.ts) names them, kept exhaustive against
// LintSessionOptions. The resolver binary and working directory are deliberately
// NOT configurable: the plugin resolves the host binary itself (@ts-runtypes/bin,
// whose RT_BIN env var is the supported override) and runs in process.cwd(), like
// any other linter, so a `binary`, `cwd`, or `socket` under `settings.runtypes` is
// ignored. Exported for the transparency regression test.
export function sessionOptions(settings: Record<string, unknown> | undefined): LintSessionOptions {
  const raw = settings?.['runtypes'];
  if (!raw || typeof raw !== 'object') return {};
  const bag = raw as Record<string, unknown>;
  const options: LintSessionOptions = {};
  if (typeof bag['timeoutMs'] === 'number') options.timeoutMs = bag['timeoutMs'];
  if (typeof bag['tsconfig'] === 'string') options.tsconfig = bag['tsconfig'];
  return options;
}

// diagnosticRule builds one transport rule: gate on the cheap text
// pre-filter, run (or replay) the file's single resolver pass, report the
// diagnostics routed to THIS rule.
function diagnosticRule(ruleName: RuleName, description: string, gate: (text: string) => boolean): RuleModule {
  return {
    meta: {type: 'problem', docs: {description}},
    create(context: RuleContext) {
      const text = context.sourceCode.text;
      if (!gate(text)) return {};
      const file = context.physicalFilename ?? context.filename ?? '';
      // Skip unnamed/virtual buffers — the resolver needs a real path to
      // relativize and to resolve the file's imports from disk.
      if (!file || file.startsWith('<')) return {};
      const session = sharedSession();
      const options = sessionOptions(context.settings);
      if (!engineErrorClaims.has(file)) engineErrorClaims.set(file, ruleName);
      return {
        Program: () => {
          const outcome = session.lintFileSync(file, text, options);
          if ('engineError' in outcome) {
            // Never silently drop: whichever rule claimed the file reports
            // the engine failure at the top of the file.
            if (engineErrorClaims.get(file) === ruleName) {
              context.report({message: `[runtypes] ${outcome.engineError}`, loc: {start: {line: 1, column: 0}}});
            }
            return;
          }
          for (const diagnostic of outcome.diagnostics) {
            const report = routeDiagnostic(diagnostic);
            if (report.ruleName !== ruleName) continue;
            context.report({message: report.message, loc: report.loc});
          }
        },
      };
    },
  };
}

const packageVersion = (createRequire(import.meta.url)('../../package.json') as {version: string}).version;

export const meta = {name: 'runtypes', version: packageVersion};

// rules and recommended are both built from the single RULE_SPECS table, so
// adding a family rule (or changing its default) is a one-line edit there —
// nothing is hand-listed twice. The gate is the file pre-filter: compiler
// rules scan any file with marker / RT calls, enrichment rules only generated
// mirror files.
export const rules: Record<RuleName, RuleModule> = Object.fromEntries(
  RULE_SPECS.map((spec) => [
    spec.name,
    diagnosticRule(spec.name, spec.description, spec.gate === 'enrichment' ? looksLikeEnrichmentFile : needsResolverPass),
  ])
) as Record<RuleName, RuleModule>;

// recommended: every rule at its family default (the Go catalog severity of
// the codes it carries). Declared after the plugin object so the flat config
// can reference it. The .oxlintrc.json twin lives in the website documentation.
const plugin = {meta, rules, configs: {} as Record<string, unknown>};

plugin.configs['recommended'] = {
  plugins: {runtypes: plugin},
  rules: Object.fromEntries(RULE_SPECS.map((spec) => [`runtypes/${spec.name}`, spec.default])),
};

export const configs = plugin.configs;

export default plugin;
