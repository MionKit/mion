// Oracles for the elision form-equivalence lane. Each check is a pure
// function returning a replayable violation record or nothing, so the unit
// lane can prove every one FIRES on deliberately broken output.
//
// The equivalence oracle (E1) is deliberately BYTE-level, not behavioral: the
// two spellings of one schema resolve the same structural type id and the same
// family fnHashes, so the emitter must produce IDENTICAL function-entry
// modules for the keys both spellings demand. Byte-equal modules imply
// behavior-equal compiled functions — strictly stronger than sampling probe
// values — and the check is free. Reflection modules are excluded from the
// general comparison because a fixture with named declarations keeps some
// reflection in BOTH spellings (cross-declaration references ride
// `getRunType<T>()` escapes, which are never elided) and the two spellings
// place their calls at different positions. For a declaration-free,
// escape-free fixture the two spellings must agree on EVERYTHING instead
// (checkAllEntriesIdentical): neither carries any reflection at all, because
// handing the root to a createXFn is not a value use either.

export interface ElisionViolation {
  oracle: 'E0-fixture' | 'E1-entry-drift' | 'E1-id-drift' | 'E2-reflection' | 'E2-value-row' | 'E3-behavior';
  seed: number;
  title: string;
  message: string;
}

/** One scanned site, reduced to what the oracles read. **/
export interface SiteShape {
  fnId: string;
  id: string;
}

/** The runtype data bundle's fixed module basename (entrymodules.ModuleName
 *  special-cases KindRunTypeBundle). **/
export const RUNTYPES_BUNDLE_BASENAME = 'runtypes';

/** Restrict an entry-module map to the FUNCTION side — the modules E1 may
 *  byte-compare: fn-entry modules (`<fnHash>_<typeId>` basenames carry one
 *  underscore) and pure-fn modules (`pf/…`). Excluded: the `runtypes` bundle
 *  (content-hashed over its rows, so it moves with the reflection payload) and
 *  bare-id facade modules (reflection-lane plumbing). **/
export function comparableModules(modules: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [basename, source] of Object.entries(modules)) {
    if (basename === RUNTYPES_BUNDLE_BASENAME) continue;
    if (!basename.includes('_') && !basename.startsWith('pf/')) continue;
    out[basename] = normalizeSitePositions(source);
  }
  return out;
}

/** Strip call-site coordinates from embedded diagnostic text (alwaysThrow
 *  entries bake `(at <file>:<line>:<col>)` into their message). The two
 *  spellings place their calls at different source positions, so coordinates
 *  legitimately differ while everything else must stay byte-identical. **/
export function normalizeSitePositions(source: string): string {
  return source.replace(/\(at [^)\s]+:\d+:\d+\)/g, '(at <site>)');
}

/** E1a — the two spellings' createX sites must resolve the SAME cache keys
 *  (`<fnHash>_<typeId>`), in call order: same structural type, same families,
 *  whichever spelling. **/
export function checkFnSiteAgreement(
  seed: number,
  title: string,
  staticKeys: string[],
  valueKeys: string[]
): ElisionViolation | undefined {
  if (staticKeys.length === valueKeys.length && staticKeys.every((key, i) => key === valueKeys[i])) return undefined;
  return {
    oracle: 'E1-id-drift',
    seed,
    title,
    message: `the two spellings resolved different fn-entry keys:\n  static ${staticKeys.join(', ')}\n  value  ${valueKeys.join(', ')}`,
  };
}

/** E1b — every comparable module the static form emitted must exist
 *  BYTE-IDENTICALLY in the value form's output. **/
export function checkSharedEntriesIdentical(
  seed: number,
  title: string,
  staticModules: Record<string, string>,
  valueModules: Record<string, string>
): ElisionViolation | undefined {
  for (const [basename, source] of Object.entries(staticModules)) {
    const twin = valueModules[basename];
    if (twin === undefined) {
      return {
        oracle: 'E1-entry-drift',
        seed,
        title,
        message: `module '${basename}' emitted by the static form is missing from the value form`,
      };
    }
    if (twin !== source) {
      return {
        oracle: 'E1-entry-drift',
        seed,
        title,
        message: `module '${basename}' differs between spellings:\n--- static ---\n${source}\n--- value ---\n${twin}`,
      };
    }
  }
  return undefined;
}

