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
//     O20 parse-roundtrip   parse(JSON.parse(encode v)) deep-equals v
//     O6 binary-stable      same, over the binary wire
//
//   CONSISTENCY (two functions must agree)
//     O4 errors-agree       validate(x)  ⇔  getValidationErrors(x).length === 0
//     O18 fused-agree       validate{checkUnknowns}(x) ⇔ validate(x) && !hasUnknownKeys(x)
//     O19 parse-agree       parse(x) throws  ⇔  !validate(restore(x))
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
import {pathKey, UNKNOWN_KEY_PREFIX, type PlantedUnknownKey} from './unknownKeyPositions.ts';

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
  /** The `{checkUnknowns: true}` fused validator, and the two functions it
   *  replaces. Present together or not at all — O18 compares one against the
   *  other, so a target supplying only some of them can't be checked. **/
  validateStrict?: (value: unknown) => boolean;
  /** The strict ERROR twin. O21 holds it against `validateStrict`: a caller that
   *  gets a rejection and then asks why must never be handed an empty list. **/
  errorsStrict?: (value: unknown) => unknown[];
  /** The predicate half of the reference composition, and it must be the
   *  `{runsAfterValidation: true}` variant. That is the one the fused form
   *  replaces: both get to assume validation already ran, so neither emits a
   *  shape guard. The BLIND variant emits one, which makes it answer differently
   *  for a value that passes validation without being a plain object — an array
   *  satisfying `{length: number}`, say. Comparing against the blind form would
   *  hold the fused families to a contract they are not implementing.
   *
   *  O18 only ever calls this after `validate(value)` returned true, which is
   *  the variant's precondition. **/
  hasUnknownKeys?: (value: unknown) => boolean;
  /** Set on a target whose fused validator deliberately answers differently from
   *  the composition. Unions are the only such shape: the fused form follows the
   *  branch that matched, the merged allowlist cannot know which one it was. O18
   *  then checks the half that must still hold — the fused form is never LOOSER
   *  than the composition — instead of equality. **/
  divergesFromComposition?: true;
  /** The unknown-key agreement set (O22–O25). Each is one of the functions
   *  that decides what an undeclared key is, and the oracles hold them against
   *  each other rather than against a hand-written answer.
   *
   *  `hasUnknownKeysBlind` is the DEFAULT variant, not the
   *  `{runsAfterValidation: true}` one O18 uses: it emits the shape guard, and
   *  so does `unknownKeyErrors`, so the two are comparable on any value. **/
  hasUnknownKeysBlind?: (value: unknown) => boolean;
  unknownKeyErrors?: (value: unknown) => RTValidationError[];
  /** `CloneExactShapeFn<T>` is `(value: T) => T`, so its parameter is `T`, not
   *  `unknown`. Spelling the parameter `never` here is what lets a target of
   *  any shape be assigned (parameters are contravariant); the oracle casts
   *  the value back at the one call site. **/
  clone?: (value: never) => unknown;
  /** createParseFn for the same type, and the composition it fuses. `parse`
   *  throws on a mismatch, so both oracles below run it inside a try.
   *
   *  `restoreFromJson` is the reference half, recovered through a marker wrapper
   *  because the primitive has no createX factory. Without it O19 can only check
   *  that parse's OWN output validates, which a parse that wrongly rejects
   *  everything would still satisfy — supply it and the oracle becomes the
   *  two-sided equality O18 is for the fused validator. **/
  parse?: (value: unknown) => unknown;
  restoreFromJson?: (value: unknown) => unknown;
  jsonEncode?: (value: unknown) => string | undefined;
  jsonDecode?: (serialized: string) => unknown;
  /** The `compact` pair. It promises something the keyed strategies do not: no key
   *  name from the wire reaches the decoded value, which is what lets a mion route
   *  on that wire compile no unknown-key check at all. O26 is that promise. **/
  compactEncode?: (value: unknown) => string | undefined;
  compactDecode?: (serialized: string) => unknown;
  binaryEncode?: (value: unknown) => Uint8Array;
  binaryDecode?: (buffer: Uint8Array) => unknown;
}

