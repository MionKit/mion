import {getRunTypeId, type InjectRunTypeId} from '@ts-runtypes/core';

export {};

// 17ba — direct reflect call, T inferred from val.
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = getRunTypeId(u);

// 17bb — reflect on a primitive.
const s: string = 'hello';
const b = getRunTypeId(s);

// 17bc — user-defined wrapper. Same opt-in rule as f17 — the trailing
// `id?: InjectRunTypeId<T>` is what the scanner looks at; the callee identity
// is irrelevant.
function validate<T>(_v: unknown, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = validate<{flag: boolean}>(true);

// 17bd — wrapper with T inferred from a value argument.
function nameOf<T>(_val: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});

// 17be — reflect inside a generic body. `T` is a free outer type parameter,
// so this must be SKIPPED.
function inner<T>(val: T): InjectRunTypeId<T> {
  return getRunTypeId<T>(val);
}

// 17bf — foreign `InjectRunTypeId` lookalike — declared outside the marker module.
// The scanner must ignore this even with a value passed.
type RunTypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RunTypeId_Local<T>): void {}
maskedWrapper('noop');
