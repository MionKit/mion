// ONE module is both an OXlint JS plugin (the primary target) and an ESLint v9 flat-config plugin, so every rule
// uses plain `create` and no oxlint-only lifecycle. The three `mion/<level>` rules are pure transport over ONE
// resolver pass per file, split by level in diagnosticRouting.ts; rules take no options.

import {createRequire} from 'node:module';
import {isDowngraded, NONE, resolveDowngradeErrors, type DowngradeSet} from '../core/downgradeErrors.ts';
import {anchoredIn, routeDiagnostic, RULE_SPECS, type RuleName} from './diagnosticRouting.ts';
import {needsResolverPass} from './prefilter.ts';
import {LINT_SETTING_KEYS} from './session-protocol.ts';
import {prewarmSession, sharedSession, type LintSessionOptions} from './session.ts';
// The one hand-written rule: bundle hygiene over import statements, which never needed the checker.
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

// A config mistake warns once per run on stderr, not as a report on an arbitrary linted file.
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

// A bad tsconfig `downgradeErrors` value only warns here; the build fails on it.
function lintDowngrade(value: string[] | undefined): DowngradeSet {
  try {
    return resolveDowngradeErrors(value);
  } catch (error) {
    warnOnce(error instanceof Error ? error.message : String(error));
    return NONE;
  }
}

// The working directory is NOT configurable; a `cwd` or `socket` key warns: a silently dropped key reads as working.
// Exported for the transparency regression test.
export function sessionOptions(settings: Record<string, unknown> | undefined): LintSessionOptions {
  let raw = settings?.['mion'];
  // The old key still works for one release, with a warning.
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

// The shared session memoizes the file's resolver pass, so the three level rules cost one.
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
            if (!anchoredIn(diagnostic, file)) continue;
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
  // Not in `recommended`: it does nothing until a `backendSources` option names the paths to keep out of the bundle.
  'enforce-type-imports': enforceTypeImports as unknown as RuleModule,
};

// oxlint reads its own preset, oxlint-recommended.json, and takes only `meta` + `rules` off this export.
const plugin = {meta, rules, configs: {} as Record<string, unknown>};

plugin.configs['recommended'] = {
  plugins: {mion: plugin},
  rules: Object.fromEntries(RULE_SPECS.map((spec) => [`mion/${spec.name}`, spec.default])),
};

export const configs = plugin.configs;

export default plugin;