// O1–O7 are the value oracles (Phase 1 + Phase 2 Tier B). TR1–TR4 are the
// Phase 2 Tier-A resolver/emit oracles — they police the type-generation
// pipeline itself rather than a runtime value:
//   TR1 resolver-clean   no crash + no Error-severity diagnostics for a
//                        well-formed generated type
//   TR2 sites-complete   every emitted createX<T>() resolved to a site id
//   TR3 emit-valid       every demanded entry module evaluates (the emitted
//                        factory code is valid JS) with no dangling refs
//   TR4 wire-ok          the real createX factories materialise from the tuples
//   O12 cross-wire      jsonEncode(binaryDecode(binaryEncode v)) === jsonEncode(v)
//                       — the JSON and binary wires must agree on the same
//                       DataOnly value (model-free: no projection oracle needed)
//   O14 family-agree    every serialization family agrees serialize-vs-fail
//   O18 fused-agree     the `{checkUnknowns: true}` validator equals the
//                       composition it replaces, `validate(v) && !hasUnknownKeys(v)`
//   O21 strict-self     the `{checkUnknowns: true}` validator and its error twin
//                       agree: empty report  <=>  accepted
// O22–O25 are the unknown-key agreement oracles. Several generated functions
// each decide what an "unknown key" is, each with its own emitter and its own
// arm per position, and they have drifted apart more than once — always at a
// position the shared union walk did not reach. They must all give the same
// answer for the same key:
//   O22 unknown-self    hasUnknownKeys(v) is true exactly when
//                       unknownKeyErrors(v) is non-empty
//   O23 unknown-planted a key planted at a flagged position is reported at
//                       exactly that path; at an index-signature carve-out it
//                       is reported by neither; a clean value is clean
//   O24 unknown-strip   the paths unknownKeyErrors reports are exactly the
//                       keys cloneExactShape drops
//   O25 wire-strip      undeclared keys planted on the ENCODED WIRE do not
//                       change what the `strip` decoder returns, and the
//                       `preserve` decoder does keep them
//   O26 wire-compact    the same over the `compact` pair. Compact keeps only
//                       union members and index-signature records keyed, and a
//                       key planted on one of those must not survive the decode
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
  | 'O6'
  | 'O7'
  | 'O10'
  | 'O12'
  | 'O14'
  | 'O15'
  | 'O16'
  | 'O17'
  | 'O18'
  | 'O19'
  | 'O20'
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

/** O18 — the fused `{checkUnknowns: true}` validator must answer exactly what
 *  the composition it replaces answers: `validate(v) && !hasUnknownKeys(v)`.
 *
 *  Compare-to-a-trusted-source. The two-call form is the reference implementation
 *  users are migrating off, so any input where the two disagree is a regression
 *  in the fused emit — most likely a node kind whose arm forgot to splice the key
 *  check (or spliced it where the shape declares no keys to begin with).
 *
 *  Skipped for a target that does not carry the fused trio. Totality rides along:
 *  the fused validator must be as total as the plain one, so a throw is a
 *  violation rather than a skip. **/
