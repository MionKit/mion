/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getJitUtils} from './jitUtils.ts';
import {registerMionPureFn} from '../runtypes/mionPureFns.ts';

// R33 collapse: the mion adapter/pure-fn glue folded into @mionjs/core, so jitUtils resolves
// jit hashes and pure fns DIRECTLY from the @ts-runtypes/core runtime cache (rtResolver) —
// there is no installable backend anymore. A lookup that isn't in the cache is a plain miss
// (undefined), never a thrown "backend not installed". These tests pin that contract from
// core's own test project (which has no build-injected entries).

describe('jitUtils direct ts-runtypes resolution', () => {
    it('unknown jit/pure lookups are plain misses, never throw', () => {
        const utl = getJitUtils();
        expect(utl.getJIT('isType_does_not_exist')).toBeUndefined();
        expect(utl.hasJitFn('isType_does_not_exist')).toBe(false);
        expect(utl.getCompiledPureFn('ns', 'missing')).toBeUndefined();
        expect(utl.hasPureFn('ns', 'missing')).toBe(false);
        expect(utl.getPureFn('ns', 'missing')).toBeUndefined();
    });

    it('resolves a pure fn registered through the mion runtime lane', () => {
        registerMionPureFn('jitUtilsSpecFn', () => () => 42);
        const utl = getJitUtils();
        expect(utl.hasPureFn('mionjs', 'jitUtilsSpecFn')).toBe(true);
        expect(utl.getCompiledPureFn('mionjs', 'jitUtilsSpecFn')).toBeTruthy();
    });

    it('getJitFn throws a clear not-found error for a missing hash', () => {
        expect(() => getJitUtils().getJitFn('isType_missing')).toThrow(/not found in the ts-runtypes cache/);
    });

    it('removed cache-mutation entry points throw pointing at the new APIs (never @mionjs/run-types)', () => {
        const utl = getJitUtils();
        expect(() => utl.addToJitCache({} as never)).toThrow(/addSerializedJitCaches \(@mionjs\/core\)/);
        expect(() => utl.removeFromJitCache({} as never)).toThrow(/resetJitFnCaches \(@mionjs\/core\)/);
        expect(() => utl.addPureFn('ns', {} as never)).toThrow(/registerMionPureFn \(@mionjs\/core\)/);
        expect(() => utl.findCompiledPureFn('fn')).toThrow(/getMionPureFn \(@mionjs\/core\)/);
        expect(() => utl.setSerializableClass({} as never)).toThrow(/registerClassSerializer \(@ts-runtypes\/core\)/);
        expect(() => utl.setDeserializeFn({} as never, (() => ({})) as never)).toThrow(
            /registerClassSerializer \(@ts-runtypes\/core\)/
        );
    });
});
