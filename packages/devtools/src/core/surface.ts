// How the build plugin prints mion diagnostics and stops a build. Every bundler hands the plugin a different
// context: rollup and vite throw from `error` and log from `warn`, webpack's loader context emits without
// throwing, and unplugin's buildStart context for webpack, rspack, esbuild and bun has neither.

import path from 'node:path';
import {renderHeadline} from './diagnosticCatalog.ts';
import {DOWNGRADED_NOTE, isDowngraded, NONE, type DowngradeSet} from './downgradeErrors.ts';
import {isShown} from './levels.ts';
import {Severity, type Diagnostic} from './protocol.ts';

// HostContext is the part of a bundler's plugin context the plugin prints through; either method may be missing.
export interface HostContext {
  warn?: (message: string) => void;
  error?: (error: string | HaltError) => unknown;
}

// HaltError is the Error a halt hands the bundler: vite and rollup read `id` and `loc` to show the file and
// position in the terminal and the browser overlay, and a host that only stringifies it still gets the message.
export interface HaltError extends Error {
  id?: string;
  loc?: {file: string; line: number; column: number};
}

const PREFIX = '[@mionjs/devtools]';

// hostWarn prints through the bundler, or to stderr when its context has no `warn`.
export function hostWarn(ctx: HostContext | undefined, message: string): void {
  if (typeof ctx?.warn === 'function') ctx.warn(message);
  else console.warn(`${PREFIX} ${message}`);
}

// hostHalt stops the build: through the bundler's `error`, which throws on rollup and vite, or by throwing
// itself when the context has none, so a missing method can never let a failing build pass.
export function hostHalt(ctx: HostContext | undefined, error: HaltError): void {
  if (typeof ctx?.error === 'function') {
    ctx.error(error);
    return;
  }
  throw error;
}

// haltError names the first error's code and place, so the terminal line and the overlay are actionable.
// `loc` is set only when the finding sits in activeFile (or no file is being transformed): vite maps a transform
// error's loc through that file's source map, which would move a position that belongs to another file.
export function haltError(first: Diagnostic, count: number, activeFile?: string, cwd = process.cwd()): HaltError {
  const noun = count === 1 ? 'error' : 'errors';
  const message = `@mionjs/devtools: build stopped on ${count} mion ${noun}. First: ${formatTscDiagnostic(first)}`;
  const error: HaltError = new Error(message);
  const file = first.site.filePath;
  if (!file) return error;
  const id = path.resolve(cwd, file);
  error.id = id;
  const sameFile = activeFile === undefined || path.resolve(cwd, activeFile) === id;
  if (sameFile && first.site.startLine > 0) {
    error.loc = {file: id, line: first.site.startLine, column: Math.max(0, first.site.startCol - 1)};
  }
  return error;
}

export interface SurfaceOptions {
  // Which findings stop the build; a lowered one never does.
  halts: (diagnostic: Diagnostic) => boolean;
  downgrade?: DowngradeSet;
  showInfo?: boolean;
  // The file a transform hook is working on, so a halt's position is only attached when it belongs there.
  activeFile?: string;
  // What a relative site or activeFile resolves against: the plugin's working directory.
  cwd?: string;
}

// surfaceDiagnostics prints every shown finding, then stops the build ONCE when any of them halts, so the log
// holds the whole list with the failure below it. A lowered finding prints as a warning with a `(downgraded)`
// note and never counts: applying `downgrade` in this one loop is what makes every halt site follow it.
export function surfaceDiagnostics(ctx: HostContext | undefined, diagnostics: Diagnostic[], options: SurfaceOptions): void {
  let first: Diagnostic | undefined;
  let count = 0;
  for (const diagnostic of diagnostics) {
    if (!isShown(diagnostic, options.showInfo ?? false)) continue;
    // NONE, not a skip, when no set is configured: a `@mion-downgrade-error` comment lowers its finding
    // whatever the build was configured with.
    const downgraded = isDowngraded(options.downgrade ?? NONE, diagnostic);
    hostWarn(ctx, downgraded ? formatDowngraded(diagnostic) : formatTscDiagnostic(diagnostic));
    if (downgraded || !options.halts(diagnostic)) continue;
    count += 1;
    first ??= diagnostic;
  }
  if (first) hostHalt(ctx, haltError(first, count, options.activeFile, options.cwd));
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
