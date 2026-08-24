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

// Branded interface — the `__brand` literal gives it a unique structural id.
type InterfaceTarget = {readonly __brand: 'interfaceOverride'; a: number; b: string};

overrideValidate<InterfaceTarget>((v): v is InterfaceTarget => (v as {a?: number} | null)?.a === 1);
overrideGetValidationErrors<InterfaceTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});
overrideJsonEncoder<InterfaceTarget>((v) => 'OVR' + JSON.stringify(v));
overrideJsonDecoder<InterfaceTarget>((serialized) => JSON.parse((serialized as string).slice(3)) as never);
overrideBinaryEncoder<InterfaceTarget>((value, Ser) => {
  Ser.serString(JSON.stringify(value));
  return Ser;
});
overrideBinaryDecoder<InterfaceTarget>((ret, Des) => JSON.parse(Des.desString()) as never);

export const INTERFACE_OVERRIDE: OverrideCase = {
  title: 'Interface',
  validate: () => createValidateFn<InterfaceTarget>(),
  validateSamples: {pass: [{a: 1, b: 'x'}], fail: [{a: 2, b: 'x'}, null]},
  getValidationErrors: () => createGetValidationErrorsFn<InterfaceTarget>(),
  errorsValue: {a: 1, b: 'x'},
  jsonEncoder: () => createJsonEncoderFn<InterfaceTarget>(),
  jsonDecoder: () => createJsonDecoderFn<InterfaceTarget>(),
  jsonValue: {a: 7},
  jsonString: 'OVR' + JSON.stringify({a: 7}),
  binaryEncoder: () => createBinaryEncoderFn<InterfaceTarget>(),
  binaryDecoder: () => createBinaryDecoderFn<InterfaceTarget>(),
  binaryValue: {a: 1, b: 'y'},
};
