/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {getRTUtils, registerPureFnFactory} from '@ts-runtypes/core';
import {
    MION_PURE_FN_NAMESPACE,
    getMionPureFn,
    getServerMapper,
    hasMionPureFn,
    hasServerMapper,
    mionPureFnId,
    registerMionPureFn,
    registerServerMappers,
} from './mionPureFns.ts';

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

describe('serverMapFrom mapper resolution (allow-listed registry keys)', () => {
    it('resolves mappers registered through the mion lanes', () => {
        registerMionPureFn('toId', () => (v: {id: number}) => v.id);
        expect(hasServerMapper('mionjs::toId')).toBe(true);
        expect(getServerMapper('mionjs::toId')?.({id: 7})).toBe(7);

        registerServerMappers([{key: 'rt::testMapperHash', paramNames: [], code: 'return (v) => v * 3;'}]);
        expect(hasServerMapper('rt::testMapperHash')).toBe(true);
        expect(getServerMapper('rt::testMapperHash')?.(5)).toBe(15);
    });

    it('never resolves registry entries outside the mion lanes (wire keys cannot reach arbitrary pure fns)', () => {
        // registered directly into the shared ts-runtypes registry, NOT through a mion lane —
        // e.g. a built-in rt:: fn or an entry from an unrelated library in the same process
        getRTUtils().addPureFn('rt::sneakyDirectEntry', {
            namespace: 'rt',
            fnName: 'sneakyDirectEntry',
            bodyHash: '',
            paramNames: [],
            code: '',
            pureFnDependencies: [],
            createPureFn: () => () => 'should never be reachable',
        } as never);
        expect(getRTUtils().hasPureFnByKey('rt::sneakyDirectEntry')).toBe(true);
        expect(hasServerMapper('rt::sneakyDirectEntry')).toBe(false);
        expect(getServerMapper('rt::sneakyDirectEntry')).toBeUndefined();
    });

    it('skips manifest entries without a code payload instead of registering them', () => {
        registerServerMappers([{key: 'rt::noCodeEntry'}]);
        expect(hasServerMapper('rt::noCodeEntry')).toBe(false);
    });
});