export function checkFusedAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {validateStrict, hasUnknownKeys} = target;
  if (!validateStrict || !hasUnknownKeys) return null;
  let expected: boolean;
  try {
    expected = target.validate(value) && !hasUnknownKeys(value);
  } catch {
    // The reference side is undefined for this input (O3 covers validate's own
    // totality); there is nothing to compare against.
    return null;
  }
  let actual: boolean;
  try {
    actual = validateStrict(value);
  } catch (err) {
    return violation('O18', target, ctx, `checkUnknowns validator threw where the two-call form did not: ${errMsg(err)}`, value);
  }
  if (typeof actual !== 'boolean') {
    return violation('O18', target, ctx, `checkUnknowns validator returned a non-boolean (${typeof actual})`, value);
  }
  // A diverging target keeps the half that must never break: accepting a value
  // the composition rejects would mean the fusion LOST a check, which is a bug
  // under any union policy. Rejecting one it accepts is the documented stance.
  if (target.divergesFromComposition) {
    if (actual && !expected) {
      return violation(
        'O18',
        target,
        ctx,
        'checkUnknowns validator accepted a value validate(v) && !hasUnknownKeys(v) rejects',
        value
      );
    }
    return null;
  }
  if (actual !== expected) {
    return violation(
      'O18',
      target,
      ctx,
      `checkUnknowns validator returned ${actual} but validate(v) && !hasUnknownKeys(v) is ${expected}`,
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
// O22–O25 — the unknown-key agreement oracles.
//
// Every one of these functions has its own emitter and its own arm per
// position, and they are supposed to give the same answer about the same key.
// They have drifted apart more than once, always at a position the shared
// merged-allowlist walk did not reach — a class member of a union was the last
// one, found by hand. A hand-written test only covers the positions someone
// thought of; these hold the functions against EACH OTHER, so a position
// nobody thought of still gets an answer that has to agree.
// =============================================================================

/** The paths one unknown-key report names, as comparable strings. **/
function reportedPaths(errors: readonly RTValidationError[]): string[] {
  return errors.map((error) => pathKey((error.path ?? []) as RTValidationErrorPathSegment[])).sort();
}

/** O22 — the probe and the report agree: `hasUnknownKeys(v)` is true exactly
 *  when `unknownKeyErrors(v)` is non-empty.
 *
 *  Both are the BLIND variants (they emit their own shape guard), so this is a
 *  true equality on any value, junk included — unlike O18, which compares the
 *  fused validator against the `runsAfterValidation` probe and so may only
 *  run after validate. Two emitters, one question: a family that stops
 *  reaching a position answers `false` / `[]` while the other still walks it. **/
export function checkUnknownKeysSelfAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {hasUnknownKeysBlind, unknownKeyErrors} = target;
  if (!hasUnknownKeysBlind || !unknownKeyErrors) return null;
  let probe: boolean;
  try {
    probe = hasUnknownKeysBlind(value);
  } catch (err) {
    return violation('O22', target, ctx, `hasUnknownKeys threw: ${errMsg(err)}`, value);
  }
  let report: RTValidationError[];
  try {
    report = unknownKeyErrors(value);
  } catch (err) {
    return violation('O22', target, ctx, `unknownKeyErrors threw: ${errMsg(err)}`, value);
  }
  if (probe !== report.length > 0) {
    return violation(
      'O22',
      target,
      ctx,
      probe
        ? 'hasUnknownKeys says there is an undeclared key but unknownKeyErrors reports none'
        : `hasUnknownKeys says the value is clean but unknownKeyErrors reports ${reportedPaths(report).join(', ')}`,
      value
    );
  }
  return null;
}

/** O23 — the planted key gets the answer its position owes.
 *
 *  The absolute half of the agreement, and the one that catches a position ALL
 *  of them miss (which O22 would call agreement). A key planted where keys are
 *  declared by name must be reported at exactly that path; a key planted into
 *  an index-signature object must be reported by nobody, because every key
 *  there IS declared. `clean` is the same value without the plant, so the
 *  comparison is a difference rather than an absolute — a target that reports
 *  something on its own mock is O22's problem, not a false alarm here. **/
export function checkUnknownKeysPlanted(
  target: FuzzTarget,
  planted: PlantedUnknownKey,
  clean: unknown,
  ctx: CheckCtx
): Violation | null {
  const {hasUnknownKeysBlind, unknownKeyErrors} = target;
  if (!hasUnknownKeysBlind || !unknownKeyErrors) return null;
  let added: string[];
  let probe: boolean;
  try {
    const before = new Set(reportedPaths(unknownKeyErrors(clean)));
    added = reportedPaths(unknownKeyErrors(planted.value)).filter((path) => !before.has(path));
    probe = hasUnknownKeysBlind(planted.value);
  } catch (err) {
    return violation('O23', target, ctx, `an unknown-keys family threw on the planted value: ${errMsg(err)}`, planted.value);
  }
  const expected = planted.kind === 'flagged' ? [pathKey(planted.path)] : [];
  if (!isDeepStrictEqual(added, expected)) {
    return violation(
      'O23',
      target,
      ctx,
      `a key planted at a ${planted.kind} position should be reported as [${expected.join(', ')}] but was reported as [${added.join(', ')}]`,
      planted.value
    );
  }
  // The probe has to have seen it too, whichever way round.
  if (planted.kind === 'flagged' && !probe)
    return violation('O23', target, ctx, `hasUnknownKeys missed the key planted at ${pathKey(planted.path)}`, planted.value);
  return null;
}

/** O24 — the report and the strip agree on WHICH keys: every path
 *  `unknownKeyErrors` names is a key `cloneExactShape` drops, and vice versa.
 *
 *  `cloneExactShape` is the public strip (it replaced the mutating
 *  `unknownKeysToUndefined`), and it walks the type with its own emitter. A
 *  position one of them reaches and the other does not shows up here as a key
 *  in one list and not the other — which is exactly the drift, made visible
 *  without anyone having to guess where it is.
 *
 *  Keys whose value is `undefined` are left out of the diff: a declared
 *  optional carrying an explicit `undefined` is allowed to come back absent
 *  from a clone, and that is a presence question rather than a declaredness
 *  one.
 *
 *  A union with object members has no clone at all (the emitter refuses it,
 *  CES001: it cannot know which declared shape to rebuild), so those targets
 *  supply no `clone` and this oracle skips them. O25 is what covers the strip
 *  side of a union. **/
export function checkUnknownKeysStripAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {unknownKeyErrors, clone} = target;
  if (!unknownKeyErrors || !clone) return null;
  let reported: string[];
  let dropped: string[];
  try {
    reported = reportedPaths(unknownKeyErrors(value));
    dropped = droppedKeyPaths(value, clone(value as never)).sort();
  } catch (err) {
    return violation('O24', target, ctx, `unknownKeyErrors or cloneExactShape threw: ${errMsg(err)}`, value);
  }
  if (!isDeepStrictEqual(reported, dropped)) {
    return violation(
      'O24',
      target,
      ctx,
      `unknownKeyErrors reports [${reported.join(', ')}] but cloneExactShape drops [${dropped.join(', ')}]`,
      value
    );
  }
  return null;
}

