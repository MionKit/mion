import {getRunTypeId} from '@mionjs/run-types';

export {};

// 1 — Two object literals merge into a single objectLiteral with both props.
type AB = {a: string} & {b: number};
const merged = getRunTypeId<AB>();

// 1b — Reflect form: the same shape resolved via runtime value path.
declare const mergedValue: AB;
const mergedReflect = getRunTypeId(mergedValue);

// 2 — Interface × object literal also merges.
interface HasA {
  a: string;
}
type IfaceAndObj = HasA & {b: number};
const ifaceMerge = getRunTypeId<IfaceAndObj>();

// 3 — Class × object literal merges, surfaces as objectLiteral or class.
class HasX {
  x: string = '';
}
type ClassAndObj = HasX & {y: number};
const classMerge = getRunTypeId<ClassAndObj>();

// 4 — Primitive × brand (single decorator).
type Email = string & {readonly __brand: 'Email'};
const branded = getRunTypeId<Email>();

// 5 — Primitive × multiple brands (decorator order preserved).
type MultiTag = string & {readonly __a: 1} & {readonly __b: 2};
const multiBrand = getRunTypeId<MultiTag>();

// 6 — Number × brand (nominal number id).
type UserId = number & {readonly __nominal: 'Id'};
const numberBrand = getRunTypeId<UserId>();

// 7 — Optional prop on one side stays optional after merge.
//   {a:string, b?:number} & {c:boolean} → {a, b?, c}
type OptionalMerge = {a: string; b?: number} & {c: boolean};
const optionalMerge = getRunTypeId<OptionalMerge>();

// 8 — readonly on one side surfaces on the merged property.
//   {readonly id:number} & {name:string} → {readonly id, name}
type ReadonlyMerge = {readonly id: number} & {name: string};
const readonlyMerge = getRunTypeId<ReadonlyMerge>();

// 9 — Intersection containing an index signature.
//   {[k:string]:number} & {tag:string} — merged result keeps the index
//   signature and the explicit property.
type IndexSigMerge = {[k: string]: number | string} & {tag: string};
const indexSigMerge = getRunTypeId<IndexSigMerge>();

// 10 — Incompatible primitives collapse to never.
type Never1 = string & number;
const conflictNever = getRunTypeId<Never1>();

// 11 — never inside the intersection short-circuits to never.
type Never2 = never & {x: 1};
const neverMember = getRunTypeId<Never2>();

// 12 — Primitive × literal of same base narrows to the literal.
type LiteralNarrow = string & 'hello';
const literalNarrow = getRunTypeId<LiteralNarrow>();

// 13 — Distribution: (literal-union) & primitive → filtered union.
type Distributed = ('a' | 'b') & string;
const distributed = getRunTypeId<Distributed>();

// 14 — Distribution with one branch dying: ('a' | 1) & string → 'a'.
type DistributedFiltered = ('a' | 1) & string;
const distributedFiltered = getRunTypeId<DistributedFiltered>();

// 15 — Commutativity: A & B and B & A must share a hash.
type AandB = {a: string} & {b: number};
type BandA = {b: number} & {a: string};
const ab = getRunTypeId<AandB>();
const ba = getRunTypeId<BandA>();

// silence unused-var warnings without altering bytecode shape
export const __sites = {
  merged,
  mergedReflect,
  ifaceMerge,
  classMerge,
  branded,
  multiBrand,
  numberBrand,
  optionalMerge,
  readonlyMerge,
  indexSigMerge,
  conflictNever,
  neverMember,
  literalNarrow,
  distributed,
  distributedFiltered,
  ab,
  ba,
};
