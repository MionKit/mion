import {getRunTypeId} from '@ts-runtypes/core';

export {};

// 1 — Required<T> strips optionality from every prop.
type R1 = Required<{a?: string; b?: number}>;
const requiredStrips = getRunTypeId<R1>();
declare const r1: R1;
const requiredStripsReflect = getRunTypeId(r1);

// 2 — Required<Pick<…>> chains: only picked + required.
type S2 = {a?: string; b?: number};
type R2 = Required<Pick<S2, 'a'>>;
const requiredOnSubset = getRunTypeId<R2>();

// 3 — Partial<T> adds optionality.
type R3 = Partial<{a: string; b: number}>;
const partialAdds = getRunTypeId<R3>();

// 4 — Readonly<T> marks props readonly.
type R4 = Readonly<{a: string}>;
const readonlyAdds = getRunTypeId<R4>();

// 5 — Readonly<T> preserves optionality on already-optional props.
type R5 = Readonly<{a?: string}>;
const readonlyPreservesOptional = getRunTypeId<R5>();

// 6 — Pick keeps modifiers on retained props.
type S6 = {readonly a: string; b?: number};
type R6 = Pick<S6, 'a'>;
const pickPreserves = getRunTypeId<R6>();

// 7 — Omit drops the named prop, preserves modifiers on retained props.
type S7 = {a: string; readonly b: number};
type R7 = Omit<S7, 'a'>;
const omitPreserves = getRunTypeId<R7>();

// 8 — User mapped type that strips optional via `-?`.
type Req<T> = {[P in keyof T]-?: T[P]};
type R8 = Req<{a?: string}>;
const userReq = getRunTypeId<R8>();

// 9 — User mapped type that strips readonly via `-readonly`.
type Mut<T> = {-readonly [P in keyof T]: T[P]};
type R9 = Mut<{readonly a: string}>;
const userMut = getRunTypeId<R9>();

// 10 — User mapped type that adds optional via `+?`.
type Opt<T> = {[P in keyof T]+?: T[P]};
type R10 = Opt<{a: string}>;
const userOpt = getRunTypeId<R10>();

// 11 — User mapped type that adds readonly via `+readonly`.
type RO<T> = {+readonly [P in keyof T]: T[P]};
type R11 = RO<{a: string}>;
const userRO = getRunTypeId<R11>();

export const __sites = {
  requiredStrips,
  requiredStripsReflect,
  requiredOnSubset,
  partialAdds,
  readonlyAdds,
  readonlyPreservesOptional,
  pickPreserves,
  omitPreserves,
  userReq,
  userMut,
  userOpt,
  userRO,
};
