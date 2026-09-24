// The oracle layer — "is this function behaving as expected?".
//
// Fuzzing is only as good as its oracle. We use three classes of oracle, in
// decreasing strength, all derived from properties the library MUST uphold
// rather than from a hand-written expected output:
//
//   STRONG (metamorphic, known expected result)
//     O1 valid-accepted     validate(mock)            === true
//     O2 invalid-rejected   validate(corrupted-mock)  === false
//     O5 json-stable        encode(decode(encode v))  === encode(v)
//
//   CONSISTENCY (two functions must agree)
//     O4 errors-agree       validate(x)  ⇔  getValidationErrors(x).length === 0
//     O18 fused-agree       validate{checkUnknowns}(x) ⇔ validate(x) && removeUnknownKeys drops nothing
//
//   ROBUSTNESS (totality — must never throw / hang on any input)
//     O3 validate-total     validate(anything) returns a boolean, no throw
//     O7 encode-total       encode(valid) does not throw and yields a string
//
// O1/O2 need a value of KNOWN validity (mock = valid by construction;
// `mutateToInvalid` = invalid by construction). O3/O4 also run on fully random
// junk, where validity is unknown but the property still must hold.

import {isDeepStrictEqual} from 'node:util';
import {deepCloneForRoundTrip} from '../../util/equalsHelpers.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import type {RTValidationError, RTValidationErrorPathSegment} from '../../../src/createRTFunctions.ts';
import {containsKeyedShape, pathKey, UNKNOWN_KEY_PREFIX, wireKeyAdmitted, type PlantedUnknownKey} from './unknownKeyPositions.ts';

/** One target type under fuzz: its schema (to drive mock + corruption) plus
 *  the family functions to exercise. Serialization fns are optional so a
 *  target can fuzz validation only. The test file builds these so the Vite
 *  plugin can rewrite the `createX` call sites. **/
export interface FuzzTarget {
  title: string;
  /** Runtype tree, used to generate mocks and to find corruption sites. **/
  schema: RunType;
  mock: () => unknown;
  validate: (value: unknown) => boolean;
  getValidationErrors: (value: unknown) => unknown[];
  /** O18 holds it against `validate` plus `clone`. **/
  validateStrict?: (value: unknown) => boolean;
  /** O21: a `validateStrict` rejection never comes with an empty list; its `'never'` entries feed O22–O24. **/
  errorsStrict?: (value: unknown) => unknown[];
  /** Unions only: the fused form follows the matched branch while the strip may keep another member's key.
   *  O18 then checks only that the fused form is never LOOSER. **/
  divergesFromComposition?: true;
  /** `never` lets any `RemoveUnknownKeysFn<T>` be assigned (contravariant parameter); the oracle casts back. **/
  clone?: (value: never) => unknown;
  /** `rjs` via a marker wrapper, since it has no createX factory; O26 needs an undeclared key GONE, not blanked. **/
  restoreFromJsonClone?: (value: unknown) => unknown;
  jsonEncode?: (value: unknown) => string | undefined;
  jsonDecode?: (serialized: string) => unknown;
  /** The compact-strategy JSON codec, O12's second opinion on the clone wire. **/
  compactEncode?: (value: unknown) => string | undefined;
  compactDecode?: (serialized: string) => unknown;
}

