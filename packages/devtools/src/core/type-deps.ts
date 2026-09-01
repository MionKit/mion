// The type-dependency index: which site files reflect a type declared in which
// source file, and therefore which site files must be re-transformed when that
// source file changes.
//
// Every host funnels through the plugin's `transform` hook (the Next broker
// included — it calls the same hook over its socket), so recording there gives
// every bundler one index built the same way. See
// docs/todos/unified-type-dependency-invalidation.md.
//
// Paths are normalised to absolute, forward-slashed form so a lookup matches
// whichever shape the host hands us: the resolver reports absolute program
// paths, Vite reports absolute ids, and the plugin's own bookkeeping is
// cwd-relative.
import path from 'node:path';

export interface TypeDepsIndex {
  /** Records the files declaring the types `siteFile` reflects, replacing any previous record for it. */
  record(siteFile: string, deps: readonly string[] | undefined): void;
  /** Site files whose reflected types are declared in any of `changed`. */
  affectedSiteFiles(changed: readonly string[]): string[];
  /** Every site file the index has a record for, whatever its deps. */
  knownSiteFiles(): string[];
  /** Site files we transformed but got no deps for — the ones a coarse fallback still has to cover. */
  unknownSiteFiles(): string[];
  /** Drops a site file's record (it stopped carrying sites, or was deleted). */
  forget(siteFile: string): void;
  clear(): void;
}

/** Absolute + forward-slashed, so the same file compares equal across hosts. */
export function depKey(file: string, cwd: string): string {
  const abs = path.isAbsolute(file) ? file : path.resolve(cwd, file);
  return abs.split(path.sep).join('/');
}

export function createTypeDepsIndex(cwd: string): TypeDepsIndex {
  // siteFile -> the type files it depends on. Empty set = transformed, but the
  // resolver reported nothing (see `unknownSiteFiles`).
  const forward = new Map<string, Set<string>>();
  // typeFile -> the site files depending on it. Derived from `forward`; kept
  // alongside it so a change lookup is O(1) instead of a scan per edit.
  const reverse = new Map<string, Set<string>>();

  function unlink(siteKey: string): void {
    const previous = forward.get(siteKey);
    if (!previous) return;
    for (const dep of previous) {
      const dependents = reverse.get(dep);
      if (!dependents) continue;
      dependents.delete(siteKey);
      if (dependents.size === 0) reverse.delete(dep);
    }
  }

  return {
    record(siteFile, deps) {
      const siteKey = depKey(siteFile, cwd);
      // Re-recording REPLACES: a type the file no longer reflects must stop
      // invalidating it, or an edit to a since-removed dependency re-transforms
      // the file forever.
      unlink(siteKey);
      const next = new Set<string>();
      for (const dep of deps ?? []) next.add(depKey(dep, cwd));
      forward.set(siteKey, next);
      for (const dep of next) {
        let dependents = reverse.get(dep);
        if (!dependents) {
          dependents = new Set<string>();
          reverse.set(dep, dependents);
        }
        dependents.add(siteKey);
      }
    },

    affectedSiteFiles(changed) {
      const out = new Set<string>();
      for (const file of changed) {
        const dependents = reverse.get(depKey(file, cwd));
        if (!dependents) continue;
        for (const siteFile of dependents) out.add(siteFile);
      }
      return [...out].sort();
    },

    knownSiteFiles() {
      return [...forward.keys()].sort();
    },

    unknownSiteFiles() {
      const out: string[] = [];
      for (const [siteFile, deps] of forward) {
        if (deps.size === 0) out.push(siteFile);
      }
      return out.sort();
    },

    forget(siteFile) {
      const siteKey = depKey(siteFile, cwd);
      unlink(siteKey);
      forward.delete(siteKey);
    },

    clear() {
      forward.clear();
      reverse.clear();
    },
  };
}
