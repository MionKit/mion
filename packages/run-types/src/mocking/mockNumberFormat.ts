// Mock for the number format family: the walker calls it with the FormatAnnotation only when the runtype is
// branded, and an `undefined` return defers to the kind-default `mockNumber`.
// Ports the reference NumberRunTypeFormat._mock (numberFormat.runtype.ts:193-232).
import {RunTypeKind} from '../go-generated/runTypeKind.generated.ts';
import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';
import {registerMockingFunction} from './mockRegistry.ts';
import {nativeMockRandom} from './mockRandom.ts';
import type {MockRandom} from './mockRandom.ts';
import type {NumberParams} from '../formats/numberFormats.ts';
import {isMultipleOf} from './isMultipleOf.ts';

const mockNumberFormat = (annotation: FormatAnnotation, random: MockRandom = nativeMockRandom): unknown => {
  if (annotation.name !== 'numberFormat') return undefined;
  // isCurrency is presentation metadata, so a Currency mock is the same constraint-respecting draw.
  return mockNumberParams((annotation.params ?? {}) as NumberParams, random);
};

registerMockingFunction(RunTypeKind.number, mockNumberFormat);

// Returns a number satisfying every constraint, so the mock round-trips through validate; mirrors the reference _mock.
function mockNumberParams(params: NumberParams, random: MockRandom): number {
  let min = params.min !== undefined ? numVal(params.min) : -99999;
  let max = params.max !== undefined ? numVal(params.max) : 99999;

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

  if (params.multipleOf !== undefined) {
    const tolerance = params.multipleOfTolerance !== undefined ? numVal(params.multipleOfTolerance) : undefined;
    result = snapToMultiple(result, numVal(params.multipleOf), tolerance);
  }
  return result;
}

// An integer divisor multiplies back exactly; a fractional one does not (`75 * 0.0001` is 0.007500000000000001,
// quotient 75.00000000000001). Rounding to 15 significant digits clears that noise, isMultipleOf is the validator's
// own rule, the walk down covers the rare divisor where one rounding is not enough, and 0 is the last resort: zero
// is a multiple of everything.
function snapToMultiple(value: number, multipleOf: number, tolerance: number | undefined): number {
  const quotient = Math.floor(value / multipleOf);
  if (Number.isInteger(multipleOf)) return quotient * multipleOf;
  for (let step = 0; step < 4; step++) {
    const candidate = Number(((quotient - step) * multipleOf).toPrecision(15));
    if (isMultipleOf(candidate, multipleOf, tolerance)) return candidate;
  }
  return 0;
}

// numVal unwraps the `{val, …}` paramVal form: NumberParams is plain `number`, but the wire may carry a meta object.
function numVal(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value !== null && typeof value === 'object' && 'val' in value) return numVal((value as {val: unknown}).val);
  return Number(value);
}
