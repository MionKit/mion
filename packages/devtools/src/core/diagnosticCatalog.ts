// Renders a diagnostic code + args into the user-facing text the bundler plugin and the lint plugin print.
//
// The wire carries code + args only, so the templates reach JS through the GENERATED
// ./go-generated/diagnosticCatalog.generated.ts and messages can be arbitrarily rich for free.
// Wording changes go in the code's row in pkg/diagnostics/codes_*.go, never here; regenerate with
// `pnpm miondevx core codegen diag`.

import {DIAGNOSTIC_CATALOG, type DiagnosticEntry} from './go-generated/diagnosticCatalog.generated.ts';
import type {CatalogRecord} from './protocol.ts';

export {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';
export type {DiagnosticEntry} from './go-generated/diagnosticCatalog.generated.ts';

// Entries the running binary advertised (its capabilities op): an extension binary's own codes. A registered
// entry wins over the generated one for the same code, so the binary that raises a code owns its text.
const registered = new Map<string, DiagnosticEntry>();

/** Adds the catalog entries a binary advertised; a later registration of a code replaces the earlier one. */
export function registerCatalogEntries(records: readonly CatalogRecord[]): void {
  for (const record of records) {
    registered.set(record.code, {
      headline: record.headline,
      ...(record.slots?.length ? {slots: record.slots} : {}),
      level: record.level as DiagnosticEntry['level'],
      family: record.family as DiagnosticEntry['family'],
      ...(record.completeness ? {completeness: true} : {}),
    });
  }
}

/** The catalog entry for a code: a registered one first, then the generated one. Every catalog read goes here. */
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
