/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {jitFnsCache} from 'virtual:client-mion-aot/jit-fns';
import {pureFnsCache} from 'virtual:client-mion-aot/pure-fns';
import {routerCache} from 'virtual:client-mion-aot/router-cache';
import {routesCache, MION_ROUTES, PureFnDef, HeadersSubset} from '@mionjs/core';
import {loadAOTCaches} from './aotCaches.ts';
import {fetchRemoteMethodsMetadata} from '../lib/clientMethodsMetadata.ts';
import {initClient} from '../client.ts';
import {ClientOptions} from '../types.ts';
import {getStorage} from '../lib/storage.ts';
import {TEST_SERVER_BASE_URL} from '../../globalSetup.ts';
import {resetClientCaches} from '../lib/testUtils.ts';
import {TestServerApi} from '@mionjs/test-server';
import {pureServerFn} from '@mionjs/core';

// ============================================================
// A. Virtual Module Resolution
// Proves that the plugin's resolveId + load hooks work correctly
// ============================================================
describe('mion vite plugin: virtual module resolution', () => {
    it('should resolve virtual:client-mion-aot/* and export all three caches', () => {
        expect(jitFnsCache).toBeDefined();
        expect(pureFnsCache).toBeDefined();
        expect(routerCache).toBeDefined();
    });

    it('should export caches as objects (not undefined, null, or primitives)', () => {
        expect(typeof jitFnsCache).toBe('object');
        expect(typeof pureFnsCache).toBe('object');
        expect(typeof routerCache).toBe('object');
        expect(jitFnsCache).not.toBeNull();
        expect(pureFnsCache).not.toBeNull();
        expect(routerCache).not.toBeNull();
    });
});

// ============================================================
// A2. isClient mode: stripped properties
// Proves that with isClient: true, unused metadata (code, args,
// defaultParamValues, fnID, paramNames) is stripped from caches
// ============================================================
describe('mion vite plugin: isClient stripped properties', () => {
    it('should strip code, args, defaultParamValues, fnID from JIT cache entries', () => {
        const firstKey = Object.keys(jitFnsCache)[0];
        expect(firstKey).toBeDefined();
        const entry = jitFnsCache[firstKey] as Record<string, any>;
        // These properties should be stripped by isClient mode
        expect(entry.code).toBeUndefined();
        expect(entry.args).toBeUndefined();
        expect(entry.defaultParamValues).toBeUndefined();
        expect(entry.fnID).toBeUndefined();
    });

    it('should keep required properties in JIT cache entries', () => {
        const firstKey = Object.keys(jitFnsCache)[0];
        const entry = jitFnsCache[firstKey] as Record<string, any>;
        expect(entry.typeName).toBeDefined();
        expect(entry.jitFnHash).toBeDefined();
        expect(typeof entry.createJitFn).toBe('function');
        // jitDependencies and pureFnDependencies are optional (omitted when empty to reduce bundle size)
        expect(entry.jitDependencies === undefined || Array.isArray(entry.jitDependencies)).toBeTruthy();
        expect(entry.pureFnDependencies === undefined || Array.isArray(entry.pureFnDependencies)).toBeTruthy();
    });

    it('should strip code and paramNames from pure function cache entries', () => {
        const firstNs = Object.keys(pureFnsCache)[0];
        if (!firstNs) return; // skip if no pure functions
        const nsCache = pureFnsCache[firstNs] as Record<string, Record<string, any>>;
        const firstFnKey = Object.keys(nsCache)[0];
        if (!firstFnKey) return;
        const entry = nsCache[firstFnKey];
        expect(entry.code).toBeUndefined();
        expect(entry.paramNames).toBeUndefined();
    });

    it('should keep required properties in pure function cache entries', () => {
        const firstNs = Object.keys(pureFnsCache)[0];
        if (!firstNs) return;
        const nsCache = pureFnsCache[firstNs] as Record<string, Record<string, any>>;
        const firstFnKey = Object.keys(nsCache)[0];
        if (!firstFnKey) return;
        const entry = nsCache[firstFnKey];
        expect(entry.namespace).toBeDefined();
        expect(entry.fnName).toBeDefined();
        expect(entry.bodyHash).toBeDefined();
        expect(typeof entry.createPureFn).toBe('function');
        // pureFnDependencies is optional (omitted when empty to reduce bundle size)
        expect(entry.pureFnDependencies === undefined || Array.isArray(entry.pureFnDependencies)).toBeTruthy();
    });

    it('all JIT cache entries should be stripped (not just the first one)', () => {
        for (const key of Object.keys(jitFnsCache)) {
            const entry = jitFnsCache[key] as Record<string, any>;
            expect(entry.code).toBeUndefined();
            expect(entry.args).toBeUndefined();
            expect(entry.defaultParamValues).toBeUndefined();
            expect(entry.fnID).toBeUndefined();
        }
    });
});

