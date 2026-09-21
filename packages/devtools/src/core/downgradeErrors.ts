// The `downgradeErrors` rule: report a named RuntimeError code as a Warning, so one known finding
// stops halting a build while every other one still does. It DOWNGRADES, never hides: the finding is
// still printed on every build (`@mion-expect-error` removes one outright, site-local and
// self-cleaning, so it is the better tool when the call site is your own source). Only a RuntimeError
// qualifies: a fatal Error produced no output to carry on with. Severity on the wire is untouched, so
// the downgrade is applied where the halt decision is made, here for the bundler plugin and in
// `mion compile` for its exit code, leaving lint rule routing alone.
// Go twin: ts-go-runtypes/internal/diagnostics/downgrade.go.
import {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';
import {Level, type Diagnostic} from './protocol.ts';

// Kept for adoption: a project turning mion on cannot yet list the codes it has not met.
export const DOWNGRADE_ALL = '*';

// DOWNGRADED_NOTE marks a lowered finding so it never reads as a warning that was always a warning.
// Twin of diagnostics.DowngradedNote on the Go side, which `mion compile` prints.
export const DOWNGRADED_NOTE = '(downgraded)';

// DowngradeSet is a resolved `downgradeErrors` value; `all` is the wildcard.
export interface DowngradeSet {
  readonly all: boolean;
  readonly codes: ReadonlySet<string>;
}

// NONE is the strict default: nothing is downgraded.
export const NONE: DowngradeSet = {all: false, codes: new Set()};

// resolveDowngradeErrors resolves the configured value once at plugin-factory time, so a typo fails
// loudly at the host boundary rather than silently protecting nothing. A Warning code is accepted and
// does nothing: a code's level may soften between releases and that must never break a build.
export function resolveDowngradeErrors(value: string[] | typeof DOWNGRADE_ALL | undefined): DowngradeSet {
  if (value === undefined) return NONE;
  if (value === DOWNGRADE_ALL) return {all: true, codes: new Set()};
  if (!Array.isArray(value) || value.some((code) => typeof code !== 'string')) {
    throw new Error(
      `[@mionjs/devtools] invalid downgradeErrors ${JSON.stringify(value)} — expected an array of diagnostic codes or '${DOWNGRADE_ALL}'`
    );
  }
  if (value.includes(DOWNGRADE_ALL)) return {all: true, codes: new Set()};
  const codes = new Set<string>();
  for (const code of value) {
    const entry = DIAGNOSTIC_CATALOG[code];
    if (!entry) {
      throw new Error(
        `[@mionjs/devtools] downgradeErrors names unknown diagnostic code ${JSON.stringify(code)} — copy it from the message you are silencing (the uppercase id, e.g. VL002)`
      );
    }
    if (entry.level === 'error') {
      throw new Error(
        `[@mionjs/devtools] downgradeErrors cannot downgrade ${code} — the build produces no code for it, so carrying on would ship missing output`
      );
    }
    codes.add(code);
  }
  return {all: false, codes};
}

// isDowngraded: two ways in, this build's `downgradeErrors` setting or the `@mion-downgrade-error`
// comment the resolver already stamped on the finding. The level comes off the WIRE, the same field
// the Go twin reads; the catalog lookup above is for configured code STRINGS, which carry no level.
export function isDowngraded(set: DowngradeSet, diagnostic: Diagnostic): boolean {
  if (diagnostic.level !== Level.RuntimeError) return false;
  return diagnostic.downgraded === true || set.all || set.codes.has(diagnostic.code);
}
