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
// comparison on purpose: the value spelling legitimately carries MORE
// reflection (the kept root graph), and a fixture with named declarations
// keeps some reflection in BOTH spellings (cross-declaration references ride
// `getRunType<T>()` escapes, which are never elided).

export interface ElisionViolation {
  oracle:
    | 'E0-fixture'
    | 'E1-entry-drift'
    | 'E1-id-drift'
    | 'E2-static-reflection'
    | 'E2-value-missing-reflection'
    | 'E3-behavior';
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

/** Count the reflection (empty-fnId) sites carrying one structural id. **/
function reflectionCount(sites: SiteShape[], id: string): number {
  return sites.filter((site) => !site.fnId && site.id === id).length;
}

/** E2 (static side) — when the converter printed the root as a real BUILDER
 *  expression, the root's builder site must be gone from the static spelling.
 *  When it printed the root as the `getRunType<T>()` ESCAPE, the site is an
 *  id-lookup that is never elidable by design, so nothing is asserted here
 *  (the differential value-side check still pins the delta). Named
 *  declarations may keep their own escape reflection either way, so the check
 *  is scoped to the root id, not the whole payload. **/
export function checkStaticRootSiteGone(
  seed: number,
  title: string,
  sites: SiteShape[],
  rootId: string,
  rootPrintsAsEscape: boolean
): ElisionViolation | undefined {
  if (rootPrintsAsEscape) return undefined;
  if (reflectionCount(sites, rootId) === 0) return undefined;
  return {
    oracle: 'E2-static-reflection',
    seed,
    title,
    message: 'the static form kept the root builder reflection site — the const was not elided',
  };
}

/** E2 (static side, declaration-free fixtures only) — with no named
 *  declarations there is nothing to escape, so the static form must emit ZERO
 *  reflection payload: no `runtypes` bundle module and no reflection site at
 *  all. **/
export function checkStaticZeroReflection(
  seed: number,
  title: string,
  modules: Record<string, string>,
  sites: SiteShape[]
): ElisionViolation | undefined {
  if (RUNTYPES_BUNDLE_BASENAME in modules) {
    return {
      oracle: 'E2-static-reflection',
      seed,
      title,
      message: `a declaration-free static form emitted the '${RUNTYPES_BUNDLE_BASENAME}' bundle module`,
    };
  }
  const reflectionSites = sites.filter((site) => !site.fnId).length;
  if (reflectionSites > 0) {
    return {
      oracle: 'E2-static-reflection',
      seed,
      title,
      message: `a declaration-free static form kept ${reflectionSites} reflection site(s)`,
    };
  }
  return undefined;
}

/** E2 (value side, DIFFERENTIAL) — the tail swap value-uses the root const,
 *  so the value spelling must carry exactly one MORE root-id reflection site
 *  than the static spelling when the root printed as a builder (the kept
 *  builder site), and exactly the SAME count when it printed as the escape
 *  (an id-lookup site rides both spellings unchanged). The differential form
 *  makes escape sites — identical in both spellings — cancel out. The root's
 *  graph row must instantiate on the value side either way (a kept builder
 *  registers it; an escape demands it). **/
export function checkValueRootKept(
  seed: number,
  title: string,
  staticSites: SiteShape[],
  valueSites: SiteShape[],
  rootId: string,
  rootPrintsAsEscape: boolean,
  rootRowInstantiated: boolean
): ElisionViolation | undefined {
  const expectedDelta = rootPrintsAsEscape ? 0 : 1;
  const delta = reflectionCount(valueSites, rootId) - reflectionCount(staticSites, rootId);
  if (delta !== expectedDelta) {
    return {
      oracle: 'E2-value-missing-reflection',
      seed,
      title,
      message: `root reflection-site delta between spellings is ${delta}, want ${expectedDelta} — a value-used builder was elided (or an extra site appeared)`,
    };
  }
  if (!rootRowInstantiated) {
    return {
      oracle: 'E2-value-missing-reflection',
      seed,
      title,
      message: 'the value form emitted no instantiable runtype row for the root',
    };
  }
  return undefined;
}