/** E1c — for a declaration-free, escape-free fixture the two spellings must
 *  emit the SAME modules byte for byte, reflection included: neither is a value
 *  use of the root, so neither carries a graph. Compared both directions, so an
 *  extra module on either side fires. **/
export function checkAllEntriesIdentical(
  seed: number,
  title: string,
  staticModules: Record<string, string>,
  valueModules: Record<string, string>
): ElisionViolation | undefined {
  const normalize = (modules: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [basename, source] of Object.entries(modules)) out[basename] = normalizeSitePositions(source);
    return out;
  };
  const staticSide = normalize(staticModules);
  const valueSide = normalize(valueModules);
  for (const [form, left, right] of [
    ['static', staticSide, valueSide],
    ['value', valueSide, staticSide],
  ] as const) {
    for (const [basename, source] of Object.entries(left)) {
      const twin = right[basename];
      if (twin === undefined) {
        return {
          oracle: 'E1-entry-drift',
          seed,
          title,
          message: `module '${basename}' emitted by the ${form} form is missing from the other spelling`,
        };
      }
      if (twin !== source) {
        return {
          oracle: 'E1-entry-drift',
          seed,
          title,
          message: `module '${basename}' differs between spellings:\n--- ${form} ---\n${source}\n--- other ---\n${twin}`,
        };
      }
    }
  }
  return undefined;
}

/** Count the reflection (empty-fnId) sites carrying one structural id. **/
function reflectionCount(sites: SiteShape[], id: string): number {
  return sites.filter((site) => !site.fnId && site.id === id).length;
}

/** E2 — when the converter printed the root as a real BUILDER expression, the
 *  root's builder site must be gone from BOTH spellings: unused in the static
 *  one, and handed to a createXFn (not a value use) in the value one. When it
 *  printed the root as the `getRunType<T>()` ESCAPE, the site is an id-lookup
 *  that is never elidable by design, so nothing is asserted (checkValueRootRow
 *  still pins the row). Named declarations may keep their own escape reflection
 *  either way, so the check is scoped to the root id, not the whole payload. **/
export function checkRootSiteGone(
  seed: number,
  title: string,
  form: 'static' | 'value',
  sites: SiteShape[],
  rootId: string,
  rootPrintsAsEscape: boolean
): ElisionViolation | undefined {
  if (rootPrintsAsEscape) return undefined;
  if (reflectionCount(sites, rootId) === 0) return undefined;
  return {
    oracle: 'E2-reflection',
    seed,
    title,
    message: `the ${form} form kept the root builder reflection site — the const was not elided`,
  };
}

/** E2 (declaration-free fixtures only) — with no named declarations there is
 *  nothing to escape, so the form must emit ZERO reflection payload: no
 *  `runtypes` bundle module and no reflection site at all. Holds for BOTH
 *  spellings. **/
export function checkZeroReflection(
  seed: number,
  title: string,
  form: 'static' | 'value',
  modules: Record<string, string>,
  sites: SiteShape[]
): ElisionViolation | undefined {
  if (RUNTYPES_BUNDLE_BASENAME in modules) {
    return {
      oracle: 'E2-reflection',
      seed,
      title,
      message: `a declaration-free ${form} form emitted the '${RUNTYPES_BUNDLE_BASENAME}' bundle module`,
    };
  }
  const reflectionSites = sites.filter((site) => !site.fnId).length;
  if (reflectionSites > 0) {
    return {
      oracle: 'E2-reflection',
      seed,
      title,
      message: `a declaration-free ${form} form kept ${reflectionSites} reflection site(s)`,
    };
  }
  return undefined;
}

/** E2 (value side, the graph ROW) — the tail swap hands the root const to the
 *  three createXFn calls, which read their own injected entry tuples, so a
 *  builder-printed root leaves NO instantiable row behind. An escape-printed
 *  root is the opposite: the id lookup demands its row in both spellings. **/
export function checkValueRootRow(
  seed: number,
  title: string,
  rootPrintsAsEscape: boolean,
  rootRowInstantiated: boolean
): ElisionViolation | undefined {
  if (rootRowInstantiated === rootPrintsAsEscape) return undefined;
  return {
    oracle: 'E2-value-row',
    seed,
    title,
    message: rootPrintsAsEscape
      ? 'the value form emitted no instantiable runtype row for an escape-printed root'
      : 'the value form emitted a runtype row for the root — a factory argument is not a value use',
  };
}
