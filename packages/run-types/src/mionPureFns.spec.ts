/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {registerPureFnFactory} from '@ts-runtypes/core';
import {MION_PURE_FN_NAMESPACE, getMionPureFn, hasMionPureFn, mionPureFnId, registerMionPureFn} from '../index.ts';

describe('mion pure fns over the ts-runtypes registry (mionjs namespace)', () => {
    it('registers and resolves a pure fn under mionjs (runtime lane)', () => {
        const compiled = registerMionPureFn('double', () => (n: number) => n * 2);
        expect(compiled.namespace).toBe(MION_PURE_FN_NAMESPACE);
        expect(hasMionPureFn('double')).toBe(true);
        expect(getMionPureFn('double')?.(21)).toBe(42);
    });

    it('direct registerPureFnFactory literal call is build-extracted (bodyHash present)', () => {
        const compiled = registerPureFnFactory('mionjs::slugify', () => (s: string) => s.toLowerCase().replaceAll(' ', '-'));
        expect(compiled.bodyHash.length).toBeGreaterThan(0);
        expect(getMionPureFn('slugify')?.('Hello World')).toBe('hello-world');
    });

    it('missing fns resolve to undefined/false without throwing', () => {
        expect(hasMionPureFn('nope')).toBe(false);
        expect(getMionPureFn('nope')).toBeUndefined();
        expect(mionPureFnId('nope')).toBe('mionjs::nope');
    });
});
