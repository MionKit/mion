// Diagnostic rendering: code + args → final user-facing text.
//
// The Go binary ships only the diagnostic Code (and optional positional
// Args) over the wire; the message templates live in the GENERATED
// dictionary (./diagnosticCatalog.generated.ts, emitted by
// `pnpm run gen:diag-catalog` from the authoritative Go catalog in
// internal/diagnostics/messages.go). This module owns the render step shared by
// the Vite plugin's diagnostics (`this.warn`/`this.error`), the lint
// plugin, and the runtime alwaysThrow factory: resolve `{0}`, `{1}`, …
// placeholders in the headline/detail templates against the args array.
// The wire stays small; messages can be arbitrarily rich (multi-line,
// code examples) for free.
//
// Wording changes go in internal/diagnostics/messages.go, never here — regenerate
// with `pnpm run gen:diag-catalog`.

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

/**
 * Render the multi-line detail block for a diagnostic code+args pair, or
 * undefined when the entry has no detail. Vite's verbose log mode and
 * IDE hover surfaces this; the single-line tsc output uses only the
 * headline.
 */
export function renderDetail(code: string, args?: readonly string[]): string | undefined {
  const entry = DIAGNOSTIC_CATALOG[code];
  if (!entry || !entry.detail) return undefined;
  return substitute(entry.detail, args);
}

/**
 * Build a throwing-factory for an alwaysThrow cache entry. The Go-side
 * compiler ships the diag code (e.g. 'PJ001') as the 8th arg of init()
 * and an optional `file:line:col` provenance hint as the 9th arg; the
 * cache module forwards both here. The factory throws
 * `[code] headline (at file:line:col)` on invocation. Centralised so
 * the catalog lives in one place.
 *
 * The remaining args after siteHint are positional substitution values
 * for the catalog template — passed by the Go renderer in the same
 * `args` slot as build-time diagnostics. Today the renderer ships them
 * as part of the init() 10th+ args; a follow-up wires that explicitly.
 */
export function alwaysThrowFactory(code: string, siteHint?: string, ...args: string[]): () => never {
  const headline = renderHeadline(code, args);
  const base = `[${code}] ${headline}`;
  const message = siteHint ? `${base} (at ${siteHint})` : base;
  return () => {
    throw new Error(message);
  };
}

/**
 * Legacy alias for compatibility with the older `diagnosticMessages.ts`
 * import surface. Returns the headline only.
 *
 * @deprecated Prefer renderHeadline (or renderDetail for the full block).
 */
export function messageForCode(code: string, args?: readonly string[]): string {
  return renderHeadline(code, args);
}
