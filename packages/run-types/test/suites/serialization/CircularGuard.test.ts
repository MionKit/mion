// serialization / CircularGuard — every circular-guard case run through the
// JSON and binary encoders. The guard is armed per-call via `{rejectCircularRefs:
// true}` inside each thunk; a cyclic value throws CircularReferenceError, an
// acyclic control encodes without throwing.
import {describe, it} from 'vitest';
import {CIRCULAR_GUARD} from './CircularGuard.ts';
import {assertCircularBinaryEncode, assertCircularJsonEncode} from '../../util/circularGuardAsserts.ts';

describe('serialization / CircularGuard', () => {
  for (const testCase of Object.values(CIRCULAR_GUARD)) {
    it(`json - ${testCase.title}`, () => assertCircularJsonEncode(testCase));
    it(`binary - ${testCase.title}`, () => assertCircularBinaryEncode(testCase));
  }
});