// O1–O7 are the value oracles. TR1–TR4 police the type-generation pipeline itself rather than a runtime value:
//   TR1 resolver-clean   no crash + no Error-severity diagnostics for a
//                        well-formed generated type
//   TR2 sites-complete   every emitted createX<T>() resolved to a site id
//   TR3 emit-valid       every demanded entry module evaluates (the emitted
//                        factory code is valid JS) with no dangling refs
//   TR4 wire-ok          the real createX factories materialise from the tuples
//   O12 cross-wire      jsonEncode(compactDecode(compactEncode v)) === jsonEncode(v)
//                       — the clone and compact wires must agree on the same
//                       DataOnly value (model-free: no projection oracle needed)
//   O14 family-agree    the clone and compact encoders agree serialize-vs-fail
//   O18 fused-agree     the `{checkUnknowns: true}` validator accepts exactly
//                       when `validate(v)` does and removeUnknownKeys drops nothing
//   O21 strict-self     the `{checkUnknowns: true}` validator and its error twin
//                       agree: empty report  <=>  accepted
// O22–O27 are the unknown-key agreement oracles. Several generated functions
// each decide what an "unknown key" is, each with its own emitter and its own
// arm per position, and they have drifted apart more than once — always at a
// position the shared union walk did not reach. They must all give the same
// answer for the same key. "The unknown-key report" below is the
// `expected: 'never'` entries of the `{checkUnknowns: true}` error twin:
//   O22 unknown-self    on a value `validate` accepts, the strict error twin
//                       reports ONLY unknown-key entries
//   O23 unknown-planted a key planted at a flagged position is reported at
//                       exactly that path and rejected by the strict validator;
//                       at an index-signature carve-out it changes neither
//   O24 unknown-strip   the paths the unknown-key report names are exactly the
//                       keys removeUnknownKeys drops
//   O25 wire-strip      keys planted on the encoded wire do not change what the
//                       `clone` decoder returns, unless the type admits them
//   O26 wire-delete     keys planted on the encoded wire are GONE from what
//                       `rjs` returns, unless the type admits them
//   O27 walker-reach    run-level: every target whose type carries a keyed
//                       shape offered the walker a position
// O15–O17 are the cloning oracles (test/fuzz/cloning/cloneOracle.ts):
//   O15 clone-reference   clone(v) deep-equals the reference-interpreter clone
//   O16 clone-isolation   input unmutated + no shared mutable ref + prototype kept
//   O17 clone-consistency validate(clone v) true, clone idempotent, extras stripped
export type OracleId =
  | 'O1'
  | 'O2'
  | 'O3'
  | 'O4'
  | 'O5'
  | 'O7'
  | 'O10'
  | 'O12'
  | 'O14'
  | 'O15'
  | 'O16'
  | 'O17'
  | 'O18'
  | 'O21'
  | 'O22'
  | 'O23'
  | 'O24'
  | 'O25'
  | 'O26'
  | 'TR1'
  | 'TR2'
  | 'TR3'
  | 'TR4';

/** A detected expectation violation — everything needed to reproduce + triage. **/
export interface Violation {
  oracle: OracleId;
  target: string;
  /** The exact seed to replay this iteration. **/
  seed: number;
  phase: 'valid' | 'invalid' | 'extras' | 'unknownkeys' | 'junk' | 'compile';
  message: string;
  value: string;
}

const MAX_SNAPSHOT = 500;

/** Render any value to a short, bigint/symbol-safe string for the report. **/
export function snapshot(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? v.toString() : v));
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > MAX_SNAPSHOT ? text.slice(0, MAX_SNAPSHOT) + '…' : text;
}

interface CheckCtx {
  seed: number;
  phase: Violation['phase'];
}

function violation(oracle: OracleId, target: FuzzTarget, ctx: CheckCtx, message: string, value: unknown): Violation {
  return {oracle, target: target.title, seed: ctx.seed, phase: ctx.phase, message, value: snapshot(value)};
}

/** O1 — a freshly generated mock must validate. **/
export function checkValidAccepted(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  let ok: boolean;
  try {
    ok = target.validate(value);
  } catch (err) {
    return violation('O1', target, ctx, `validate threw on a valid mock: ${errMsg(err)}`, value);
  }
  if (!ok) return violation('O1', target, ctx, 'validate rejected a value the mock generator produced', value);
  return null;
}

/** O2 — a value corrupted at a provably-invalid position must be rejected. **/
export function checkInvalidRejected(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  let ok: boolean;
  try {
    ok = target.validate(value);
  } catch (err) {
    return violation('O2', target, ctx, `validate threw on corrupted data: ${errMsg(err)}`, value);
  }
  if (ok) return violation('O2', target, ctx, 'validate accepted a value corrupted to be provably invalid', value);
  return null;
}

/** O3 — validate is total: returns a boolean on ANY input, never throws. **/
export function checkValidateTotal(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  try {
    const result = target.validate(value);
    if (typeof result !== 'boolean') {
      return violation('O3', target, ctx, `validate returned a non-boolean (${typeof result})`, value);
    }
  } catch (err) {
    return violation('O3', target, ctx, `validate threw (should be total): ${errMsg(err)}`, value);
  }
  return null;
}

