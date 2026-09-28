// The lint plugin served from the package's `./eslint` subpath. ONE module works as both an OXlint JS plugin
// (`jsPlugins` in .oxlintrc.json, the primary target) and an ESLint v9 flat-config plugin, every rule using
// plain `create` and no oxlint-only lifecycle. The Go resolver is the single diagnostics engine and the three
// `mion/<level>` rules are pure transport: each linted file takes ONE resolver pass, which diagnosticRouting.ts
// splits by level. The plugin resolves the resolver binary itself (@mionjs/bin-compiler, which honours MION_BIN)
// and runs in process.cwd(). The optional knobs are `settings.mion.{timeoutMs, tsconfig, binary, markers}`,
// anything else is ignored with a one-per-run warning, and rules take no options.

import {createRequire} from 'node:module';
import {isDowngraded, NONE, resolveDowngradeErrors, type DowngradeSet} from '../core/downgradeErrors.ts';
import {routeDiagnostic, RULE_SPECS, type RuleName} from './diagnosticRouting.ts';
import {needsResolverPass} from './prefilter.ts';
import {LINT_SETTING_KEYS} from './session-protocol.ts';
import {prewarmSession, sharedSession, type LintSessionOptions} from './session.ts';
// The one hand-written rule, and the one a project configures like any lint rule: bundle hygiene over import
// statements that never needed the checker.
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

// warnedKeys keeps a config mistake to ONE report per run rather than one per linted file. It is not about
// anyone's code, so it goes to stderr instead of becoming a report on an arbitrary file.
const warnedKeys = new Set<string>();

function warnOnce(message: string): void {
  if (warnedKeys.has(message)) return;
  warnedKeys.add(message);
  console.warn(message);
}

function warnUnknownSettings(bag: Record<string, unknown>): void {
  for (const key of Object.keys(bag)) {
    if ((LINT_SETTING_KEYS as string[]).includes(key)) continue;
    const hint = key === 'levels' ? ", turn on the 'mion/info' rule to show Info" : '';
    warnOnce(`[mion] ignoring unknown lint setting 'settings.mion.${key}' (supported: ${LINT_SETTING_KEYS.join(', ')})${hint}`);
  }
}

// lintDowngrade resolves the tsconfig `downgradeErrors` echo; a bad value warns once, since the build fails on it.
function lintDowngrade(value: string[] | undefined): DowngradeSet {
  try {
    return resolveDowngradeErrors(value);
  } catch (error) {
    warnOnce(error instanceof Error ? error.message : String(error));
    return NONE;
  }
}

// sessionOptions pulls the plugin's knobs from `settings.mion`. LINT_SETTING_KEYS (session-protocol.ts) names the
// whole contract. The working directory is deliberately NOT configurable, so a `cwd` or `socket` here is ignored
// loudly: a silently dropped key reads as working configuration. Exported for the transparency regression test.
export function sessionOptions(settings: Record<string, unknown> | undefined): LintSessionOptions {
  let raw = settings?.['mion'];
  // The old key still works for one release, with a warning, so a config naming the tsconfig keeps resolving.
  if (raw === undefined && settings?.['runtypes'] !== undefined) {
    warnOnce("[mion] 'settings.runtypes' is now 'settings.mion'; rename it");
    raw = settings['runtypes'];
  }
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

// diagnosticRule builds one level rule: gate on the text pre-filter, run (or replay) the file's single resolver
// pass, report the diagnostics routed to THIS rule. The shared session memoizes the pass, so three rules cost one.
function diagnosticRule(ruleName: RuleName, description: string): RuleModule {
  return {
    meta: {type: 'problem', docs: {description}},
    create(context: RuleContext) {
      const text = context.sourceCode.text;
      // The pre-filter follows imports: it needs the marker settings and the file path.
      const options = sessionOptions(context.settings);
      const file = context.physicalFilename ?? context.filename ?? '';
      // Skip unnamed/virtual buffers: the resolver needs a real path to relativize and to read imports from disk.
      if (!file || file.startsWith('<')) return {};
      if (!needsResolverPass(text, file, options.markers)) return {};
      const session = sharedSession();
      return {
        Program: () => {
          const outcome = session.lintFileSync(file, text, options);
          if ('engineError' in outcome) {
            // Never silently dropped, and reported once: by the error rule, at the top of the file.
            if (ruleName === 'error')
              context.report({message: `[mion] ${outcome.engineError}`, loc: {start: {line: 1, column: 0}}});
            return;
          }
          const downgrade = lintDowngrade(outcome.downgradeErrors);
          for (const diagnostic of outcome.diagnostics) {
            const report = routeDiagnostic(isDowngraded(downgrade, diagnostic) ? {...diagnostic, downgraded: true} : diagnostic);
            if (report.ruleName !== ruleName) continue;
            context.report({message: report.message, loc: report.loc});
          }
        },
      };
    },
  };
}

const packageVersion = (createRequire(import.meta.url)('../../package.json') as {version: string}).version;

export const meta = {name: 'mion', version: packageVersion};

export const rules: Record<string, RuleModule> = {
  ...Object.fromEntries(RULE_SPECS.map((spec) => [spec.name, diagnosticRule(spec.name, spec.description)])),
  // Out of `recommended`: it does nothing without a `backendSources` option naming the paths to keep out of the
  // front-end bundle, so a project opts in and configures it together.
  'enforce-type-imports': enforceTypeImports as unknown as RuleModule,
};

// `recommended` is filled in below, after the plugin object it references; oxlint reads its own preset,
// oxlint-recommended.json, and takes only `meta` + `rules` off this export.
const plugin = {meta, rules, configs: {} as Record<string, unknown>};

plugin.configs['recommended'] = {
  plugins: {mion: plugin},
  rules: Object.fromEntries(RULE_SPECS.map((spec) => [`mion/${spec.name}`, spec.default])),
};

export const configs = plugin.configs;

export default plugin;