// ============================================================
// B. AOT Cache Content
// Proves that the AOT subprocess (vite-node) communicated via IPC
// and generated valid cache data from defaultRoutes.ts
// ============================================================
describe('mion vite plugin: AOT cache content', () => {
    it('should generate non-empty router cache', () => {
        expect(Object.keys(routerCache).length).toBeGreaterThan(0);
    });

    it('should include internal mion routes in router cache', () => {
        expect(routerCache).toHaveProperty(MION_ROUTES.methodsMetadataById);
        expect(routerCache).toHaveProperty(MION_ROUTES.methodsMetadata);
        expect(routerCache).toHaveProperty(MION_ROUTES.notFound);
        expect(routerCache).toHaveProperty(MION_ROUTES.platformError);
    });

    it('should include route metadata with expected structure', () => {
        const metadataById = routerCache[MION_ROUTES.methodsMetadataById];
        expect(metadataById).toBeDefined();
        expect(metadataById).toHaveProperty('id');
        expect(metadataById.id).toBe(MION_ROUTES.methodsMetadataById);
    });

    it('should generate non-empty JIT functions cache', () => {
        expect(Object.keys(jitFnsCache).length).toBeGreaterThan(0);
    });

    it('should include JIT function entries with serialized function data', () => {
        const firstKey = Object.keys(jitFnsCache)[0];
        const entry = jitFnsCache[firstKey];
        expect(entry).toBeDefined();
        // JIT cache entries should have function data (the exact structure depends on serialization)
        expect(typeof entry).toBe('object');
    });
});

// ============================================================
// C. AOT Cache Registration
// Proves that loadAOTCaches registers caches correctly
// ============================================================
describe('mion vite plugin: AOT cache registration', () => {
    loadAOTCaches();
    it('should auto-register internal routes in routesCache via addRoutesToCache', () => {
        expect(routesCache.hasMetadata(MION_ROUTES.methodsMetadataById)).toBe(true);
        expect(routesCache.hasMetadata(MION_ROUTES.methodsMetadata)).toBe(true);
        expect(routesCache.hasMetadata(MION_ROUTES.notFound)).toBe(true);
    });

    it('should have valid metadata for registered routes', () => {
        const metadata = routesCache.getMetadata(MION_ROUTES.methodsMetadataById);
        expect(metadata).toBeDefined();
        expect(metadata?.id).toBe(MION_ROUTES.methodsMetadataById);
    });

    it('should have JIT functions available for registered routes', () => {
        const methodWithJitFns = routesCache.getMethodJitFns(MION_ROUTES.methodsMetadataById);
        expect(methodWithJitFns).toBeDefined();
        expect(methodWithJitFns?.paramsJitFns).toBeDefined();
    });
});

// ============================================================
// D. End-to-End with Real Server
// Tests the full pipeline: plugin generates caches → client
// fetches metadata from real server → JIT functions work at runtime
// ============================================================
describe('mion vite plugin: e2e with real server', () => {
    const baseURL = TEST_SERVER_BASE_URL;
    let options: ClientOptions;

    beforeEach(() => {
        options = {
            baseURL,
            fetchOptions: {},
            basePath: '',
            suffix: '',
            validateParams: true,
            autoGenerateErrorId: false,
            serializer: 'stringifyJson',
        };
        getStorage().clear();
    });

    afterEach(() => {
        resetClientCaches();
    });

    it('should fetch and restore JIT functions from real server that actually validate types', async () => {
        await fetchRemoteMethodsMetadata(['sayHello'], options);

        const methodJitFns = routesCache.getMethodJitFns('sayHello');
        expect(methodJitFns).toBeDefined();
        expect(methodJitFns!.paramsJitFns).toBeDefined();
        expect(methodJitFns!.paramsJitFns.isType).toBeDefined();
        expect(typeof methodJitFns!.paramsJitFns.isType.fn).toBe('function');

        // Verify the JIT isType function actually validates correctly
        const validUser = {name: 'John', surname: 'Doe'};
        expect(methodJitFns!.paramsJitFns.isType.fn([validUser])).toBe(true);
        expect(methodJitFns!.paramsJitFns.isType.fn(['not-a-user'])).toBe(false);
    });

    it('should fetch routes with different parameter types and validate correctly', async () => {
        await fetchRemoteMethodsMetadata(['calculateAge'], options);

        const methodJitFns = routesCache.getMethodJitFns('calculateAge');
        expect(methodJitFns).toBeDefined();
        expect(methodJitFns!.paramsJitFns.isType.fn([1990])).toBe(true);
        expect(methodJitFns!.paramsJitFns.isType.fn(['not-a-number'])).toBe(false);
    });
});

