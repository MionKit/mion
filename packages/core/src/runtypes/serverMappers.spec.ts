/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {getRTUtils, registerPureFn, registerPureFnFactory} from '@ts-runtypes/core';
import {
    SERVER_MAPPER_NAMESPACE,
    allowServerMapper,
    getServerMapper,
    hasServerMapper,
    installServerMapperReader,
    registerServerMappers,
    serverMapperKey,
} from './serverMappers.ts';

describe('server mapper keys', () => {
    it('builds the wire key the client puts in the routesFlow query', () => {
        expect(serverMapperKey('toId')).toBe('mionjs::toId');
        expect(SERVER_MAPPER_NAMESPACE).toBe('mionjs');
    });
});

describe('serverMapFrom mapper resolution (allow-listed registry keys)', () => {
    it('resolves a NAME-lane mapper registered with @ts-runtypes and opted in', () => {
        // registration is upstream's job: a literal key + an inline literal is scanner-clean.
        registerPureFn('mionjs::toId', (v: {id: number}) => v.id);
        allowServerMapper(serverMapperKey('toId'));
        expect(hasServerMapper('mionjs::toId')).toBe(true);
        expect(getServerMapper('mionjs::toId')?.({id: 7})).toBe(7);
    });

    it('resolves an INLINE-lane mapper registered from the harvested manifest', () => {
        registerServerMappers([{key: 'rt::testMapperHash', paramNames: [], code: 'return (v) => v * 3;'}]);
        expect(hasServerMapper('rt::testMapperHash')).toBe(true);
        expect(getServerMapper('rt::testMapperHash')?.(5)).toBe(15);
    });

    it('skips manifest entries without a code payload instead of registering them', () => {
        registerServerMappers([{key: 'rt::noCodeEntry'}]);
        expect(hasServerMapper('rt::noCodeEntry')).toBe(false);
    });

    it('re-reads the manifest on a miss, so mappers registered after install still resolve', () => {
        const entries: {key: string; paramNames: string[]; code: string}[] = [];
        installServerMapperReader(() => entries);
        expect(hasServerMapper('rt::lateEntry')).toBe(false);
        // the manifest gains an entry after install — the next miss must re-read, not stay stale
        entries.push({key: 'rt::lateEntry', paramNames: [], code: 'return (v) => v + 1;'});
        expect(getServerMapper('rt::lateEntry')?.(1)).toBe(2);
    });
});

// ############# the security property #############
// The mapper key arrives on the wire (URL query, JSON.parse'd with no schema validation) and goes
// straight to getServerMapper. The allow-list is the only thing stopping a request from naming an
// arbitrary entry in the SHARED ts-runtypes registry — built-ins, entries installed by
// addSerializedJitCaches from a metadata payload, or anything an unrelated library registered in
// the same process. These pin that it holds for BOTH namespaces: the gate is lane-of-registration,
// not a namespace check.
describe('wire keys cannot reach registry entries outside a mion lane', () => {
    it('rejects an rt:: entry put in the registry directly', () => {
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

    it('rejects a mionjs:: entry registered upstream WITHOUT allowServerMapper', () => {
        // the realistic near-miss: a correct upstream registration, but nobody opted the key in.
        // Registering must NOT be enough on its own, or the gate is decorative.
        registerPureFnFactory('mionjs::notOptedIn', () => (s: string) => s.toLowerCase());
        expect(getRTUtils().hasPureFnByKey('mionjs::notOptedIn')).toBe(true);
        expect(hasServerMapper('mionjs::notOptedIn')).toBe(false);
        expect(getServerMapper('mionjs::notOptedIn')).toBeUndefined();
    });
});
