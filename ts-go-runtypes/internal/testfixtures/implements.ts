import {getRunTypeId} from '@ts-runtypes/core';

export {};

// 1 — Class implements a single interface.
interface I1 {
  a: string;
}
class C1 implements I1 {
  a: string = '';
}
const singleImplements = getRunTypeId<C1>();
declare const c1: C1;
const singleImplementsReflect = getRunTypeId(c1);

// 2 — Class implements multiple interfaces (order preserved).
interface I2A {
  a: string;
}
interface I2B {
  b: number;
}
class C2 implements I2A, I2B {
  a: string = '';
  b: number = 0;
}
const multiImplements = getRunTypeId<C2>();

// 3 — implements does NOT flatten interface members into the class's
// declared properties. Children must reflect what C3 declares only.
interface I3 {
  a: string;
  b: number;
}
class C3 implements I3 {
  a: string = '';
  b: number = 0;
  c: boolean = false;
}
const implementsKeepsOwnProps = getRunTypeId<C3>();

// 4 — Class with both extends AND implements.
interface I4 {
  tag: 'i';
}
class B4 {
  x: string = '';
}
class C4 extends B4 implements I4 {
  tag: 'i' = 'i';
}
const extendsAndImplements = getRunTypeId<C4>();

// 5 — Plain class with no implements clause.
class C5 {
  x: string = '';
}
const plainNoImplements = getRunTypeId<C5>();

export const __sites = {
  singleImplements,
  singleImplementsReflect,
  multiImplements,
  implementsKeepsOwnProps,
  extendsAndImplements,
  plainNoImplements,
};
