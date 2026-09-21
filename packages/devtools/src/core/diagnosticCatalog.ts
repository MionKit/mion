// Diagnostic rendering: code + args → final user-facing text.
//
// The Go binary ships only the diagnostic Code (and optional positional
// Args) over the wire; the message templates live in the GENERATED
// dictionary (./go-generated/diagnosticCatalog.generated.ts, emitted by
// `pnpm miondevx core codegen diag` from the authoritative Go catalog in
// internal/diagnostics/messages.go). This module owns the render step shared by
// the Vite plugin's diagnostics (`this.warn`/`this.error`) and the lint
// plugin: resolve `{0}`, `{1}`, … placeholders in the headline template
// against the args array. The wire stays small; messages can be
// arbitrarily rich (multi-line, code examples) for free.
//
// Wording changes go in internal/diagnostics/messages.go, never here — regenerate
// with `pnpm miondevx core codegen diag`.

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
