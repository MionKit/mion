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
//     O6 binary-stable      same, over the binary wire
//
//   CONSISTENCY (two functions must agree)
//     O4 errors-agree       validate(x)  ⇔  getValidationErrors(x).length === 0
//     O18 fused-agree       validate{checkUnknowns}(x) ⇔ validate(x) && !hasUnknownKeys(x)
//
//   ROBUSTNESS (totality — must never throw / hang on any input)
//     O3 validate-total     validate(anything) returns a boolean, no throw
//     O7 encode-total       encode(valid) does not throw and yields a string
//
// O1/O2 need a value of KNOWN validity (mock = valid by construction;
// `mutateToInvalid` = invalid by construction). O3/O4 also run on fully random
// junk, where validity is unknown but the property still must hold.

import {isDeepStrictEqual} from 'node:util';
import type {RunType} from '../../../src/runtypes/types.ts';

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
  jsonEncode?: (value: unknown) => string | undefined;
  jsonDecode?: (serialized: string) => unknown;
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
  | 'O21'
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
  phase: 'valid' | 'invalid' | 'extras' | 'junk' | 'compile';
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
