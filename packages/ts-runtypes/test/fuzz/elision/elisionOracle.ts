// Oracles for the elision form-equivalence lane. Each check returns a
// replayable violation record or nothing.
//
// The equivalence oracle (E1) is deliberately BYTE-level, not behavioral: the
// two spellings of one schema resolve the same structural type id and the same
// family fnHashes, so the emitter must produce IDENTICAL entry modules for
// every key the static form demands. Byte-equal modules imply behavior-equal
// compiled functions — strictly stronger than sampling probe values — and the
// check is free. (Probing the value form's functions separately would be
// vacuous anyway: both spellings resolve the same live cache entry once
// registered.) Behavior is still exercised on the STATIC form (E3, in the
// runner), because the elided spelling is the feature's actual risk surface.

export interface ElisionViolation {
  oracle: 'E0-fixture' | 'E1-entry-drift' | 'E2-static-reflection' | 'E2-value-missing-reflection' | 'E3-behavior';
  seed: number;
  title: string;
  message: string;
}

export interface ScanShape {
  modules: Record<string, string>;
  /** Site fnIds, '' for reflection sites — from the scan response. **/
  siteFnIds: string[];
}

/** The runtype data bundle's fixed module basename (entrymodules.ModuleName
 *  special-cases KindRunTypeBundle). **/
export const RUNTYPES_BUNDLE_BASENAME = 'runtypes';

/** E1 — every module the static form emitted must exist byte-identically in
 *  the value form's output (the value form adds reflection modules on top;
 *  it must never CHANGE a function entry). **/
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

/** E2 (static side) — the static spelling must emit ZERO reflection payload:
 *  no runtype bundle module and no reflection (empty-fnId) site. **/
export function checkStaticHasNoReflection(seed: number, title: string, scan: ScanShape): ElisionViolation | undefined {
  if (RUNTYPES_BUNDLE_BASENAME in scan.modules) {
    return {
      oracle: 'E2-static-reflection',
      seed,
      title,
      message: `the static form emitted the '${RUNTYPES_BUNDLE_BASENAME}' bundle module`,
    };
  }
  const reflectionSites = scan.siteFnIds.filter((fnId) => !fnId).length;
  if (reflectionSites > 0) {
    return {
      oracle: 'E2-static-reflection',
      seed,
      title,
      message: `the static form kept ${reflectionSites} reflection site(s) — the builder const was not elided`,
    };
  }
  return undefined;
}

/** E2 (value side) — the value spelling must KEEP its reflection payload; its
 *  absence would mean the elision fired on a used const. **/
export function checkValueHasReflection(seed: number, title: string, scan: ScanShape): ElisionViolation | undefined {
  if (!(RUNTYPES_BUNDLE_BASENAME in scan.modules)) {
    return {
      oracle: 'E2-value-missing-reflection',
      seed,
      title,
      message: `the value form emitted no '${RUNTYPES_BUNDLE_BASENAME}' bundle — a value-used builder was elided`,
    };
  }
  if (!scan.siteFnIds.some((fnId) => !fnId)) {
    return {
      oracle: 'E2-value-missing-reflection',
      seed,
      title,
      message: 'the value form kept no reflection site — a value-used builder site was dropped',
    };
  }
  return undefined;
}
