// Renders a diagnostic code + args into the user-facing text the bundler plugin and the lint plugin print.
//
// The wire carries code + args only, so the templates reach JS through the GENERATED
// ./go-generated/diagnosticCatalog.generated.ts and messages can be arbitrarily rich for free.
// Wording changes go in internal/diagnostics/messages.go, never here; regenerate with
// `pnpm miondevx core codegen diag`.

import {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';

export {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';
export type {DiagnosticEntry} from './go-generated/diagnosticCatalog.generated.ts';

/** Resolve `{0}`, `{1}`, … placeholders against the args array. */
function substitute(template: string, args: readonly string[] | undefined): string {
  if (!args || args.length === 0) return template;
  return template.replace(/\{(\d+)\}/g, (_match, idx) => {
    const i = Number(idx);
    return i < args.length ? args[i] : '';
  });
}

/**
 * Render the single-line headline for a diagnostic code+args pair.
 * Used by the Vite plugin's formatTscDiagnostic to fill the tsc problem-
 * matcher line. Returns a generic fallback when the code is unknown so
 * out-of-band codes (e.g. a newer binary's code with a stale generated
 * dictionary) still produce a useful line.
 */
export function renderHeadline(code: string, args?: readonly string[]): string {
  const entry = DIAGNOSTIC_CATALOG[code];
  if (!entry) return `Unrecognised diagnostic code (${code}) — please file an issue.`;
  return substitute(entry.headline, args);
}
