/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {AOTCacheMessage, serializeCachesToCode} from './aotEmitter.ts';
import {resetRouter, initRouter, registerRoutes} from '../router.ts';
import {resetJitFnCaches, getJitUtils, getJitFnCaches} from '@mionjs/core';
import {getPersistedMethods} from './methodsCache.ts';
import {route} from './handlers.ts';
import {Routes} from '../types/general.ts';
import {
    cpf_asJSONString,
    cpf_getUnknownKeysFromArray,
    cpf_hasUnknownKeysFromArray,
    cpf_newRunTypeErr,
    cpf_formatErr,
    cpf_safeIterableKey,
    cpf_sanitizeCompiledFn,
} from '@mionjs/run-types';

/** Re-registers run-types pure functions after resetJitFnCaches() */
function reRegisterRunTypesPureFns(): void {
    const {addPureFn} = getJitUtils();
    addPureFn('mion', cpf_asJSONString);
    addPureFn('mion', cpf_getUnknownKeysFromArray);
    addPureFn('mion', cpf_hasUnknownKeysFromArray);
    addPureFn('mion', cpf_newRunTypeErr);
    addPureFn('mion', cpf_formatErr);
    addPureFn('mion', cpf_safeIterableKey);
    addPureFn('mion', cpf_sanitizeCompiledFn);
}

describe('emitAOTCaches', () => {
    beforeEach(() => {
        resetRouter();
        resetJitFnCaches();
        reRegisterRunTypesPureFns();
    });

    afterEach(() => {
        resetRouter();
        resetJitFnCaches();
    });

    it('should not emit when MION_COMPILE is not set', async () => {
        const {emitAOTCaches} = await import('./aotEmitter.ts');

        // Save original env
        const originalEnv = process.env.MION_COMPILE;
        delete process.env.MION_COMPILE;

        // Should not throw and should return early
        await expect(emitAOTCaches()).resolves.toBeUndefined();

        // Restore
        if (originalEnv !== undefined) {
            process.env.MION_COMPILE = originalEnv;
        }
    });

    it('should not call process.send when MION_COMPILE is SSR', async () => {
        const {emitAOTCaches} = await import('./aotEmitter.ts');

        const originalEnv = process.env.MION_COMPILE;
        const originalSend = process.send;
        const mockSend = (() => {}) as any;
        (process as any).send = mockSend;
        process.env.MION_COMPILE = 'SSR';

        await expect(emitAOTCaches()).resolves.toBeUndefined();
        // process.send should not have been replaced or called
        expect(process.send).toBe(mockSend);

        // Restore
        if (originalEnv !== undefined) {
            process.env.MION_COMPILE = originalEnv;
        } else {
            delete process.env.MION_COMPILE;
        }
        (process as any).send = originalSend;
    });

    it('should not emit when process.send is not available', async () => {
        const {emitAOTCaches} = await import('./aotEmitter.ts');

        // Save original values
        const originalEnv = process.env.MION_COMPILE;
        const originalSend = process.send;

        process.env.MION_COMPILE = 'true';
        (process as any).send = undefined;

        // Should not throw and should return early
        await expect(emitAOTCaches()).resolves.toBeUndefined();

        // Restore
        if (originalEnv !== undefined) {
            process.env.MION_COMPILE = originalEnv;
        } else {
            delete process.env.MION_COMPILE;
        }
        (process as any).send = originalSend;
    });
});

/** Counts total pure function entries across all namespaces */
function countPureFnEntries(cache: Record<string, Record<string, unknown>>): number {
    return Object.values(cache).reduce((sum, ns) => sum + Object.keys(ns).length, 0);
}

/** Parses JS code string back to an object using new Function */
function parseJsCode(code: string): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function(`return (${code})`)() as Record<string, unknown>;
}

describe('serializeCachesToCode', () => {
    beforeEach(() => {
        resetRouter();
        resetJitFnCaches();
        reRegisterRunTypesPureFns();
    });

    afterEach(() => {
        resetRouter();
        resetJitFnCaches();
    });

    it('serialized output should have the same number of items as caches before serialization', async () => {
        // Initialize router with routes to populate JIT and pure function caches
        await initRouter();
        const routes = {
            users: {
                getUser: route((ctx, id: string): {id: string; name: string} => ({id, name: 'Test User'})),
                createUser: route((ctx, user: {id: string; name: string}): string => `Created ${user.name}`),
            },
            utils: {
                sum: route((ctx, a: number, b: number): number => a + b),
            },
        } satisfies Routes;
        await registerRoutes(routes);

        const {jitFnsCache, pureFnsCache} = getJitFnCaches();
        const routerCache = getPersistedMethods();

        // Count items before serialization (no toJSCode entries exist yet, those are added by createToJavascriptFn)
        const jitCountBefore = Object.keys(jitFnsCache).length;
        const pureCountBefore = countPureFnEntries(pureFnsCache);
        const routerCountBefore = Object.keys(routerCache).length;

        // Serialize caches to JS code (createToJavascriptFn adds compile-time items, filtering excludes them)
        const serialized = await serializeCachesToCode(jitFnsCache, pureFnsCache, routerCache);

        // Restore caches from serialized JS code
        const restoredJitFns = parseJsCode(serialized.jitFnsCode);
        const restoredPureFns = parseJsCode(serialized.pureFnsCode) as Record<string, Record<string, unknown>>;
        const restoredRouterCache = parseJsCode(serialized.routerCacheCode);

        // Restored caches should have the same number of items as the originals
        // jitFns and routerCache: exact match (toJSCode entries added during serialization are filtered out)
        // pureFns: minus 1 for sanitizeCompiledFn which is a pre-existing compile-time-only function excluded from AOT output
        expect(Object.keys(restoredJitFns).length).toBe(jitCountBefore);
        expect(countPureFnEntries(restoredPureFns)).toBe(pureCountBefore - 1);
        expect(Object.keys(restoredRouterCache).length).toBe(routerCountBefore);
    });
});

describe('AOTCacheMessage interface', () => {
    it('should have the correct structure', () => {
        const message: AOTCacheMessage = {
            type: 'mion-aot-caches',
            jitFnsCode: '{}',
            pureFnsCode: '{}',
            routerCacheCode: '{}',
        };

        expect(message.type).toBe('mion-aot-caches');
        expect(message.jitFnsCode).toBeDefined();
        expect(message.pureFnsCode).toBeDefined();
        expect(message.routerCacheCode).toBeDefined();
    });
});
