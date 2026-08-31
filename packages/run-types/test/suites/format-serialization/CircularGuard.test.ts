// format-serialization / CircularGuard — the circular guard is format-agnostic,
// so a recursive type with a branded (uuid) leaf throws/encodes like the plain
// serialization cases.
import {describe, it} from 'vitest';
import {CIRCULAR_GUARD} from './CircularGuard.ts';
import {assertCircularBinaryEncode, assertCircularJsonEncode} from '../../util/circularGuardAsserts.ts';

describe('format-serialization / CircularGuard', () => {
  for (const testCase of Object.values(CIRCULAR_GUARD)) {
    it(`json - ${testCase.title}`, () => assertCircularJsonEncode(testCase));
    it(`binary - ${testCase.title}`, () => assertCircularBinaryEncode(testCase));
  }
});
