// How the build plugin prints mion diagnostics and stops a build. Every bundler hands the plugin a different
// context: rollup and vite throw from `error` and log from `warn`, webpack's loader context emits without
// throwing, and unplugin's buildStart context for webpack, rspack, esbuild and bun has neither.

import {renderHeadline} from './diagnosticCatalog.ts';
import {DOWNGRADED_NOTE, isDowngraded, NONE, type DowngradeSet} from './downgradeErrors.ts';
import {isShown} from './levels.ts';
import {Severity, type Diagnostic} from './protocol.ts';

// HostContext is the part of a bundler's plugin context the plugin prints through; either method may be missing.
export interface HostContext {
  warn?: (message: string) => void;
  error?: (error: Error) => unknown;
}

const PREFIX = '[@mionjs/devtools]';

// hostWarn prints through the bundler, or to stderr when its context has no `warn`.
export function hostWarn(ctx: HostContext | undefined, message: string): void {
  if (typeof ctx?.warn === 'function') ctx.warn(message);
  else console.warn(`${PREFIX} ${message}`);
}

// hostHalt stops the build: through the bundler's `error`, which throws on rollup and vite, or by throwing
// itself when the context has none, so a missing method can never let a failing build pass.
export function hostHalt(ctx: HostContext | undefined, error: Error): void {
  if (typeof ctx?.error === 'function') {
    ctx.error(error);
    return;
  }
  throw error;
}

// Routes diagnostics by SEVERITY, so a fatal Error and a RuntimeError both count towards the halt and the LEVEL
// decides only whether `downgrade` can spare one. Every error prints, then the halt fires ONCE below the list.
// `halt: false` is the HMR mode: a bad type mid-edit shouldn't kill the dev server.
export function surfaceDiagnostics(
  ctx: HostContext | undefined,
  diagnostics: Diagnostic[],
  filter: (d: Diagnostic) => boolean,
  options: {halt: boolean; downgrade?: DowngradeSet; showInfo?: boolean}
): void {
  let errorCount = 0;
  for (const diagnostic of diagnostics) {
    if (!filter(diagnostic) || !isShown(diagnostic, options.showInfo ?? false)) continue;
    // NONE, not a skip, when no set is configured: a `@mion-downgrade-error` comment lowers its finding
    // whatever the build was configured with.
    const downgraded = isDowngraded(options.downgrade ?? NONE, diagnostic);
    hostWarn(ctx, downgraded ? formatDowngraded(diagnostic) : formatTscDiagnostic(diagnostic));
    if (diagnostic.severity === Severity.Error && !downgraded) errorCount += 1;
  }
  if (options.halt && errorCount > 0) {
    const noun = errorCount === 1 ? 'unsupported-type error' : 'unsupported-type errors';
    hostHalt(ctx, new Error(`@mionjs/devtools: ${errorCount} ${noun} — build halted. See warnings above for the call sites.`));
  }
}

// The `warning` label and the "configured down" note always travel together, so they are set in one place
// rather than at each call site.
export function formatDowngraded(d: Diagnostic): string {
  return formatTscDiagnostic({...d, severity: Severity.Warning}, true);
}

// The build's line format, the one `mion compile` prints too:
//   /abs/path(line,col): error PFE9004: headline text
//     Related: /abs/path(line,col): related message
// The wire carries only the code + positional args, so the headline comes from the generated catalog.
export function formatTscDiagnostic(d: Diagnostic, downgraded = false): string {
  const label = severityLabel(d.severity);
  const headline = renderHeadline(d.code, d.args);
  // The note goes after the headline; without it a configured-down finding reads like one that was always a warning.
  const suffix = downgraded ? ` ${DOWNGRADED_NOTE}` : '';
  let line = `${d.site.filePath}(${d.site.startLine},${d.site.startCol}): ${label} ${d.code}: ${headline}${suffix}`;
  if (d.related && d.related.length > 0) {
    for (const r of d.related) {
      line += `\n  Related: ${r.filePath}(${r.startLine},${r.startCol}): ${r.message}`;
    }
  }
  return line;
}

function severityLabel(s: Severity): string {
  switch (s) {
    case Severity.Error:
      return 'error';
    case Severity.Warning:
      return 'warning';
    default:
      return 'info';
  }
}
