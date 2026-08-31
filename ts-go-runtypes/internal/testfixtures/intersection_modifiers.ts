import {getRunTypeId} from '@mionjs/run-types';

export {};

// 1 — optional & required → required.
type M1 = {a?: string} & {a: string};
const requiredWins = getRunTypeId<M1>();
declare const m1: M1;
const requiredWinsReflect = getRunTypeId(m1);

// 2 — both sides optional → stays optional.
type M2 = {a?: string} & {a?: string};
const bothOptional = getRunTypeId<M2>();

// 3 — both sides required → stays required.
type M3 = {a: string} & {a: string};
const bothRequired = getRunTypeId<M3>();

// 4 — readonly & writable → WRITABLE wins (TS intersection rule: if any
// constituent is not readonly, the merged prop loses readonly).
type M4 = {readonly a: string} & {a: string};
const writableWins = getRunTypeId<M4>();

// 5 — both readonly → stays readonly.
type M5 = {readonly a: string} & {readonly a: string};
const bothReadonly = getRunTypeId<M5>();

// 6 — readonly+optional × writable+required → required (required wins)
// AND writable (writable wins for the readonly axis).
type M6 = {readonly a?: string} & {a: string};
const requiredAndWritable = getRunTypeId<M6>();

// 7 — wider × narrower → narrows to the literal.
type M7 = {a: string} & {a: 'x'};
const narrowsToLiteral = getRunTypeId<M7>();

// 8 — incompatible primitives on a shared prop → prop type is `never`.
type M8 = {a: string} & {a: number};
const neverOnConflict = getRunTypeId<M8>();

// 9 — private × public on classes (edge case — must not crash).
class A9 {
  private x = 1;
}
class B9 {
  x = 2;
}
type M9 = A9 & B9;
const classVisibilityIntersect = getRunTypeId<M9>();

export const __sites = {
  requiredWins,
  requiredWinsReflect,
  bothOptional,
  bothRequired,
  writableWins,
  bothReadonly,
  requiredAndWritable,
  narrowsToLiteral,
  neverOnConflict,
  classVisibilityIntersect,
};
