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

// Tuple whose first slot is a unique literal — gives the tuple a unique id.
type TupleTarget = ['tupleOverride', number, string];

overrideValidate<TupleTarget>((v): v is TupleTarget => Array.isArray(v) && (v as unknown[])[1] === 1);
overrideGetValidationErrors<TupleTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});
overrideJsonEncoder<TupleTarget>((v) => 'OVR' + JSON.stringify(v));
overrideJsonDecoder<TupleTarget>((serialized) => JSON.parse((serialized as string).slice(3)) as never);
overrideBinaryEncoder<TupleTarget>((value, Ser) => {
  Ser.serString(JSON.stringify(value));
  return Ser;
});
overrideBinaryDecoder<TupleTarget>((ret, Des) => JSON.parse(Des.desString()) as never);

export const TUPLE_OVERRIDE: OverrideCase = {
  title: 'Tuples',
  validate: () => createValidateFn<TupleTarget>(),
  validateSamples: {pass: [['tupleOverride', 1, 'x']], fail: [['tupleOverride', 2, 'x'], null]},
  getValidationErrors: () => createGetValidationErrorsFn<TupleTarget>(),
  errorsValue: ['tupleOverride', 1, 'x'],
  jsonEncoder: () => createJsonEncoderFn<TupleTarget>(),
  jsonDecoder: () => createJsonDecoderFn<TupleTarget>(),
  jsonValue: ['tupleOverride', 1, 'x'],
  jsonString: 'OVR' + JSON.stringify(['tupleOverride', 1, 'x']),
  binaryEncoder: () => createBinaryEncoderFn<TupleTarget>(),
  binaryDecoder: () => createBinaryDecoderFn<TupleTarget>(),
  binaryValue: ['tupleOverride', 3, 'y'],
};
