// The lint plugin served from the package's `./eslint` subpath. ONE module works as both an OXlint JS plugin
// (`jsPlugins` in .oxlintrc.json, the primary target) and an ESLint v9 flat-config plugin, every rule using
// plain `create` and no oxlint-only lifecycle. The Go resolver is the single diagnostics engine and these rules
// are pure transport: each linted file takes ONE resolver pass, which diagnosticRouting.ts fans out to the rules
// of the RULE_SPECS table. Severity is the linter's job, each rule shipping with the Go catalog default. No
// RunTypes-specific configuration is needed: the plugin resolves the resolver binary itself (@mionjs/bin-compiler,
// which honours MION_BIN) and runs in process.cwd(). The optional knobs are
// `settings.runtypes.{timeoutMs, tsconfig, binary, markers}`, anything else is ignored with a one-per-run
// warning, and rules take no per-rule options.

import {createRequire} from 'node:module';
import {routeDiagnostic, RULE_SPECS, type RuleName, type RuleSpec} from './diagnosticRouting.ts';
import {looksLikeEnrichmentFile, needsResolverPass} from './prefilter.ts';
import {LINT_SETTING_KEYS} from './session-protocol.ts';
import {prewarmSession, sharedSession, type LintSessionOptions} from './session.ts';
// mion's own rules ride the same RULE_SPECS table, separated only by `namespace`, and keep their `@mionjs/`
// prefix: the two families answer to different hosts (oxlint loads the default export for `runtypes/*`, ESLint
// reads configs.recommended for both), so merging the MODULE must not merge the NAMESPACES. enforce-type-imports
// is the one hand-written rule: bundle hygiene over import statements that never needed the checker.
import enforceTypeImports from './rules/enforce-type-imports.ts';

// Hold the plugin load until the session's launcher child exists: a host that embeds the Rust linter in-process
// (oxlint) reserves tens of GB of address space once linting starts, after which the resolver child can no
// longer be forked on Linux. MION_LINT_PRESPAWN=0 opts out.
await prewarmSession();

// The subset of the rule context OXlint and ESLint both provide, typed locally so the plugin depends on
// neither host's types.
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

// engineErrorClaims: an engine failure must report ONCE per file, not once per enabled rule, so the first rule
// to lint a file claims its engine-error reporting for the process lifetime.
const engineErrorClaims = new Map<string, RuleName>();

// warnedKeys keeps an unsupported setting to ONE report per run rather than one per linted file. A config
// mistake is not about anyone's code, so it goes to stderr instead of becoming a report on an arbitrary file.
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

// sessionOptions pulls the plugin's knobs from `settings.runtypes`. LINT_SETTING_KEYS (session-protocol.ts)
// names the whole contract. The working directory is deliberately NOT configurable, so a `cwd` or `socket` here
// is ignored loudly: a silently dropped key reads as working configuration (it once left the e2e fixture
// believing it had redirected the binary). Exported for the transparency regression test.
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

// diagnosticRule builds one transport rule: gate on the text pre-filter, run (or replay) the file's single
// resolver pass, report the diagnostics routed to THIS rule.
function diagnosticRule(
  ruleName: RuleName,
  description: string,
  gate: (text: string, options: LintSessionOptions) => boolean
): RuleModule {
  return {
    meta: {type: 'problem', docs: {description}},
    create(context: RuleContext) {
      const text = context.sourceCode.text;
      // Settings are read BEFORE the gate: the marker pre-filter matches import specifiers, so it needs the
      // project's configured marker packages or it skips files whose markers come from elsewhere.
      const options = sessionOptions(context.settings);
      if (!gate(text, options)) return {};
      const file = context.physicalFilename ?? context.filename ?? '';
      // Skip unnamed/virtual buffers: the resolver needs a real path to relativize and to read imports from disk.
      if (!file || file.startsWith('<')) return {};
      const session = sharedSession();
      if (!engineErrorClaims.has(file)) engineErrorClaims.set(file, ruleName);
      return {
        Program: () => {
          const outcome = session.lintFileSync(file, text, options);
          if ('engineError' in outcome) {
            // Never silently dropped: the rule that claimed the file reports it at the top of the file.
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

// Both plugins are built from the single RULE_SPECS table, partitioned by namespace, so adding a rule or
// changing its default is a one-line edit there. compiler rules scan any file with marker / RT / router calls,
// enrichment rules only generated mirror files.
function buildRules(namespace: RuleSpec['namespace']): Record<string, RuleModule> {
  return Object.fromEntries(
    RULE_SPECS.filter((spec) => spec.namespace === namespace).map((spec) => [
      spec.name,
      diagnosticRule(
        spec.name,
        spec.description,
        spec.gate === 'enrichment'
          ? (text: string) => looksLikeEnrichmentFile(text)
          : (text: string, options: LintSessionOptions) => needsResolverPass(text, options.markers)
      ),
    ])
  );
}

export const rules = buildRules('runtypes') as Record<RuleName, RuleModule>;

// `recommended` is filled in below, after the plugin object it references; its .oxlintrc.json twin lives in
// the website documentation.
const plugin = {meta, rules, configs: {} as Record<string, unknown>};

// mion's rule set, its own plugin object so it stays addressable under the `@mionjs/` prefix. No purity rule of
// its own: `runtypes/pure-functions` routes the real purity diagnostics, so a mion copy would double-report.
export const mionPlugin = {
  meta: {name: '@mionjs', version: packageVersion},
  rules: {
    ...buildRules('@mionjs'),
    // Out of `recommended`: it does nothing without a `backendSources` option naming the paths to keep out of
    // the front-end bundle, so a project opts in and configures it together.
    'enforce-type-imports': enforceTypeImports as unknown as RuleModule,
  } as Record<string, RuleModule>,
};

// recommended registers BOTH namespaces. oxlint never reads it (its .oxlintrc.json lists rules itself and takes
// only `meta` + `rules` off the default export), so this is ESLint's entry point, where the two families meet.
plugin.configs['recommended'] = {
  plugins: {runtypes: plugin, '@mionjs': mionPlugin},
  rules: Object.fromEntries(RULE_SPECS.map((spec) => [`${spec.namespace}/${spec.name}`, spec.default])),
};

export const configs = plugin.configs;

export default plugin;
