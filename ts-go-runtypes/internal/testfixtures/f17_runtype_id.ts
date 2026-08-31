import {getRunTypeId, type InjectRunTypeId} from '@mionjs/run-types';

export {};

// 17a — static call with explicit type argument.
const a = getRunTypeId<{id: number; name: string}>();

// 17b — static call with a primitive type argument.
const b = getRunTypeId<string>();

// 17c — user-defined wrapper. The trailing `id?: InjectRunTypeId<T>` opts the
// function into transformer injection at every call site, just like
// getRunTypeId itself.
function validate<T>(_v: unknown, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = validate<{flag: boolean}>(true);

// 17d — wrapper used with T inferred from an argument.
function nameOf<T>(_val: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});

// 17e — call inside a generic body. `T` is the *outer* free type parameter,
// so this must be SKIPPED by the scanner — there's nothing to inject yet.
function inner<T>(_val: T): InjectRunTypeId<T> {
  return getRunTypeId<T>();
}

// 17f — collision: a user-defined type also named `InjectRunTypeId`, declared
// outside the marker module. The scanner must ignore this — only the
// `mion` one counts.
type RunTypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RunTypeId_Local<T>): void {}
maskedWrapper('noop');
