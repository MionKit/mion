// Renders a diagnostic code + args into the text the bundler and lint plugins print. The wire carries code + args
// only; the templates come from the GENERATED ./go-generated/diagnosticCatalog.generated.ts. Wording changes go in
// the code's row in pkg/diagnostics/codes_*.go, never here; regenerate with `pnpm miondevx core codegen diag`.

import {DIAGNOSTIC_CATALOG, type DiagnosticEntry} from './go-generated/diagnosticCatalog.generated.ts';
import type {CatalogRecord} from './protocol.ts';

export {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';
export type {DiagnosticEntry} from './go-generated/diagnosticCatalog.generated.ts';

// Advertised codes (capabilities op) beat the generated entry, so the binary that raises a code owns its text.
const registered = new Map<string, DiagnosticEntry>();

/** Adds the catalog entries a binary advertised. */
export function registerCatalogEntries(records: readonly CatalogRecord[]): void {
  for (const record of records) {
    registered.set(record.code, {
      headline: record.headline,
      ...(record.slots?.length ? {slots: record.slots} : {}),
      level: record.level as DiagnosticEntry['level'],
      family: record.family,
      ...(record.completeness ? {completeness: true} : {}),
    });
  }
}

/** Every catalog read goes through here. */
export function catalogEntry(code: string): DiagnosticEntry | undefined {
  return registered.get(code) ?? DIAGNOSTIC_CATALOG[code];
}

const SLOT = /\{([A-Za-z]\w*)\}/g;

/** Twin of fillSlots in pkg/diagnostics/catalog.go; a slot with no arg renders empty. */
export function fillSlots(template: string, slots: readonly string[] | undefined, args: readonly string[] | undefined): string {
  if (!args || args.length === 0) return template;
  return template.replace(SLOT, (_match, name: string) => {
    const index = slots?.indexOf(name) ?? -1;
    return index >= 0 && index < args.length ? args[index] : '';
  });
}

/** Renders the single-line headline; an unknown code falls back, so a newer binary's code still reads. */
export function renderHeadline(code: string, args?: readonly string[]): string {
  const entry = catalogEntry(code);
  if (!entry) return `Unrecognised diagnostic code (${code}) — please file an issue.`;
  return fillSlots(entry.headline, entry.slots, args);
}
