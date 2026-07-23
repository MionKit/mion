/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {resolveJIT, resolveCompiledPureFn} from './rtResolver.ts';
import {registerMionPureFn} from './mionPureFns.ts';

// mion resolves jit hashes and pure fns DIRECTLY from the @ts-runtypes/core runtime cache
// (rtResolver) — there is no installable backend. A lookup that isn't in the cache is a plain
// miss (undefined), never a throw. These tests pin that contract from core's own test project
// (which has no build-injected entries).
describe('rtResolver — direct ts-runtypes cache resolution', () => {
    it('unknown jit/pure lookups are plain misses (undefined), never throw', () => {
        expect(resolveJIT('isType_does_not_exist')).toBeUndefined();
        expect(resolveCompiledPureFn('ns', 'missing')).toBeUndefined();
    });

    it('resolves a pure fn registered through the mion runtime lane', () => {
        registerMionPureFn('rtResolverSpecFn', () => () => 42);
        expect(resolveCompiledPureFn('mionjs', 'rtResolverSpecFn')).toBeTruthy();
    });
});