/** O25 — the decoder's `strip` pre-pass is blind to undeclared wire keys.
 *
 *  The one family with no public factory: `ukuw` runs inside the
 *  `strategy: 'strip'` decoder, before the restore walks the declared shape.
 *  Reaching it means going through the decoder, so the property is
 *  metamorphic rather than direct — plant undeclared keys at every plain
 *  object on the ENCODED WIRE and the strip decoder must return the same value
 *  it returned without them. A position the pre-pass does not reach leaves the
 *  key in the output and the two answers differ.
 *
 *  The anti-vacuity half is a deterministic test rather than a check here:
 *  the `preserve` decoder keeps an undeclared wire key, so a plant really did
 *  reach the wire. It cannot be a per-value check because preserve CANNOT
 *  keep one on a registered class arm — that instance is rebuilt from the
 *  type, never from the keys on the wire. **/
export function checkWireStripBlind(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  return checkWireDropsPlantedKeys(target, value, ctx, 'O25', 'the strip decoder', target.jsonEncode, target.jsonDecode);
}

/** O26 — the `compact` pair drops every key the type did not declare.
 *
 *  Compact sends a declared object as an array of its values, so most of its wire
 *  has no key names at all. Two shapes keep them: a union member (the merged
 *  branch has no single positional form) and an index-signature record. A key
 *  planted on either must not survive the decode, because a mion route on the
 *  compact wire compiles no unknown-key check and has nothing else standing
 *  between a caller's key and the handler. Same metamorphic shape as O25. **/
export function checkWireCompactBlind(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  return checkWireDropsPlantedKeys(target, value, ctx, 'O26', 'the compact decoder', target.compactEncode, target.compactDecode);
}

function checkWireDropsPlantedKeys(
  target: FuzzTarget,
  value: unknown,
  ctx: CheckCtx,
  code: OracleId,
  label: string,
  jsonEncode: FuzzTarget['jsonEncode'],
  jsonDecode: FuzzTarget['jsonDecode']
): Violation | null {
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
    // The pre-pass BLANKS an undeclared key (sets it to undefined) rather
    // than deleting it, so the comparison drops undefined-valued own keys on
    // both sides. A decoder that left the VALUE in place is still caught.
    strippedClean = withoutBlankedKeys(jsonDecode(wire));
    strippedPlanted = withoutBlankedKeys(jsonDecode(planted));
  } catch (err) {
    return violation(code, target, ctx, `${label} threw on a wire carrying undeclared keys: ${errMsg(err)}`, planted);
  }
  if (strippedClean === null || strippedClean === undefined) return null; // nothing decoded, nothing to compare
  if (!isDeepStrictEqual(strippedClean, strippedPlanted))
    return violation(
      code,
      target,
      ctx,
      `${label} did not drop ${plantedCount} undeclared wire key(s): got ${snapshot(strippedPlanted)} instead of ${snapshot(strippedClean)}`,
      planted
    );
  return null;
}

