// serialization / CircularGuard — each thunk arms `{rejectCircularRefs: true}`; a cyclic value throws
// CircularReferenceError, an acyclic control encodes.
import {describe, it} from 'vitest';
import {CIRCULAR_GUARD} from './CircularGuard.ts';
import {assertCircularJsonEncode} from '../../util/circularGuardAsserts.ts';

describe('serialization / CircularGuard', () => {
  for (const testCase of Object.values(CIRCULAR_GUARD)) {
    it(`json - ${testCase.title}`, () => assertCircularJsonEncode(testCase));
  }
});
