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

// Branded number — unique id, so the global override never reaches plain `number`.
type AtomicTarget = number & {readonly __brand: 'atomicOverride'};

overrideValidate<AtomicTarget>((v): v is AtomicTarget => v === 42);
overrideGetValidationErrors<AtomicTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});
overrideJsonEncoder<AtomicTarget>((v) => 'OVR' + JSON.stringify(v));
overrideJsonDecoder<AtomicTarget>((serialized) => JSON.parse((serialized as string).slice(3)) as never);
overrideBinaryEncoder<AtomicTarget>((value, Ser) => {
  Ser.serString(JSON.stringify(value));
  return Ser;
});
overrideBinaryDecoder<AtomicTarget>((ret, Des) => JSON.parse(Des.desString()) as never);

export const ATOMIC_OVERRIDE: OverrideCase = {
  title: 'Atomic',
  validate: () => createValidateFn<AtomicTarget>(),
  validateSamples: {pass: [42], fail: [7, '42', null]},
  getValidationErrors: () => createGetValidationErrorsFn<AtomicTarget>(),
  errorsValue: 1,
  jsonEncoder: () => createJsonEncoderFn<AtomicTarget>(),
  jsonDecoder: () => createJsonDecoderFn<AtomicTarget>(),
  jsonValue: 5,
  jsonString: 'OVR5',
  binaryEncoder: () => createBinaryEncoderFn<AtomicTarget>(),
  binaryDecoder: () => createBinaryDecoderFn<AtomicTarget>(),
  binaryValue: 3.5,
};
