// Mock entry point for the number format family. Registered for
// ReflectionKind.number via `registerMockingFunction`; the mock walker
// calls it with the FormatAnnotation only when the runtype is branded,
// and a `undefined` return defers to the kind-default `mockNumber`.
// Ports the reference NumberRunTypeFormat._mock (numberFormat.runtype.ts:193-232)
// as a pure function (the project's class→switch convention).
import {RunTypeKind} from '../go-generated/runTypeKind.generated.ts';
import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';
import {registerMockingFunction} from './mockRegistry.ts';
import {nativeMockRandom} from './mockRandom.ts';
import type {MockRandom} from './mockRandom.ts';
import type {NumberParams} from '../formats/numberFormats.ts';

const mockNumberFormat = (annotation: FormatAnnotation, random: MockRandom = nativeMockRandom): unknown => {
  if (annotation.name !== 'numberFormat') return undefined;
  // isCurrency is presentation metadata — mockNumberParams reads only the
  // constraint params, so a Currency mock is the same constraint-respecting draw.
  return mockNumberParams((annotation.params ?? {}) as NumberParams, random);
};

registerMockingFunction(RunTypeKind.number, mockNumberFormat);

// mockNumberParams returns a number satisfying every constraint, so the
// mock round-trips through validate. Mirrors the reference _mock exactly.
function mockNumberParams(params: NumberParams, random: MockRandom): number {
  let min = params.min !== undefined ? numVal(params.min) : -99999;
  let max = params.max !== undefined ? numVal(params.max) : 99999;

  // Adjust for exclusive bounds (epsilon depends on integer vs float).
  if (params.gt !== undefined) {
    const epsilon = params.float ? 0.01 : 1;
    min = Math.max(min, numVal(params.gt) + epsilon);
  }
  if (params.lt !== undefined) {
    const epsilon = params.float ? 0.01 : 1;
    max = Math.min(max, numVal(params.lt) - epsilon);
  }

  let result: number;
  if (params.integer) {
    min = Math.ceil(min);
    max = Math.floor(max);
    result = random.int(min, max);
  } else {
    result = min + random.float() * (max - min);
  }

  // Snap down to the largest multiple of multipleOf that is <= result.
  if (params.multipleOf !== undefined) {
    result = snapToMultiple(result, numVal(params.multipleOf));
  }
  return result;
}

// An integer divisor multiplies back exactly, so it keeps the plain floor. A
// fractional one does not: `75 * 0.0001` is 0.007500000000000001, whose
// quotient is 75.00000000000001, and the mock would then fail the very
// validator it was generated for (~11% of draws). Rounding the product back to
// 15 significant digits clears that noise; the walk down covers the rare
// divisor where one rounding is not enough, and 0 is the last resort — zero is
// a multiple of everything.
function snapToMultiple(value: number, multipleOf: number): number {
  const quotient = Math.floor(value / multipleOf);
  if (Number.isInteger(multipleOf)) return quotient * multipleOf;
  for (let step = 0; step < 4; step++) {
    const candidate = Number(((quotient - step) * multipleOf).toPrecision(15));
    if (Number.isInteger(candidate / multipleOf)) return candidate;
  }
  return 0;
}

// numVal unwraps the `{val, …}` meta-object form (the paramVal); the
// public NumberParams type is plain `number`, but the wire may carry a
// meta object.
function numVal(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value !== null && typeof value === 'object' && 'val' in value) return numVal((value as {val: unknown}).val);
  return Number(value);
}
