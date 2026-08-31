import {expect, test} from 'vitest';
import {isUser, userTypeIdStatic, userTypeIdFromValue, userTypeIdFromBuilder} from '../src/main';

// End to end, from the PUBLISHED packages, on THIS OS/arch: the plugin resolved
// the host-platform binary (via the @ts-runtypes/bin optional-dependency model),
// spawned it, and rewrote BOTH marker call shapes.
test('packaged @mionjs/run-types validates + reflects against the platform binary', () => {
  expect(typeof userTypeIdStatic).toBe('string');
  expect(userTypeIdStatic.length).toBeGreaterThan(0);
  // Marker rule: static and value-first getRunTypeId converge for equal T.
  expect(userTypeIdFromValue).toBe(userTypeIdStatic);
  // And the packed builders subpath's value-first form lands on the same id.
  expect(userTypeIdFromBuilder).toBe(userTypeIdStatic);
  expect(isUser({id: 1, name: 'Ada', email: 'a@b.c', roles: ['admin']})).toBe(true);
  expect(isUser({id: 'nope', name: 5, email: null, roles: 'x'})).toBe(false);
});
