import {getRunTypeId} from '@ts-runtypes/core';

export {};

// ---- class extends -----------------------------------------------------

// 1 — Plain class inheritance.
class A1 {
  a: string = '';
}
class B1 extends A1 {
  b: number = 0;
}
const classBasic = getRunTypeId<B1>();
declare const b1: B1;
const classBasicReflect = getRunTypeId(b1);

// 2 — Override: child narrows parent's prop type to a literal.
class A2 {
  name: string = '';
}
class B2 extends A2 {
  name: 'fixed' = 'fixed';
}
const classOverride = getRunTypeId<B2>();

// 3 — Chained inheritance: C → B → A. All ancestor props on C.
class A3 {
  a: string = '';
}
class B3 extends A3 {
  b: number = 0;
}
class C3 extends B3 {
  c: boolean = false;
}
const classChained = getRunTypeId<C3>();

// 4 — Generic parent.
class A4<T> {
  value!: T;
}
class B4 extends A4<string> {
  extra: number = 0;
}
const classGeneric = getRunTypeId<B4>();

// ---- interface extends -------------------------------------------------

// 5 — Single-parent interface extension.
interface IA1 {
  a: string;
}
interface IB1 extends IA1 {
  b: number;
}
const interfaceBasic = getRunTypeId<IB1>();
declare const ib1: IB1;
const interfaceBasicReflect = getRunTypeId(ib1);

// 6 — Multiple parents.
interface IA2 {
  a: string;
}
interface IB2 {
  b: number;
}
interface IC2 extends IA2, IB2 {
  c: boolean;
}
const interfaceMulti = getRunTypeId<IC2>();

// 7 — Diamond inheritance — A appears once in flattened children.
interface IA3 {
  a: string;
}
interface IB3 extends IA3 {
  b: number;
}
interface IC3 extends IA3 {
  c: boolean;
}
interface ID3 extends IB3, IC3 {
  d: bigint;
}
const interfaceDiamond = getRunTypeId<ID3>();

// 8 — Property override on interface extension.
interface IA4 {
  x: string;
}
interface IB4 extends IA4 {
  x: 'a' | 'b';
}
const interfaceOverride = getRunTypeId<IB4>();

// 9 — type aliases never carry the Extends slot (compare to interfaces).
type TAlias = {a: string};
const noExtendsAlias = getRunTypeId<TAlias>();

// 10 — anonymous object literals never carry Extends.
const noExtendsAnonymous = getRunTypeId<{a: string}>();

export const __sites = {
  classBasic,
  classBasicReflect,
  classOverride,
  classChained,
  classGeneric,
  interfaceBasic,
  interfaceBasicReflect,
  interfaceMulti,
  interfaceDiamond,
  interfaceOverride,
  noExtendsAlias,
  noExtendsAnonymous,
};
