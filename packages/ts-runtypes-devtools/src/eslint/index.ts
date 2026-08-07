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
// ONE documented exception to the router doctrine: the `gate: 'local'` lane
// (today only `json-schema-dropped-intent`, droppedIntent.ts). The resolver
// never sees a JSON Schema document — the door is type-level only — so a
// spec-legal annotation whose intent the pipeline cannot honor has no wire
// diagnostic to route, and the TYPE level has only errors. A local rule walks
// the `runTypeFromJsonSchema({…})` literal in the linted file itself (both
// hosts hand rules the same ESTree AST) and warns without any resolver pass.
// The lane exists for schema-literal hygiene ONLY; engine facts stay Go-side.
//
// The plugin needs no RunTypes-specific configuration: it resolves the host
// resolver binary itself (@ts-runtypes/bin, which honours RT_BIN) and runs in
// process.cwd(), like any other linter. The optional knobs are
// `settings.runtypes.{timeoutMs, tsconfig, binary}`; anything else there is
// ignored with a one-per-run warning. Rules take no per-rule options.

import {createRequire} from 'node:module';
import {routeDiagnostic, RULE_SPECS, type RuleName} from './diagnosticRouting.ts';
import {droppedIntentFindings, type AstNode} from './droppedIntent.ts';
import {looksLikeEnrichmentFile, needsResolverPass} from './prefilter.ts';
import {LINT_SETTING_KEYS} from './session-protocol.ts';
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

// warnedKeys remembers what has already been complained about, so an unsupported
// setting is reported ONCE for the run rather than once per linted file. A config
// mistake is not a finding about anyone's code, so it goes to stderr instead of
// becoming a lint report on an arbitrary file.
const warnedKeys = new Set<string>();

function warnUnknownSettings(bag: Record<string, unknown>): void {
  for (const key of Object.keys(bag)) {
    if ((LINT_SETTING_KEYS as string[]).includes(key) || warnedKeys.has(key)) continue;
    warnedKeys.add(key);
    console.warn(
      `[runtypes] ignoring unknown lint setting 'settings.runtypes.${key}' (supported: ${LINT_SETTING_KEYS.join(', ')})`
    );
  }
}

// sessionOptions pulls the plugin's knobs from `settings.runtypes`: the per-file
// timeout (`timeoutMs`), the project `tsconfig` the resolver reads for its
// resolution options, and the `binary` to run (like the bundler plugins). Those
// three ARE the contract — LINT_SETTING_KEYS (session-protocol.ts) names them,
// kept exhaustive against LintSessionOptions. The working directory is
// deliberately NOT configurable: the plugin runs in process.cwd(), like any other
// linter, so a `cwd` or `socket` here is ignored — loudly, once per run, because a
// silently dropped key reads as working configuration (it once left the e2e
// fixture believing it had redirected the binary). Exported for the transparency
// regression test.
export function sessionOptions(settings: Record<string, unknown> | undefined): LintSessionOptions {
  const raw = settings?.['runtypes'];
  if (!raw || typeof raw !== 'object') return {};
  const bag = raw as Record<string, unknown>;
  warnUnknownSettings(bag);
  const options: LintSessionOptions = {};
  if (typeof bag['timeoutMs'] === 'number') options.timeoutMs = bag['timeoutMs'];
  if (typeof bag['tsconfig'] === 'string') options.tsconfig = bag['tsconfig'];
  if (typeof bag['binary'] === 'string') options.binary = bag['binary'];
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

// localAstRule builds the one non-router lane (see the header exception): a
// plain node-visitor rule over the host-provided ESTree AST, gated on the
// same cheap text pre-filter discipline as the transport rules — a file that
// never names runTypeFromJsonSchema pays nothing, not even a visitor.
function localAstRule(description: string): RuleModule {
  return {
    meta: {type: 'problem', docs: {description}},
    create(context: RuleContext) {
      if (!context.sourceCode.text.includes('runTypeFromJsonSchema')) return {};
      return {
        CallExpression: (node: AstNode) => {
          for (const finding of droppedIntentFindings(node)) context.report(finding);
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
    spec.gate === 'local'
      ? localAstRule(spec.description)
      : diagnosticRule(spec.name, spec.description, spec.gate === 'enrichment' ? looksLikeEnrichmentFile : needsResolverPass),
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
