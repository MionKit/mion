// FMT006 — mockSamples are excluded from the structural id (they describe how to GENERATE a value,
// not what the format validates), so these two intern as ONE cache entry. One entry carries one
// pool, so differing declarations make the surviving pool depend on scan order. The build stops
// rather than pick silently.
import {createValidateFn} from '@mionjs/run-types';
import {String} from '@mionjs/run-types/formats';

type PoolA = String<{maxLength: 5; mockSamples: ['aaa']}>;
type PoolB = String<{maxLength: 5; mockSamples: ['bbb']}>;

export const validateA = createValidateFn<PoolA>();
export const validateB = createValidateFn<PoolB>();