/** O4 — validate and getValidationErrors must agree on every input. **/
export function checkErrorsAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  let ok: boolean;
  let errors: unknown[];
  try {
    ok = target.validate(value);
  } catch {
    return null; // O3 already reports the throw; don't double-count.
  }
  try {
    errors = target.getValidationErrors(value);
  } catch (err) {
    return violation('O4', target, ctx, `getValidationErrors threw while validate returned ${ok}: ${errMsg(err)}`, value);
  }
  const noErrors = Array.isArray(errors) && errors.length === 0;
  if (ok !== noErrors) {
    return violation(
      'O4',
      target,
      ctx,
      `validate=${ok} but getValidationErrors returned ${Array.isArray(errors) ? errors.length : '?'} error(s)`,
      value
    );
  }
  return null;
}

/** O18: the fused validator accepts exactly when `validate(v)` does and `removeUnknownKeys` drops nothing.
 *  The strip is its own emitter, so a fused arm missing its key check shows as a disagreement; a throw is a violation.
 *  The strip runs only on values `validate` accepts; without one (object unions) fused must still never accept more. **/
export function checkFusedAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {validateStrict, clone} = target;
  if (!validateStrict) return null;
  let plain: boolean;
  try {
    plain = target.validate(value);
  } catch {
    return null; // O3 covers validate's own totality
  }
  let actual: boolean;
  try {
    actual = validateStrict(value);
  } catch (err) {
    return violation('O18', target, ctx, `checkUnknowns validator threw where validate did not: ${errMsg(err)}`, value);
  }
  if (typeof actual !== 'boolean') {
    return violation('O18', target, ctx, `checkUnknowns validator returned a non-boolean (${typeof actual})`, value);
  }
  if (actual && !plain) return violation('O18', target, ctx, 'checkUnknowns validator accepted a value validate rejects', value);
  if (!plain || !clone) return null;
  let dropped: string[];
  try {
    dropped = droppedKeyPaths(value, clone(value as never));
  } catch {
    return null; // O24 reports a strip throw
  }
  const expected = dropped.length === 0;
  // Accepting a value the strip would change means the fusion LOST a check, a bug under any union policy.
  if (actual && !expected) {
    return violation(
      'O18',
      target,
      ctx,
      `checkUnknowns validator accepted a value removeUnknownKeys strips [${dropped.join(', ')}]`,
      value
    );
  }
  if (!target.divergesFromComposition && actual !== expected) {
    return violation(
      'O18',
      target,
      ctx,
      'checkUnknowns validator rejected a valid value removeUnknownKeys leaves unchanged',
      value
    );
  }
  return null;
}

/** O21 — the fused validator and its fused error twin agree with EACH OTHER.
 *
 *  Weaker-looking than O18, and it caught what O18 could not. The two strict
 *  families are built from the same emitter but their arms are spliced
 *  separately, so one can be fixed or extended while the other is left pointing
 *  at the plain family. That is exactly what happened on unions: the strict
 *  error arm delegated to plain `validate`, which accepts an undeclared key, so
 *  it reported NOTHING for values its own validator rejected.
 *
 *  Nobody would write that case by hand, because it only shows up on a shape
 *  where the two arms are emitted differently. A property over random values
 *  finds it for free. **/
export function checkStrictSelfAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {validateStrict, errorsStrict} = target;
  if (!validateStrict || !errorsStrict) return null;
  let accepted: boolean;
  try {
    accepted = validateStrict(value);
  } catch (err) {
    return violation('O21', target, ctx, `checkUnknowns validator threw: ${errMsg(err)}`, value);
  }
  let report: unknown[];
  try {
    report = errorsStrict(value);
  } catch (err) {
    return violation('O21', target, ctx, `checkUnknowns error report threw: ${errMsg(err)}`, value);
  }
  if (accepted !== (report.length === 0)) {
    return violation(
      'O21',
      target,
      ctx,
      accepted
        ? `validator ACCEPTED but the report lists ${report.length} error(s)`
        : 'validator REJECTED but the report is empty — a caller asking why gets nothing',
      value
    );
  }
  return null;
}

