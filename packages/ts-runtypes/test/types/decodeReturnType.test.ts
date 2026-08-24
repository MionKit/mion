// Decoder return-type contract — `createJsonDecoderFn<T>()` and
// `createBinaryDecoderFn<T>()` return the DATA-ONLY PROJECTION `DataOnly<T>`, not
// the bare `T`. A decoded value is reconstructed from JSON / bytes, so it can
// only ever hold serialisable data — never the methods / `Promise`s / symbols /
// non-serialisable built-ins `T` may declare. Annotating the return as
// `DataOnly<T>` makes the signature TELL THE TRUTH (the old `=> T` over-promised
// members the value doesn't have, so calling e.g. a method type-checked but threw).
//
// This is a TYPE-LEVEL guarantee: the `Expect<Equal<…>>` aliases below are
// enforced by the `typecheck:test` pass (vitest erases types, so it can't catch
// them). The single runtime `it` keeps the file in the normal suite. Unlike the
// `dataonly.compile.test.ts` budget harness — which exercises `DataOnly` in
// ISOLATION — this binds the projection to the REAL decoder factories, proving
// the wiring (overload return = `DataOnly<T>`, identity on clean DTOs).

import {describe, it, expect} from 'vitest';
import {createJsonDecoderFn, createBinaryDecoderFn, type DataOnly} from '@ts-runtypes/core';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Assignable<A, B> = A extends B ? true : false;

// The value a decoder hands back, derived from the REAL factory signature:
// `createXDecoder<T>()` → `XDecoderFn<DataOnly<T>>` → its call returns `DataOnly<T>`.
type JsonDecoded<T> = ReturnType<ReturnType<typeof createJsonDecoderFn<T>>>;
type BinaryDecoded<T> = ReturnType<ReturnType<typeof createBinaryDecoderFn<T>>>;

// --- Clean DTO: projection is the IDENTITY, so the signature is unchanged. ---
interface CleanUser {
  id: number;
  name: string;
  active: boolean;
  tags: string[];
  meta: {created: number; note: string};
}
type _cleanJson = Expect<Equal<JsonDecoded<CleanUser>, CleanUser>>;
type _cleanBin = Expect<Equal<BinaryDecoded<CleanUser>, CleanUser>>;

// --- Method member: dropped (JSON drops it on the wire; the decoded value
//     genuinely has no method). The return no longer over-promises it. ---
interface WithMethod {
  a: string;
  greet(): void;
}
type _methodJson = Expect<Equal<JsonDecoded<WithMethod>, {a: string}>>;
type _methodBin = Expect<Equal<BinaryDecoded<WithMethod>, {a: string}>>;
// The OLD `=> T` was unsound: the decoded value is NOT a full `WithMethod`
// (no `greet`), and the projected return correctly reflects that.
type _methodUnsound = ExpectFalse<Assignable<JsonDecoded<WithMethod>, WithMethod>>;

// --- Promise member: dropped (a decoded value can't carry a live Promise). ---
interface WithPromise {
  a: string;
  pending: Promise<number>;
}
type _promiseJson = Expect<Equal<JsonDecoded<WithPromise>, {a: string}>>;

// --- Nested non-data member: stripped at the nested position, recursively. ---
interface Nested {
  outer: string;
  inner: {keep: number; fn: () => void};
}
type _nestedJson = Expect<Equal<JsonDecoded<Nested>, {outer: string; inner: {keep: number}}>>;
type _nestedBin = Expect<Equal<BinaryDecoded<Nested>, {outer: string; inner: {keep: number}}>>;

// --- Array element projection. ---
type _arrayJson = Expect<Equal<JsonDecoded<Array<{v: number; fn: () => void}>>, {v: number}[]>>;

// --- Map / Set value projection (decoder keeps the collection, projects values). ---
type _mapJson = Expect<Equal<JsonDecoded<Map<string, {id: string; m(): void}>>, Map<string, {id: string}>>>;
type _setBin = Expect<Equal<BinaryDecoded<Set<{id: string; run(): Promise<void>}>>, Set<{id: string}>>>;

// --- Decoder return is exactly `DataOnly<T>` (the wiring, for an arbitrary T). ---
type _wireJson = Expect<Equal<JsonDecoded<WithMethod>, DataOnly<WithMethod>>>;
type _wireBin = Expect<Equal<BinaryDecoded<Nested>, DataOnly<Nested>>>;

describe('decoder return type — createJsonDecoderFn/createBinaryDecoderFn return DataOnly<T>', () => {
  it('is enforced at type-check time (see the Expect<Equal<…>> aliases above)', () => {
    // The guarantee is purely type-level (enforced by `typecheck:test`); this
    // runtime assertion keeps the file in the normal vitest suite.
    expect(true).toBe(true);
  });
});
