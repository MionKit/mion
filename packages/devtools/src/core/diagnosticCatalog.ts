// Renders a diagnostic code + args into the user-facing text the bundler plugin and the lint plugin print.
//
// The wire carries code + args only, so the templates reach JS through the GENERATED
// ./go-generated/diagnosticCatalog.generated.ts and messages can be arbitrarily rich for free.
// Wording changes go in internal/diagnostics/messages.go, never here; regenerate with
// `pnpm miondevx core codegen diag`.

import {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';

export {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';
export type {DiagnosticEntry} from './go-generated/diagnosticCatalog.generated.ts';

const SLOT = /\{([A-Za-z]\w*)\}/g;

/** Twin of fillSlots in internal/diagnostics/catalog.go; a slot with no arg renders empty. */
function fillSlots(template: string, slots: readonly string[] | undefined, args: readonly string[] | undefined): string {
  if (!args || args.length === 0) return template;
  return template.replace(SLOT, (_match, name: string) => {
    const index = slots?.indexOf(name) ?? -1;
    return index >= 0 && index < args.length ? args[index] : '';
  });
}

/** Renders the single-line headline; an unknown code falls back, so a newer binary's code still reads. */
export function renderHeadline(code: string, args?: readonly string[]): string {
  const entry = DIAGNOSTIC_CATALOG[code];
  if (!entry) return `Unrecognised diagnostic code (${code}) — please file an issue.`;
  return fillSlots(entry.headline, entry.slots, args);
}