/** A copy with every undefined-valued own key removed, so a key the strip
 *  pre-pass blanked reads the same as one it never wrote. Natives are kept as
 *  they are; Maps, Sets and arrays are walked. **/
function withoutBlankedKeys(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date || value instanceof RegExp) return value;
  if (value instanceof Map) {
    const out = new Map<unknown, unknown>();
    for (const [key, entry] of value) out.set(withoutBlankedKeys(key, depth + 1), withoutBlankedKeys(entry, depth + 1));
    return out;
  }
  if (value instanceof Set) {
    const out = new Set<unknown>();
    for (const item of value) out.add(withoutBlankedKeys(item, depth + 1));
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => withoutBlankedKeys(item, depth + 1));
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) continue;
    out[key] = withoutBlankedKeys(record[key], depth + 1);
  }
  return out;
}

/** Write one undeclared key into every plain object of a parsed wire tree, and
 *  return how many were written. Blind on purpose: no type is consulted, so it
 *  reaches wire positions a type walk would have to model (a union envelope's
 *  payload, a merged object). Arrays are walked, never written into — a Map,
 *  a Set and a tuple all ride as arrays. **/
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

/** O20 — parse round-trips the encoder: whatever the JSON encoder wrote, parse
 *  must read back into the value it came from.
 *
 *  The strongest property parse has, and the cheapest: no reference
 *  implementation needed, just the pair. It is what catches a leaf whose restore
 *  and whose encode disagree on the wire form (a bigint written as a number but
 *  read as a string, say), which no hand-written case would think to try.
 *
 *  Only runs on the VALID phase — a corrupted or junk value has no encoding to
 *  round-trip. Skipped for a target without both fns. **/
export function checkParseRoundTrip(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  if (!target.parse || !target.jsonEncode) return null;
  let wire: string | undefined;
  try {
    wire = target.jsonEncode(value);
  } catch {
    return null; // O7 owns encode failures.
  }
  if (wire === undefined) return null; // no document to parse back (undefined root)
  let parsed: unknown;
  try {
    parsed = target.parse(JSON.parse(wire));
  } catch (err) {
    return violation('O20', target, ctx, `parse rejected its own encoder's output: ${errMsg(err)}`, value);
  }
  // Compared through the encoder rather than by deep equality: re-encoding
  // normalises the optional-undefined-key vs dropped-key difference the same way
  // O5 does, and undeclared keys the default `strip` strategy removed were never
  // on the wire to begin with.
  let reWire: string | undefined;
  try {
    reWire = target.jsonEncode(parsed);
  } catch (err) {
    return violation('O20', target, ctx, `re-encoding a parsed value threw: ${errMsg(err)}`, value);
  }
  if (reWire !== wire) {
    return violation(
      'O20',
      target,
      ctx,
      `parse round-trip is not stable:\n  enc1=${cut(wire)}\n  enc2=${cut(String(reWire))}`,
      value
    );
  }
  return null;
}

/** O19 — parse accepts exactly what `restoreFromJson` + `validate` accepts.
 *
 *  The mirror of O18: parse fuses restore and check into one walk, so the
 *  composition it replaces is the trusted source, and the comparison runs BOTH
 *  ways. One way alone is not enough — a parse that rejected everything would
 *  satisfy "whatever it accepted validates" without ever being caught.
 *
 *  The totality check rides along on every phase, junk included: parse may only
 *  ever fail by throwing RTParseError, never by letting a raw
 *  TypeError / SyntaxError out of a restoring leaf.
 *
 *  Every call gets its OWN copy. Restoring leaves rewrite in place (a wire
 *  string becomes a Date on the input object), so sharing one value between the
 *  two sides would compare parse against a reference that had already been
 *  half-restored — and would hand the mutated mock to the oracles that run
 *  after this one. **/
