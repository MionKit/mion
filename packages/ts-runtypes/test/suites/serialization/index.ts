import {ATOMIC} from './Atomic.ts';
import {ARRAYS} from './Arrays.ts';
import {OBJECTS} from './Objects.ts';
import {RECORDS} from './Records.ts';
import {TUPLES} from './Tuples.ts';
import {FUNCTIONS} from './Functions.ts';
import {UTILITY_TYPES} from './UtilityTypes.ts';
import {UNIONS} from './Unions.ts';
import {ITERABLES} from './Iterables.ts';
import {CIRCULAR_REFS} from './CircularRefs.ts';
import {TEMPLATE_LITERALS} from './TemplateLiterals.ts';
import {OTHERS} from './Others.ts';
import {EXTRA_PARAMS} from './ExtraParams.ts';
import {LARGE_OBJECTS} from './LargeObjects.ts';
import {DATETIME} from './DateTime.ts';
import {REALWORLD} from './Realworld.ts';
import type {SerializationCase} from './types.ts';

export const SERIALIZATION_SPEC = {
  REALWORLD,
  ATOMIC,
  ARRAYS,
  OBJECTS,
  RECORDS,
  TUPLES,
  FUNCTIONS,
  UTILITY_TYPES,
  UNIONS,
  ITERABLES,
  CIRCULAR_REFS,
  TEMPLATE_LITERALS,
  OTHERS,
  EXTRA_PARAMS,
  LARGE_OBJECTS,
  DATETIME,
} as const satisfies Record<string, Record<string, SerializationCase>>;

export * from './types.ts';
