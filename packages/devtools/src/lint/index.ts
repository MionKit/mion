// @mionjs/devtools/eslint — the RunTypes lint plugin, served from the
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
// resolver binary itself (@ts-runtypes/bin, which honours MION_BIN) and runs in
// process.cwd(), like any other linter. The optional knobs are
// `settings.runtypes.{timeoutMs, tsconfig, binary}`; anything else there is
// ignored with a one-per-run warning. Rules take no per-rule options.

import {createRequire} from 'node:module';
import {routeDiagnostic, RULE_SPECS, type RuleName} from './diagnosticRouting.ts';
import {looksLikeEnrichmentFile, needsResolverPass} from './prefilter.ts';
import {LINT_SETTING_KEYS} from './session-protocol.ts';
import {prewarmSession, sharedSession, type LintSessionOptions} from './session.ts';
// mion's own rules, merged into this module when the two devtools packages became one.
// They keep their `@mionjs/` prefix: the two rule families answer to different hosts
// (oxlint loads the default export for `runtypes/*`, ESLint reads configs.recommended
// for both), so merging the MODULE must not merge the NAMESPACES.
import strongTypedRoutes from './rules/strong-typed-routes.ts';
import noUnreachableUnionTypes from './rules/no-unreachable-union-types.ts';
import noMixedUnionProperties from './rules/no-mixed-union-properties.ts';
import noViteClient from './rules/no-vite-client.ts';
import enforceTypeImports from './rules/enforce-type-imports.ts';

// Start the session's worker NOW, at plugin load, and hold the load until
// its launcher child exists: hosts that embed the Rust linter in-process
// (oxlint) reserve tens of GB of address space once linting starts, after
// which the resolver child could no longer be forked on Linux — the launcher
// must exist strictly before that. MION_LINT_PRESPAWN=0 opts out.
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
  if (bag['markers'] && typeof bag['markers'] === 'object') {
    options.markers = bag['markers'] as LintSessionOptions['markers'];
  }
  return options;
}

// diagnosticRule builds one transport rule: gate on the cheap text
// pre-filter, run (or replay) the file's single resolver pass, report the
// diagnostics routed to THIS rule.
function diagnosticRule(
  ruleName: RuleName,
  description: string,
  gate: (text: string, options: LintSessionOptions) => boolean
): RuleModule {
  return {
    meta: {type: 'problem', docs: {description}},
    create(context: RuleContext) {
      const text = context.sourceCode.text;
      // The settings are read BEFORE the gate: the marker pre-filter matches
      // import specifiers, so it needs the project's configured marker
      // packages to avoid skipping files whose markers are not mion'.
      const options = sessionOptions(context.settings);
      if (!gate(text, options)) return {};
      const file = context.physicalFilename ?? context.filename ?? '';
      // Skip unnamed/virtual buffers — the resolver needs a real path to
      // relativize and to resolve the file's imports from disk.
      if (!file || file.startsWith('<')) return {};
      const session = sharedSession();
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
    diagnosticRule(
      spec.name,
      spec.description,
      spec.gate === 'enrichment'
        ? (text: string) => looksLikeEnrichmentFile(text)
        : (text: string, options: LintSessionOptions) => needsResolverPass(text, options.markers)
    ),
  ])
) as Record<RuleName, RuleModule>;

// recommended: every rule at its family default (the Go catalog severity of
// the codes it carries). Declared after the plugin object so the flat config
// can reference it. The .oxlintrc.json twin lives in the website documentation.
const plugin = {meta, rules, configs: {} as Record<string, unknown>};

// mion's rule set, kept as its own plugin object so it stays addressable under the
// `@mionjs/` prefix. mion has no type-import rule and no purity rule of its own: the
// resolver injects at the call site so an erased import changes nothing (guarded by
// packages/router/src/typeOnlyImports.spec.ts), and `runtypes/pure-functions` above
// routes the real purity diagnostics, so a mion copy would double-report.
export const mionPlugin = {
  meta: {name: '@mionjs', version: packageVersion},
  rules: {
    'strong-typed-routes': strongTypedRoutes,
    'no-unreachable-union-types': noUnreachableUnionTypes,
    'no-mixed-union-properties': noMixedUnionProperties,
    'no-vite-client': noViteClient,
    'enforce-type-imports': enforceTypeImports,
  } as unknown as Record<string, RuleModule>,
};

// recommended registers BOTH namespaces. oxlint never reads it (its .oxlintrc.json
// lists rules itself and only takes `meta` + `rules` off the default export), so this
// is ESLint's entry point and the one place the two families come together.
plugin.configs['recommended'] = {
  plugins: {runtypes: plugin, '@mionjs': mionPlugin},
  rules: {
    ...Object.fromEntries(RULE_SPECS.map((spec) => [`runtypes/${spec.name}`, spec.default])),
    '@mionjs/strong-typed-routes': 'error',
    '@mionjs/no-unreachable-union-types': 'error',
    // disabled as seems is not too useful and overlaps with some ts rules
    // '@mionjs/no-mixed-union-properties': 'warn',
  },
};

export const configs = plugin.configs;

export default plugin;
