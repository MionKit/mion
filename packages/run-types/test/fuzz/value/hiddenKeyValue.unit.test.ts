// Pins hideOwnKey without the compiler, so O21 over its values tests the hide and not a broken copy.

import {describe, it, expect} from 'vitest';
import {mulberry32} from '../core/seededRng.ts';
import {hideOwnKey, HIDDEN_KEY_MODES} from './hiddenKeyValue.ts';

describe('hideOwnKey', () => {
  it('hides one key per mode, keeping its value readable', () => {
    const seen = new Set<string>();
    const random = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const input = {a: 1, b: 'x'};
      const hidden = hideOwnKey(input, random);
      if (!hidden) throw new Error('no plain object found');
      const out = hidden.value as Record<string, unknown>;
      seen.add(hidden.mode);
      expect(out[hidden.key]).toBe(input[hidden.key as 'a' | 'b']);
      expect(Object.keys(out)).not.toContain(hidden.key);
      expect(input).toEqual({a: 1, b: 'x'});
      let forIn = 0;
      for (const forInKey in out) if (forInKey === hidden.key) forIn++;
      expect(forIn).toBe(hidden.mode === 'inherited' ? 1 : 0);
    }
    expect([...seen].sort()).toEqual([...HIDDEN_KEY_MODES].sort());
  });

  it('reaches objects nested in arrays and objects', () => {
    const random = mulberry32(3);
    const paths = new Set<string>();
    for (let i = 0; i < 200; i++) paths.add(JSON.stringify(hideOwnKey({list: [{x: 1}], inner: {y: 2}}, random)?.path));
    expect(paths).toEqual(new Set(['[]', '["list",0]', '["inner"]']));
  });

  it('returns null with no plain object to hide a key in', () => {
    const random = mulberry32(1);
    for (const value of [1, 'x', null, [], [1, 2], {}, new Date(), new Map([['a', 1]])])
      expect(hideOwnKey(value, random)).toBeNull();
  });
});
