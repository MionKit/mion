import {
  createValidateFn,
  createHasUnknownKeysFn,
  createUnknownKeyErrorsFn,
} from '@mionjs/run-types';

interface User {
  name: string;
  age: number;
}

// Base structural validation ignores extra properties (they are simply not part of User).
const validate = createValidateFn<User>();
validate({name: 'John', age: 30}); // true
validate({name: 'John', age: 30, extra: 'value'}); // true (extra keys ignored)

// Strict checking: reject objects that carry unknown/extra properties.
// mion routes turn this on end-to-end with the router/route `strictTypes: true` option.
const hasUnknownKeys = createHasUnknownKeysFn<User>();
hasUnknownKeys({name: 'John', age: 30}); // false
hasUnknownKeys({name: 'John', age: 30, extra: 'value'}); // true

const unknownKeyErrors = createUnknownKeyErrorsFn<User>();
unknownKeyErrors({name: 'John', age: 30, extra: 'value'});
// Returns one RunTypeError per unknown property, e.g. [{ path: ['extra'], expected: 'never' }]
