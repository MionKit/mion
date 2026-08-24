// Runtime coverage for the value-first brand tag (`TF.brand(name)`), the
// companion to the type-only assertions in typesafety.test.ts. These run through
// the real vite plugin + Go binary, so they exercise the parts the type checker
// can't: the plugin INJECTING the resolved id into the 3-arg branded builder
// overload (`string(params, brand, <id>)` — the id lands at the trailing slot 2),
// and the scanner's brand-NEUTRALITY on the structural id (it reads only the two
// `__rtFormat{Name,Params}` sentinels and ignores `__rtFormatBrand`).
//
// The brand is therefore a pure TS-level nominal discriminator: at runtime a
// branded leaf resolves the SAME precompiled factory as its unbranded twin and as
// the type-first form. The `.toBe` cached-factory identity is the proven id-
// integrity idiom (same structural id ⇒ same cached factory).
import * as TF from '@ts-runtypes/core/formats';
import {describe, it, expect} from 'vitest';
import {createValidateFn} from '@ts-runtypes/core';

describe('value-first brand tag — runtime', () => {
  it('a branded leaf nested in createValidateFn resolves a working validator', () => {
    const isUserId = createValidateFn(TF.string({minLength: 3}, TF.brand('UserId')));
    expect(isUserId('abc')).toBe(true); // satisfies the format
    expect(isUserId('ab')).toBe(false); // minLength still enforced (format unchanged by the brand)
    expect(isUserId(42)).toBe(false); // base kind still enforced
  });

  it('brand is id-neutral: branded twin resolves the SAME cached factory as the unbranded leaf', () => {
    const branded = createValidateFn(TF.string({minLength: 3}, TF.brand('UserId')));
    const unbranded = createValidateFn(TF.string({minLength: 3}));
    expect(branded).toBe(unbranded);
  });

  it('branded value-first converges with the type-first form (one structural id)', () => {
    const branded = createValidateFn(TF.string({minLength: 3}, TF.brand('UserId')));
    const typeFirst = createValidateFn<TF.String<{minLength: 3}>>();
    expect(branded).toBe(typeFirst);
  });

  it('a STANDALONE branded builder gets its id injected (trailing slot 2) and resolves', () => {
    // Not nested in a marker, so the scanner injects the id INTO this builder call
    // (the brand rides slot 1 as an object, the id appends at slot 2). If the
    // injection slot were wrong the builder would fall back to its carrier and the
    // validator below would not match the unbranded factory.
    const userId = TF.string({minLength: 3}, TF.brand('UserId'));
    const isUserId = createValidateFn(userId);
    expect(isUserId('abc')).toBe(true);
    expect(isUserId('ab')).toBe(false); // minLength enforced ⇒ the standalone builder resolved a real node, not its carrier
    expect(isUserId(42)).toBe(false);
  });
});