export function checkParseAgree(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  const {parse, restoreFromJson} = target;
  if (!parse) return null;

  let parsed: unknown;
  let threw = false;
  let thrownName = '';
  try {
    parsed = parse(deepCloneForRoundTrip(value));
  } catch (err) {
    threw = true;
    thrownName = err instanceof Error ? err.name : typeof err;
  }
  if (threw && thrownName !== 'RTParseError') {
    return violation('O19', target, ctx, `parse failed with a raw ${thrownName} instead of RTParseError`, value);
  }

  if (restoreFromJson) {
    let expected: boolean | undefined;
    try {
      expected = target.validate(restoreFromJson(deepCloneForRoundTrip(value)));
    } catch {
      // The reference side is undefined for this input: restoreFromJson assumes
      // well-formed data and has no guards of its own (which is the whole reason
      // parse needed them). O3 owns validate's totality.
      expected = undefined;
    }
    if (expected !== undefined && expected === threw) {
      const verb = threw ? 'rejected' : 'accepted';
      const refVerb = expected ? 'accepts' : 'rejects';
      return violation('O19', target, ctx, `parse ${verb} a value restoreFromJson + validate ${refVerb}`, value);
    }
  }

  // parse's OWN output must validate too, not merely its accept/reject decision.
  if (!threw) {
    let ok: boolean;
    try {
      ok = target.validate(parsed);
    } catch {
      return null; // O3 owns validate's totality.
    }
    if (!ok) {
      return violation('O19', target, ctx, 'parse accepted a value whose restored form fails validate', value);
    }
  }
  return null;
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

/** O6 — binary round-trip is stable on the wire (byte-for-byte). **/
export function checkBinaryStable(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  if (!target.binaryEncode || !target.binaryDecode) return null;
  let wire1: Uint8Array;
  try {
    wire1 = target.binaryEncode(value);
  } catch (err) {
    return violation('O7', target, ctx, `binaryEncode threw on a valid mock: ${errMsg(err)}`, value);
  }
  try {
    const wire2 = target.binaryEncode(target.binaryDecode(wire1));
    if (!isDeepStrictEqual(wire1, wire2)) {
      return violation('O6', target, ctx, 'binary round-trip is not byte-stable', value);
    }
  } catch (err) {
    return violation('O6', target, ctx, `binary decode/re-encode threw on valid data: ${errMsg(err)}`, value);
  }
  return null;
}

/** O12 — the JSON and binary wires must agree on the same DataOnly value. We
 *  normalise BOTH through `jsonEncode` (so optional-`undefined` vs dropped-key
 *  representation differences between the wires don't register as a mismatch):
 *  `jsonEncode(binaryDecode(binaryEncode v))` must equal `jsonEncode(v)`. Needs
 *  no projection oracle — a divergence means one wire lost or reshaped data the
 *  other kept. Throws are left to O5/O6/O7.
 *
 *  Textual equality is the fast path, not the contract. O5 compares the wire
 *  TEXT on purpose (it sidesteps the optional-`undefined` vs dropped-key
 *  mismatch), which is sound there because both its wires come out of the same
 *  encoder and so carry the same key order. Across wires that does not hold:
 *  the binary layout partitions an object's properties into required-then-
 *  optional (the presence bitmap depends on that split), so binaryDecode
 *  rebuilds in LAYOUT order while jsonEncode emits DECLARATION order. Any type
 *  declaring an optional property before a required one therefore round-trips
 *  to the same value spelled with a different key order — `{p0?, p1}` comes back
 *  as `{p1, p0}`. That is by design, and key order carries no meaning in JSON,
 *  so differing text falls through to a structural comparison and only a real
 *  value difference is a violation. **/
export function checkCrossWire(target: FuzzTarget, value: unknown, ctx: CheckCtx): Violation | null {
  if (!target.jsonEncode || !target.binaryEncode || !target.binaryDecode) return null;
  let jsonWire: string | undefined;
  let viaBinaryWire: string | undefined;
  try {
    jsonWire = target.jsonEncode(value);
    if (jsonWire === undefined) return null; // undefined root — nothing to compare
    viaBinaryWire = target.jsonEncode(target.binaryDecode(target.binaryEncode(value)));
  } catch {
    return null; // encode/decode throws are O5/O6/O7's job, not double-counted here
  }
  if (jsonWire !== viaBinaryWire && !sameJsonValue(jsonWire, viaBinaryWire)) {
    return violation(
      'O12',
      target,
      ctx,
      `JSON and binary wires disagree on the decoded value:\n  json       =${cut(jsonWire)}\n  via-binary =${cut(String(viaBinaryWire))}`,
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