// =============================================================================
// O22–O27, the unknown-key agreement oracles.
//
// Every one of these functions has its own emitter and its own arm per
// position, and they are supposed to give the same answer about the same key.
// They have drifted apart more than once, always at a position the shared
// merged-allowlist walk did not reach — a class member of a union was the last
// one, found by hand. A hand-written test only covers the positions someone
// thought of; these hold the functions against EACH OTHER, so a position
// nobody thought of still gets an answer that has to agree.
// =============================================================================

/** Sorted `pathKey`s of the report entries expecting `expected`. **/
function reportedPaths(errors: readonly unknown[], expected: 'never' | 'union'): string[] {
  return (errors as RTValidationError[])
    .filter((error) => error.expected === expected)
    .map((error) => pathKey((error.path ?? []) as RTValidationErrorPathSegment[]))
    .sort();
}

/** True when `path` sits at or below `ancestor`, both in `pathKey` spelling. **/
function isUnderPath(path: string, ancestor: string): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}.`);
}

/** O22: on a value `validate` accepts, the strict twin reports ONLY `'never'` keys or `'union'` nodes rejecting keys.
 *  Anything else is a mislabelled key entry or a type arm disagreeing with the plain family; O21 pins emptiness. **/
export function checkUnknownKeysSelfAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {errorsStrict} = target;
  if (!errorsStrict) return null;
  try {
    if (!target.validate(value)) return null;
  } catch {
    return null; // O3 covers validate's own totality
  }
  let report: RTValidationError[];
  try {
    report = errorsStrict(value) as RTValidationError[];
  } catch (err) {
    return violation('O22', target, ctx, `checkUnknowns error report threw: ${errMsg(err)}`, value);
  }
  const typeErrors = report.filter((error) => error.expected !== 'never' && error.expected !== 'union');
  if (typeErrors.length > 0) {
    const expectedList = typeErrors.map(
      (error) => `${pathKey((error.path ?? []) as RTValidationErrorPathSegment[])}:${error.expected}`
    );
    return violation(
      'O22',
      target,
      ctx,
      `validate accepted but the strict report lists type errors [${expectedList.join(', ')}]`,
      value
    );
  }
  return null;
}

/** O23: the planted key gets the answer its position owes, which catches a position every family misses.
 *  A named-key plant is reported at exactly its path and strict-rejected; an index-signature plant changes neither.
 *  `clean` is the value without the plant, so the comparison is a difference, not an absolute. **/
export function checkUnknownKeysPlanted(
  target: FuzzTarget,
  planted: PlantedUnknownKey,
  clean: unknown,
  ctx: CheckCtx
): Violation | null {
  const {validateStrict, errorsStrict} = target;
  if (!validateStrict || !errorsStrict) return null;
  let added: string[];
  let addedUnions: string[];
  let unionsBefore: Set<string>;
  let plainPlanted: boolean;
  let acceptedPlanted: boolean;
  try {
    const cleanReport = errorsStrict(clean);
    const plantedReport = errorsStrict(planted.value);
    const before = new Set(reportedPaths(cleanReport, 'never'));
    unionsBefore = new Set(reportedPaths(cleanReport, 'union'));
    added = reportedPaths(plantedReport, 'never').filter((path) => !before.has(path));
    addedUnions = reportedPaths(plantedReport, 'union').filter((path) => !unionsBefore.has(path));
    plainPlanted = target.validate(planted.value);
    acceptedPlanted = validateStrict(planted.value);
  } catch (err) {
    return violation('O23', target, ctx, `a checkUnknowns family threw on the planted value: ${errMsg(err)}`, planted.value);
  }
  const plantedPath = pathKey(planted.path);
  // Inside a union the key reports as the union failing at its path, already there if `clean` failed (a subclass field).
  const unionAbove = (union: string) => union !== plantedPath && isUnderPath(plantedPath, union);
  const reportedByUnion =
    planted.kind === 'flagged' &&
    added.length === 0 &&
    (addedUnions.length === 1 ? unionAbove(addedUnions[0]) : addedUnions.length === 0 && [...unionsBefore].some(unionAbove));
  // Gated on `validate`: a carve-out plant breaking the value type fails its union as a type error.
  if (!reportedByUnion && addedUnions.length > 0 && plainPlanted) {
    return violation(
      'O23',
      target,
      ctx,
      `a key planted at a ${planted.kind} position (${plantedPath}) made unions fail at [${addedUnions.join(', ')}]`,
      planted.value
    );
  }
  const expected = planted.kind === 'flagged' && !reportedByUnion ? [plantedPath] : [];
  if (!isDeepStrictEqual(added, expected)) {
    return violation(
      'O23',
      target,
      ctx,
      `a key planted at a ${planted.kind} position should be reported as [${expected.join(', ')}] but was reported as [${added.join(', ')}]`,
      planted.value
    );
  }
  if (planted.kind === 'flagged' && acceptedPlanted)
    return violation('O23', target, ctx, `checkUnknowns validator accepted the key planted at ${plantedPath}`, planted.value);
  // A carve-out plant may break the index signature's value type, so the strict answer must match the plain one.
  if (planted.kind === 'carveOut' && acceptedPlanted !== plainPlanted)
    return violation(
      'O23',
      target,
      ctx,
      `checkUnknowns validator changed its answer for a carve-out key at ${plantedPath}`,
      planted.value
    );
  return null;
}

/** O24: the unknown-key report's paths and the keys `removeUnknownKeys` drops must match; each has its own emitter.
 *  Keys holding `undefined` are skipped: an explicit optional `undefined` may come back absent from a clone.
 *  The strip covers conforming values only; object unions have no strip (RUK001), so O25 covers them. **/
export function checkUnknownKeysStripAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {errorsStrict, clone} = target;
  if (!errorsStrict || !clone) return null;
  try {
    if (!target.validate(value)) return null;
  } catch {
    return null; // O3 covers validate's own totality
  }
  let reported: string[];
  let unions: string[];
  let dropped: string[];
  try {
    const report = errorsStrict(value);
    reported = reportedPaths(report, 'never');
    unions = reportedPaths(report, 'union');
    dropped = droppedKeyPaths(value, clone(value as never)).sort();
  } catch (err) {
    return violation('O24', target, ctx, `checkUnknowns error report or removeUnknownKeys threw: ${errMsg(err)}`, value);
  }
  // A union reports its own path for every key it rejects; each one must cover at least one dropped key.
  const emptyUnion = unions.find((union) => !dropped.some((path) => isUnderPath(path, union)));
  if (emptyUnion !== undefined) {
    return violation(
      'O24',
      target,
      ctx,
      `the union at [${emptyUnion}] fails but removeUnknownKeys drops nothing under it`,
      value
    );
  }
  dropped = dropped.filter((path) => !unions.some((union) => isUnderPath(path, union)));
  if (!isDeepStrictEqual(reported, dropped)) {
    return violation(
      'O24',
      target,
      ctx,
      `the unknown-key report names [${reported.join(', ')}] but removeUnknownKeys drops [${dropped.join(', ')}]`,
      value
    );
  }
  return null;
}

/** O27, the run-level coverage rule: the walker must find somewhere to plant for every target
 *  whose TYPE carries a keyed shape. Not a per-value Violation, so it has no OracleId; the sweep
 *  asserts it once at the end of the run.
 *
 *  Every other unknown-key oracle is silent when `collectUnknownKeyPositions` returns nothing, so a
 *  position the walker refuses to reach makes them all pass while checking nothing.
 *
 *  The rule reads the TYPE, not the root and not one value: an array, a tuple, a union, a Map or a
 *  Set is not itself keyed but can carry a keyed shape further down, so `containsKeyedShape` walks
 *  the whole tree. It is answered across the WHOLE run rather than per value, because a single
 *  value legitimately reaches nowhere (a union's number arm has no object in it); what cannot
 *  happen is a target that never once offered a position. **/
export function unreachedKeyedTargets(targets: FuzzTarget[], positionsByTarget: Map<string, number>): string[] {
  return targets
    .filter((target) => containsKeyedShape(target.schema))
    .filter((target) => (positionsByTarget.get(target.title) ?? 0) === 0)
    .map((target) => target.title);
}

/** Paths of planted keys still present as OWN keys, in report spelling so `wireKeyAdmitted` can walk them.
 *  `Object.hasOwn`, not a value check: a key set to `undefined` is still there, and telling those apart is O26's job. **/
function survivingPlantedKeys(
  value: unknown,
  path: RTValidationErrorPathSegment[] = [],
  depth = 0
): RTValidationErrorPathSegment[][] {
  if (depth > 12 || value === null || typeof value !== 'object') return [];
  if (value instanceof Date || value instanceof RegExp) return [];
  const out: RTValidationErrorPathSegment[][] = [];
  if (value instanceof Map) {
    let index = 0;
    for (const [key, entry] of value) {
      out.push(...survivingPlantedKeys(key, [...path, {key: index, failed: 'mapKey'}], depth + 1));
      out.push(...survivingPlantedKeys(entry, [...path, {key: index, failed: 'mapValue'}], depth + 1));
      index++;
    }
    return out;
  }
  if (value instanceof Set) {
    let index = 0;
    for (const item of value) {
      out.push(...survivingPlantedKeys(item, [...path, {key: index, failed: 'setKey'}], depth + 1));
      index++;
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) out.push(...survivingPlantedKeys(value[i], [...path, i], depth + 1));
    return out;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key.startsWith(UNKNOWN_KEY_PREFIX)) out.push([...path, key]);
    else out.push(...survivingPlantedKeys(record[key], [...path, key], depth + 1));
  }
  return out;
}

/** O26: the `rjs` restore deletes an undeclared wire key rather than blanking it. The plant goes on the WIRE, into
 *  every plain object, reaching where the type walker cannot; `wireKeyAdmitted` then judges each survivor. An index
 *  signature declares every key, and a union arm may leave an invalid wire for validate, so survivors there pass. **/
export function checkWireStripDeletes(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {jsonEncode, restoreFromJsonClone} = target;
  if (!jsonEncode || !restoreFromJsonClone) return null;
  let wire: string | undefined;
  try {
    wire = jsonEncode(deepCloneForRoundTrip(value));
  } catch {
    return null; // O7 owns encode failures
  }
  if (typeof wire !== 'string') return null;
  let planted: unknown;
  try {
    planted = JSON.parse(wire);
    if (plantWireKeys(planted) === 0) return null;
  } catch {
    return null; // a wire we cannot re-serialize is not this oracle's subject
  }
  // The restore rewrites its input in place, so it gets its own copy.
  let restored: unknown;
  try {
    restored = restoreFromJsonClone(JSON.parse(JSON.stringify(planted)));
  } catch (err) {
    return violation('O26', target, ctx, `the rjs restore threw on a wire carrying undeclared keys: ${errMsg(err)}`, planted);
  }
  const wireInvalid = !validates(target, restored);
  const kept = survivingPlantedKeys(restored).filter((path) => !wireKeyAdmitted(target.schema, path, wireInvalid));
  if (kept.length > 0)
    return violation(
      'O26',
      target,
      ctx,
      `the rjs restore left ${kept.length} undeclared wire key(s): [${kept.map(pathKey).join(', ')}]`,
      restored
    );
  return null;
}

/** O25: keys planted into every plain object of the encoded wire must not change what the `clone` decoder returns.
 *  Keys the type admits (index signature, a union arm the wire no longer validates) are removed from both sides first.
 *  Anti-vacuity is a separate test: mutate cannot keep a key on a class arm, which is rebuilt from the type. **/
export function checkWireStripBlind(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {jsonEncode, jsonDecode} = target;
  if (!jsonEncode || !jsonDecode) return null;
  let wire: string | undefined;
  try {
    wire = jsonEncode(deepCloneForRoundTrip(value));
  } catch {
    return null; // O7 owns encode failures
  }
  if (typeof wire !== 'string') return null;
  let planted: string;
  let plantedCount: number;
  try {
    const tree = JSON.parse(wire) as unknown;
    plantedCount = plantWireKeys(tree);
    if (plantedCount === 0) return null;
    planted = JSON.stringify(tree);
  } catch {
    return null; // a wire we cannot re-serialize is not this oracle's subject
  }
  let strippedClean: unknown;
  let strippedPlanted: unknown;
  try {
    const decodedPlanted = jsonDecode(planted);
    const wireInvalid = !validates(target, decodedPlanted);
    strippedClean = withoutAdmittedPlantedKeys(target, jsonDecode(wire), wireInvalid);
    strippedPlanted = withoutAdmittedPlantedKeys(target, decodedPlanted, wireInvalid);
  } catch (err) {
    return violation('O25', target, ctx, `a decoder threw on a wire carrying undeclared keys: ${errMsg(err)}`, planted);
  }
  if (strippedClean === null || strippedClean === undefined) return null; // nothing decoded, nothing to compare
  if (!isDeepStrictEqual(strippedClean, strippedPlanted))
    return violation(
      'O25',
      target,
      ctx,
      `the clone decoder did not drop ${plantedCount} undeclared wire key(s): got ${snapshot(strippedPlanted)} instead of ${snapshot(strippedClean)}`,
      planted
    );
  return null;
}

/** A copy with every planted key the type admits removed: a correct decoder keeps it, so it must
 *  not count as a difference. **/
function withoutAdmittedPlantedKeys(target: FuzzTarget, value: unknown, wireInvalid: boolean): unknown {
  return withoutKeys(
    value,
    (key, _entry, path) => key.startsWith(UNKNOWN_KEY_PREFIX) && wireKeyAdmitted(target.schema, path, wireInvalid)
  );
}

/** validate's answer, a throw counting as a refusal: the judge only gets more lenient on it. **/
function validates(target: FuzzTarget, value: unknown): boolean {
  try {
    return target.validate(value);
  } catch {
    return false;
  }
}

/** Copy minus the own keys `drop` names (`path` in report spelling); natives kept as is, Maps/Sets/arrays walked. **/
function withoutKeys(
  value: unknown,
  drop: (key: string, entry: unknown, path: RTValidationErrorPathSegment[]) => boolean,
  path: RTValidationErrorPathSegment[] = [],
  depth = 0
): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date || value instanceof RegExp) return value;
  if (value instanceof Map) {
    const out = new Map<unknown, unknown>();
    let index = 0;
    for (const [key, entry] of value) {
      out.set(
        withoutKeys(key, drop, [...path, {key: index, failed: 'mapKey'}], depth + 1),
        withoutKeys(entry, drop, [...path, {key: index, failed: 'mapValue'}], depth + 1)
      );
      index++;
    }
    return out;
  }
  if (value instanceof Set) {
    const out = new Set<unknown>();
    let index = 0;
    for (const item of value) out.add(withoutKeys(item, drop, [...path, {key: index++, failed: 'setKey'}], depth + 1));
    return out;
  }
  if (Array.isArray(value)) return value.map((item, i) => withoutKeys(item, drop, [...path, i], depth + 1));
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (drop(key, record[key], [...path, key])) continue;
    out[key] = withoutKeys(record[key], drop, [...path, key], depth + 1);
  }
  return out;
}

/** Write one undeclared key into every plain object of a parsed wire tree, and return how many were
 *  written. Blind on purpose: no type is consulted, so it reaches wire positions a type walk would
 *  have to model (a union envelope's payload, a merged object, an index-signature record). Arrays
 *  are walked, never written into; a Map, a Set and a tuple all ride as arrays. Whether a planted
 *  key may survive the decode is the oracle's question, answered per survivor by `wireKeyAdmitted`. **/
function plantWireKeys(node: unknown, depth = 0): number {
  if (depth > 12 || node === null || typeof node !== 'object') return 0;
  let count = 0;
  if (Array.isArray(node)) {
    for (const item of node) count += plantWireKeys(item, depth + 1);
    return count;
  }
  const record = node as Record<string, unknown>;
  for (const key of Object.keys(record)) count += plantWireKeys(record[key], depth + 1);
  record[`${UNKNOWN_KEY_PREFIX}wire`] = 'fz';
  return count + 1;
}

/** Every own key present in `before` and gone from `after`, as report-shaped
 *  path strings. Walks both sides in step through objects, arrays, Maps and
 *  Sets; a Map / Set entry is addressed by its iteration index, the way an
 *  error path addresses it. **/
function droppedKeyPaths(before: unknown, after: unknown, path: RTValidationErrorPathSegment[] = []): string[] {
  const out: string[] = [];
  if (before === null || typeof before !== 'object' || after === null || typeof after !== 'object') return out;
  if (before instanceof Map && after instanceof Map) {
    const beforeEntries = [...before];
    const afterEntries = [...after];
    for (let i = 0; i < beforeEntries.length && i < afterEntries.length; i++) {
      out.push(...droppedKeyPaths(beforeEntries[i][0], afterEntries[i][0], [...path, {key: i, failed: 'mapKey'}]));
      out.push(...droppedKeyPaths(beforeEntries[i][1], afterEntries[i][1], [...path, {key: i, failed: 'mapValue'}]));
    }
    return out;
  }
  if (before instanceof Set && after instanceof Set) {
    const beforeItems = [...before];
    const afterItems = [...after];
    for (let i = 0; i < beforeItems.length && i < afterItems.length; i++) {
      out.push(...droppedKeyPaths(beforeItems[i], afterItems[i], [...path, {key: i, failed: 'setKey'}]));
    }
    return out;
  }
  if (Array.isArray(before)) {
    if (!Array.isArray(after)) return out;
    for (let i = 0; i < before.length && i < after.length; i++) out.push(...droppedKeyPaths(before[i], after[i], [...path, i]));
    return out;
  }
  if (Array.isArray(after) || before instanceof Date || before instanceof RegExp) return out;
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  for (const key of Object.keys(beforeRecord)) {
    if (beforeRecord[key] === undefined) continue; // presence, not declaredness
    if (!Object.hasOwn(afterRecord, key)) {
      out.push(pathKey([...path, key]));
      continue;
    }
    out.push(...droppedKeyPaths(beforeRecord[key], afterRecord[key], [...path, key]));
  }
  return out;
}

/** O5 — JSON round-trip is stable on the wire: re-encoding a decode of the
 *  wire reproduces the same wire. Stable form (rather than value equality)
 *  sidesteps the optional-`undefined`-key vs dropped-key mismatch. **/
export function checkJsonStable(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  if (!target.jsonEncode || !target.jsonDecode) return null;
  let wire1: string | undefined;
  try {
    wire1 = target.jsonEncode(value);
  } catch (err) {
    return violation('O7', target, ctx, `jsonEncode threw on a valid mock: ${errMsg(err)}`, value);
  }
  if (wire1 === undefined) return null; // nothing to round-trip (e.g. undefined root)
  try {
    const wire2 = target.jsonEncode(target.jsonDecode(wire1));
    if (wire1 !== wire2) {
      return violation(
        'O5',
        target,
        ctx,
        `json round-trip is not stable:\n  enc1=${cut(wire1)}\n  enc2=${cut(String(wire2))}`,
        value
      );
    }
  } catch (err) {
    return violation('O5', target, ctx, `json decode/re-encode threw on valid data: ${errMsg(err)}`, value);
  }
  return null;
}

/** O12 — jsonEncode(compactDecode(compactEncode v)) must equal jsonEncode(v), structurally, so key order is free.
 *  The caller skips types whose optional can hold a present `null`: compact collapses it to absent by design. **/
export function checkCrossWire(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  if (!target.jsonEncode || !target.compactEncode || !target.compactDecode) return null;
  let jsonWire: string | undefined;
  let viaCompactWire: string | undefined;
  try {
    jsonWire = target.jsonEncode(value);
    if (jsonWire === undefined) return null; // undefined root — nothing to compare
    const compactWire = target.compactEncode(deepCloneForRoundTrip(value));
    if (compactWire === undefined) return null;
    viaCompactWire = target.jsonEncode(target.compactDecode(compactWire));
  } catch {
    return null; // encode/decode throws are O5/O7's job, not double-counted here
  }
  if (jsonWire !== viaCompactWire && !sameJsonValue(jsonWire, viaCompactWire)) {
    return violation(
      'O12',
      target,
      ctx,
      `clone and compact wires disagree on the decoded value:\n  json        =${cut(jsonWire)}\n  via-compact =${cut(String(viaCompactWire))}`,
      value
    );
  }
  return null;
}

/** Do two JSON wires carry the same value, ignoring key order alone? Anything
 *  that fails to parse is NOT treated as equal — a malformed wire is a real
 *  finding, so it must reach the violation path rather than be excused here. **/
function sameJsonValue(left: string, right: string | undefined): boolean {
  if (right === undefined) return false;
  try {
    return isDeepStrictEqual(JSON.parse(left), JSON.parse(right));
  } catch {
    return false;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function cut(text: string): string {
  return text.length > 200 ? text.slice(0, 200) + '…' : text;
}
