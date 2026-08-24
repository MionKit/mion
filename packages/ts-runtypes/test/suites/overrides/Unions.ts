import {
  createValidateFn,
  overrideValidate,
  createGetValidationErrorsFn,
  overrideGetValidationErrors,
  createJsonEncoderFn,
  overrideJsonEncoder,
  createJsonDecoderFn,
  overrideJsonDecoder,
  createBinaryEncoderFn,
  overrideBinaryEncoder,
  createBinaryDecoderFn,
  overrideBinaryDecoder,
} from '@ts-runtypes/core';
import type {OverrideCase} from './types.ts';

// Discriminated union with unique tags — the tags give it a unique id.
type UnionTarget = {tag: 'unionOverrideA'; x: number} | {tag: 'unionOverrideB'; y: string};

overrideValidate<UnionTarget>((v): v is UnionTarget => (v as {tag?: string} | null)?.tag === 'unionOverrideA');
overrideGetValidationErrors<UnionTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});
overrideJsonEncoder<UnionTarget>((v) => 'OVR' + JSON.stringify(v));
overrideJsonDecoder<UnionTarget>((serialized) => JSON.parse((serialized as string).slice(3)) as never);
overrideBinaryEncoder<UnionTarget>((value, Ser) => {
  Ser.serString(JSON.stringify(value));
  return Ser;
});
overrideBinaryDecoder<UnionTarget>((ret, Des) => JSON.parse(Des.desString()) as never);

export const UNION_OVERRIDE: OverrideCase = {
  title: 'Unions',
  validate: () => createValidateFn<UnionTarget>(),
  validateSamples: {pass: [{tag: 'unionOverrideA', x: 1}], fail: [{tag: 'unionOverrideB', y: 'z'}, null]},
  getValidationErrors: () => createGetValidationErrorsFn<UnionTarget>(),
  errorsValue: {tag: 'unionOverrideA', x: 1},
  jsonEncoder: () => createJsonEncoderFn<UnionTarget>(),
  jsonDecoder: () => createJsonDecoderFn<UnionTarget>(),
  jsonValue: {tag: 'unionOverrideA', x: 1},
  jsonString: 'OVR' + JSON.stringify({tag: 'unionOverrideA', x: 1}),
  binaryEncoder: () => createBinaryEncoderFn<UnionTarget>(),
  binaryDecoder: () => createBinaryDecoderFn<UnionTarget>(),
  binaryValue: {tag: 'unionOverrideB', y: 'y'},
};
