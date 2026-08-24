// Mock entry point for the bigint format family. Registered for
// ReflectionKind.bigint via `registerMockingFunction`; called with the
// FormatAnnotation only when the runtype is branded, and a `undefined`
// return defers to the kind-default `mockBigInt`. Ports the reference
// BigIntRunTypeFormat._mock (bigIntFormat.runtype.ts:155-187).
//
// Bigint params arrive on the wire as STRINGS (tsgo's TypeToString, e.g.
// "9223372036854775807n") — `toBig` strips the trailing `n` and rebuilds
// the bigint, preserving full precision.
import {RunTypeKind} from '../go-generated/runTypeKind.generated.ts';
import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';
import {registerMockingFunction} from './mockRegistry.ts';
import {nativeMockRandom} from './mockRandom.ts';
import type {MockRandom} from './mockRandom.ts';
import type {BigIntParams} from '../formats/bigintFormats.ts';

const mockBigIntFormat = (annotation: FormatAnnotation, random: MockRandom = nativeMockRandom): unknown => {
  if (annotation.name !== 'bigintFormat') return undefined;
  return mockBigIntParams((annotation.params ?? {}) as BigIntParams, random);
};

registerMockingFunction(RunTypeKind.bigint, mockBigIntFormat);

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

// mockBigIntParams returns a bigint satisfying every constraint. Random
// generation runs in the safe-integer Number range (the documented
// limitation) then converts back to bigint.
function mockBigIntParams(params: BigIntParams, random: MockRandom): bigint {
  let min = params.min !== undefined ? toBig(params.min) : -99999n;
  let max = params.max !== undefined ? toBig(params.max) : 99999n;

  // Adjust for exclusive bounds.
  if (params.gt !== undefined) min = toBig(params.gt) + 1n;
  if (params.lt !== undefined) max = toBig(params.lt) - 1n;

  // Clamp to the safe-integer range for Number-based randomness.
  const minNum = Number(min > MIN_SAFE ? min : MIN_SAFE);
  const maxNum = Number(max < MAX_SAFE ? max : MAX_SAFE);
  let result = BigInt(random.int(minNum, maxNum));

  // Snap to the largest multiple of multipleOf <= result.
  if (params.multipleOf !== undefined) {
    const multipleOf = toBig(params.multipleOf);
    result = (result / multipleOf) * multipleOf;
  }
  return result;
}

// toBig coerces a wire param to a bigint: a bigint passes through; a
// string (the wire form) has its trailing `n` stripped; a meta object is
// unwrapped; a number is truncated.
function toBig(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (value !== null && typeof value === 'object' && 'val' in value) return toBig((value as {val: unknown}).val);
  return BigInt(String(value).replace(/n$/, ''));
}
