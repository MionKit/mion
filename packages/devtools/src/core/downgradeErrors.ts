// `downgradeErrors` reports a named RuntimeError code as a Warning: it DOWNGRADES, never hides (`@mion-expect-error`
// removes one outright). A fatal Error never qualifies, it produced no output. Wire severity is untouched, so the
// downgrade applies where the halt is decided: here for the bundler plugin, in `mion compile` for its exit code.
// Go twin: ts-go-runtypes/pkg/diagnostics/downgrade.go.
import {catalogEntry} from './diagnosticCatalog.ts';
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

// A typo throws rather than protecting nothing; a Warning code is a no-op, so a softened level never breaks a build.
// `deferUnknown`: the factory runs before the binary advertises its codes; buildStart resolves in full before output.
export function resolveDowngradeErrors(
  value: string[] | typeof DOWNGRADE_ALL | undefined,
  {deferUnknown = false}: {deferUnknown?: boolean} = {}
): DowngradeSet {
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
    const entry = catalogEntry(code);
    if (!entry && deferUnknown) {
      codes.add(code);
      continue;
    }
    if (!entry) {
      throw new Error(
        `[@mionjs/devtools] downgradeErrors names unknown diagnostic ${JSON.stringify(code)} — copy its name from the message you are silencing (e.g. validate-symbol-root)`
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
