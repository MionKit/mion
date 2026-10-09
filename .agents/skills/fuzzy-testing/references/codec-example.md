# A tiny complete example: codec fuzz test

The whole method in 30 lines: pick an input maker, lean on fast-check for seed + shrink, watch the return value,
sweep rule shapes ② ③ ① ⑧. Code that is not a simple in / out function (a stateful sync pipeline) →
[enrich-pipeline.md](enrich-pipeline.md).

```ts
import fc from 'fast-check';
import {test} from 'vitest';
import {encode, decode} from '../src/codec';

// --- the pieces ---
// input maker: a hand-written arbitrary (no reflection here).
const userArb = fc.record({id: fc.uuid(), name: fc.string(), age: fc.nat({max: 120})});
// replay + shrink: fast-check gives seed + shrinking for free.
// what we watch: the return value.

// --- the rules ---
test('codec', () => {
  fc.assert(
    fc.property(userArb, (user) => {
      // ② round-trip (strong)
      expect(decode(encode(user))).toStrictEqual(user);
      // ③ idempotence of encode∘decode at the wire
      const w = encode(user);
      expect(encode(decode(w))).toBe(w);
    }),
    {numRuns: 1000}
  );
  // ① totality (negative space): decode must not crash on junk, only reject.
  fc.assert(
    fc.property(fc.string(), (s) => {
      try {
        decode(s);
      } catch (e) {
        expect(e).toBeInstanceOf(DecodeError);
      }
    })
  );
});
```
