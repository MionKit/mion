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

// Self-referential type — the override of the recursive type itself; the cfn
// redirect replaces the whole walker, and its id folds through the cycle.
type CircularTarget = {readonly __brand: 'circularOverride'; label: string; next: CircularTarget | null};

overrideValidate<CircularTarget>((v): v is CircularTarget => (v as {label?: string} | null)?.label === 'ok');
overrideGetValidationErrors<CircularTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});
overrideJsonEncoder<CircularTarget>((v) => 'OVR' + JSON.stringify(v));
overrideJsonDecoder<CircularTarget>((serialized) => JSON.parse((serialized as string).slice(3)) as never);
overrideBinaryEncoder<CircularTarget>((value, Ser) => {
  Ser.serString(JSON.stringify(value));
  return Ser;
});
overrideBinaryDecoder<CircularTarget>((ret, Des) => JSON.parse(Des.desString()) as never);

export const CIRCULAR_OVERRIDE: OverrideCase = {
  title: 'Circular',
  validate: () => createValidateFn<CircularTarget>(),
  validateSamples: {pass: [{label: 'ok', next: null}], fail: [{label: 'no', next: null}, null]},
  getValidationErrors: () => createGetValidationErrorsFn<CircularTarget>(),
  errorsValue: {label: 'ok', next: null},
  jsonEncoder: () => createJsonEncoderFn<CircularTarget>(),
  jsonDecoder: () => createJsonDecoderFn<CircularTarget>(),
  jsonValue: {label: 'x', next: null},
  jsonString: 'OVR' + JSON.stringify({label: 'x', next: null}),
  binaryEncoder: () => createBinaryEncoderFn<CircularTarget>(),
  binaryDecoder: () => createBinaryDecoderFn<CircularTarget>(),
  binaryValue: {label: 'L', next: {label: 'M', next: null}},
};
