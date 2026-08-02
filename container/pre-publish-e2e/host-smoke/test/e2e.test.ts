import {expect, test} from 'vitest';
import {isUser, userTypeIdStatic, userTypeIdFromValue, userTypeIdFromSchema} from '../src/main';

// End to end, from the PUBLISHED packages, on THIS OS/arch: the plugin resolved
// the host-platform binary (via the @ts-runtypes/bin optional-dependency model),
// spawned it, and rewrote BOTH marker call shapes.
test('packaged @ts-runtypes/core validates + reflects against the platform binary', () => {
  expect(typeof userTypeIdStatic).toBe('string');
  expect(userTypeIdStatic.length).toBeGreaterThan(0);
  // Marker rule: static and value-first getRunTypeId converge for equal T.
  expect(userTypeIdFromValue).toBe(userTypeIdStatic);
  // And the packed json-schema subpath's builder form lands on the same id.
  expect(userTypeIdFromSchema).toBe(userTypeIdStatic);
  expect(isUser({id: 1, name: 'Ada', email: 'a@b.c', roles: ['admin']})).toBe(true);
  expect(isUser({id: 'nope', name: 5, email: null, roles: 'x'})).toBe(false);
});