// ============================================================
// E. Server Pure Functions E2E
// Tests the full pipeline: client defines pureServerFn → vite plugin
// extracts it at build time → server imports virtual module →
// route invokes the function → client verifies result matches
// this test requires the test server to have serverPureFunctions.clientSrcPath configured to point to this package
// ============================================================
describe('mion vite plugin: pureServerFn e2e', () => {
    const baseURL = TEST_SERVER_BASE_URL;
    type MyApi = TestServerApi;

    /** Simple pure function for e2e testing of server pure functions extraction */
    const greetingPureFn = pureServerFn({
        pureFn: function greeting() {
            return 'hello from pure function';
        },
        fnName: 'greeting',
    });

    /** Pure function defined as a variable reference (tests AST variable resolution) */
    const variableDef: PureFnDef<any> = {
        pureFn: function double(x: number) {
            return x * 2;
        },
        fnName: 'double',
    };
    const doublePureFn = pureServerFn(variableDef);

    /** Plain function shorthand: pureServerFn(fn) - fnName = bodyHash */
    const incrementPureFn = pureServerFn(function increment(x: number) {
        return x + 1;
    });

    /** Arrow function shorthand: pureServerFn(arrow) - fnName = bodyHash */
    const tripleArrowFn = pureServerFn((x: number) => x * 3);

    beforeEach(() => {
        getStorage().clear();
    });

    afterEach(() => {
        resetClientCaches();
    });

    it('should have valid client-side pureServerFn reference', () => {
        expect(greetingPureFn).toBeDefined();
        expect(greetingPureFn.bodyHash).toBeTruthy();
        expect(greetingPureFn.namespace).toBe('pureServerFn');
        expect(greetingPureFn.fnName).toBe('greeting');
        // The pure function should return the expected value when called client-side
        expect(greetingPureFn.pureFn()).toBe('hello from pure function');
    });

    it('should have valid client-side pureServerFn from variable reference', () => {
        expect(doublePureFn).toBeDefined();
        expect(doublePureFn.bodyHash).toBeTruthy();
        expect(doublePureFn.namespace).toBe('pureServerFn');
        expect(doublePureFn.fnName).toBe('double');
        expect(doublePureFn.pureFn(5)).toBe(10);
    });

    it('should execute client-defined pureServerFn on server via virtual module', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = new HeadersSubset({Authorization: 'test-token'});

        const [result, error] = await routes.getGreetingsPureFnResult().callWithMiddleFns({
            auth: middleFns.auth(authHeaders),
        });

        expect(error).toBeUndefined();
        // The server route calls the pure function that was extracted from client
        // source at build time via virtual:mion-pure-functions
        expect(result).toBe('hello from pure function');
    });

    it('should return same value from server as client-side pure function', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = new HeadersSubset({Authorization: 'test-token'});

        // Get the client-side result
        const clientResult = greetingPureFn.pureFn();

        // Get the server-side result via mion client
        const [serverResult, error] = await routes.getGreetingsPureFnResult().callWithMiddleFns({
            auth: middleFns.auth(authHeaders),
        });

        expect(error).toBeUndefined();
        // Both should produce the same value
        expect(serverResult).toBe(clientResult);
    });

    // --- Plain function overload tests ---

    it('should have valid client-side ref from plain function overload (named function)', () => {
        expect(incrementPureFn).toBeDefined();
        expect(incrementPureFn.bodyHash).toBeTruthy();
        expect(incrementPureFn.namespace).toBe('pureServerFn');
        // Plain function overload always uses bodyHash as fnName
        expect(incrementPureFn.fnName).toBe(incrementPureFn.bodyHash);
        expect(incrementPureFn.isFactory).toBe(false);
        expect(incrementPureFn.pureFn(5)).toBe(6);
    });

    it('should have valid client-side ref from plain arrow function overload', () => {
        expect(tripleArrowFn).toBeDefined();
        expect(tripleArrowFn.bodyHash).toBeTruthy();
        expect(tripleArrowFn.namespace).toBe('pureServerFn');
        expect(tripleArrowFn.fnName).toBe(tripleArrowFn.bodyHash);
        expect(tripleArrowFn.isFactory).toBe(false);
        expect(tripleArrowFn.pureFn(4)).toBe(12);
    });

    it('should execute plain function pureServerFn on server via callPureFnByName', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = new HeadersSubset({Authorization: 'test-token'});

        // The fnName for plain function overload is the bodyHash
        const [result, error] = await routes.callPureFnByName(incrementPureFn.fnName, 10).callWithMiddleFns({
            auth: middleFns.auth(authHeaders),
        });

        expect(error).toBeUndefined();
        expect(result).toBe(11);
    });

    it('should execute plain arrow function pureServerFn on server via callPureFnByName', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = new HeadersSubset({Authorization: 'test-token'});

        const [result, error] = await routes.callPureFnByName(tripleArrowFn.fnName, 7).callWithMiddleFns({
            auth: middleFns.auth(authHeaders),
        });

        expect(error).toBeUndefined();
        expect(result).toBe(21);
    });

    it('should return same value from server as client-side plain function', async () => {
        const {routes, middleFns} = initClient<MyApi>({baseURL});
        const authHeaders = new HeadersSubset({Authorization: 'test-token'});

        const clientResult = incrementPureFn.pureFn(42);
        const [serverResult, error] = await routes.callPureFnByName(incrementPureFn.fnName, 42).callWithMiddleFns({
            auth: middleFns.auth(authHeaders),
        });

        expect(error).toBeUndefined();
        expect(serverResult).toBe(clientResult);
    });
});
