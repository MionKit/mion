// The `downgradeErrors` rule: report a named Error code as a Warning instead,
// so one known finding stops halting a build while every other Error still
// does.
//
// It DOWNGRADES, it never hides. The finding is still printed on every build,
// which is the difference between "unblock me" and "make this problem
// invisible". Compare the `@mion-expect-error` comment, which removes a finding
// outright but is site-local and self-cleaning, so it is the better tool
// whenever the call site is in your own source.
//
// Severity on the wire stays whatever the catalog says: it is informational,
// and what acts on it is the consumer. So the downgrade is applied where the
// halt decision is made — here for the bundler plugin, and in `mion compile`
// for its exit code — and lint rule routing is left alone by a build setting.
// The Go twin is ts-go-runtypes/internal/diagnostics/downgrade.go.
import {DIAGNOSTIC_CATALOG} from './go-generated/diagnosticCatalog.generated.ts';
import {Family, Severity, type Diagnostic} from './protocol.ts';

// DOWNGRADE_ALL is the wildcard shape: every Error code reports as a Warning.
// The blunt instrument, kept for adoption, where a project turning mion on
// cannot yet list the codes it has not met.
export const DOWNGRADE_ALL = '*';

// DOWNGRADED_NOTE marks a finding a `downgradeErrors` setting lowered, so it
// never reads as a warning that was always a warning. Twin of
// diagnostics.DowngradedNote on the Go side, which `mion compile` prints.
export const DOWNGRADED_NOTE = '(downgraded)';

// DowngradeSet is a resolved `downgradeErrors` value. `all` is the wildcard;
// otherwise only the listed codes are downgraded.
export interface DowngradeSet {
  readonly all: boolean;
  readonly codes: ReadonlySet<string>;
}

// NONE is the strict default: nothing is downgraded.
export const NONE: DowngradeSet = {all: false, codes: new Set()};

// resolveDowngradeErrors validates a configured value and resolves it into a
// set, once at plugin-factory time so a config typo fails loudly at the host
// boundary rather than silently protecting nothing.
//
// An unknown code throws (a typo would otherwise read as a working downgrade).
// A pure-fn code throws: those halt regardless, because a failed extraction
// means the build would ship missing output. A Warning or Info code is accepted
// and simply does nothing — a code's severity may soften between releases and
// that must never break a consumer's build.
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
    if (entry.family === 'purefn') {
      throw new Error(
        `[@mionjs/devtools] downgradeErrors cannot downgrade ${code} — a pure-function error means generation failed, so the build would ship missing output`
      );
    }
    codes.add(code);
  }
  return {all: false, codes};
}

// isDowngraded reports whether this diagnostic should be treated as a Warning.
// Only Error severity is ever downgraded, and never the pure-fn family.
//
// The family comes off the WIRE, the same field the Go twin reads. The catalog
// lookup above is for configured code STRINGS, which have no diagnostic to read
// a family from; using it here would also mean an unrecognised code slipped
// through the guard.
export function isDowngraded(set: DowngradeSet, diagnostic: Diagnostic): boolean {
  if (diagnostic.severity !== Severity.Error || diagnostic.family === Family.PureFn) return false;
  return set.all || set.codes.has(diagnostic.code);
}
