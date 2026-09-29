// Prints mion diagnostics and stops the build through whichever context a bundler gives: rollup and vite throw
// from `error`, webpack's loader context emits without throwing, unplugin's buildStart on webpack, rspack,
// esbuild and bun has neither.

import path from 'node:path';
import type {UnpluginContext, UnpluginMessage} from 'unplugin';
import {renderHeadline} from './diagnosticCatalog.ts';
import {DOWNGRADED_NOTE, isDowngraded, NONE, type DowngradeSet} from './downgradeErrors.ts';
import {isShown} from './levels.ts';
import {Severity, type Diagnostic} from './protocol.ts';

export type HostContext = Partial<UnpluginContext>;

// vite and rollup read `id` and `loc` to show the file and position in the terminal and the browser overlay.
export type HaltError = Error & Pick<UnpluginMessage, 'id' | 'loc'>;

const PREFIX = '[@mionjs/devtools]';

export function hostWarn(ctx: HostContext | undefined, message: string): void {
  if (typeof ctx?.warn === 'function') ctx.warn(message);
  else console.warn(`${PREFIX} ${message}`);
}

// `error` throws on rollup and vite; without it we throw, so a missing method never lets a failing build pass.
export function hostHalt(ctx: HostContext | undefined, error: HaltError): void {
  if (typeof ctx?.error === 'function') {
    ctx.error(error);
    return;
  }
  throw error;
}

// `loc` only for a finding in activeFile: vite maps a transform error's loc through that file's source map.
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

interface SurfaceOptions {
  // A downgraded finding never halts, whatever this returns.
  halts: (diagnostic: Diagnostic) => boolean;
  downgrade?: DowngradeSet;
  showInfo?: boolean;
  // The file a transform hook is on; a halt's position is attached only when it belongs there.
  activeFile?: string;
  // Base for a relative site or activeFile: the plugin's working directory.
  cwd?: string;
}

// Halts ONCE after printing everything, so the log holds the whole list with the failure below it.
// Applying `downgrade` in this one loop is what makes every halt site follow it.
export function surfaceDiagnostics(ctx: HostContext | undefined, diagnostics: Diagnostic[], options: SurfaceOptions): void {
  let first: Diagnostic | undefined;
  let count = 0;
  for (const diagnostic of diagnostics) {
    if (!isShown(diagnostic, options.showInfo ?? false)) continue;
    // NONE, not a skip: a `@mion-downgrade-error` comment lowers its finding even with no set configured.
    const downgraded = isDowngraded(options.downgrade ?? NONE, diagnostic);
    hostWarn(ctx, downgraded ? formatDowngraded(diagnostic) : formatTscDiagnostic(diagnostic));
    if (downgraded || !options.halts(diagnostic)) continue;
    count += 1;
    first ??= diagnostic;
  }
  if (first) hostHalt(ctx, haltError(first, count, options.activeFile, options.cwd));
}

// The one place that sets the `warning` label and the downgraded note together.
export function formatDowngraded(diagnostic: Diagnostic): string {
  return formatTscDiagnostic({...diagnostic, severity: Severity.Warning}, true);
}

// Same line format `mion compile` prints; the wire carries only code + args, so the headline comes from the catalog.
export function formatTscDiagnostic(diagnostic: Diagnostic, downgraded = false): string {
  const {site, code} = diagnostic;
  const headline = renderHeadline(code, diagnostic.args);
  // Without the note a downgraded finding reads like one that was always a warning.
  const suffix = downgraded ? ` ${DOWNGRADED_NOTE}` : '';
  let line = `${site.filePath}(${site.startLine},${site.startCol}): ${severityLabel(diagnostic.severity)} ${code}: ${headline}${suffix}`;
  for (const related of diagnostic.related ?? []) {
    line += `\n  Related: ${related.filePath}(${related.startLine},${related.startCol}): ${related.message}`;
  }
  return line;
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case Severity.Error:
      return 'error';
    case Severity.Warning:
      return 'warning';
    default:
      return 'info';
  }
}
