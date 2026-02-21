/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {jitFnsCache, pureFnsCache, routerCache} from 'virtual:mion-aot/caches';
import {routesCache, MION_ROUTES} from '@mionkit/core';
import {fetchRemoteMethodsMetadata, resetClientCaches} from './clientMethodsMetadata.ts';
import {ClientOptions} from './types.ts';
import {TEST_SERVER_BASE_URL_JSON} from '../globalSetup.ts';
import Storage from 'dom-storage';

// Setup real localStorage for testing (same pattern as other client tests)
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

// ============================================================
// A. Virtual Module Resolution
// Proves that the plugin's resolveId + load hooks work correctly
// ============================================================
describe('mion vite plugin: virtual module resolution', () => {
    it('should resolve virtual:mion-aot/caches and export all three caches', () => {
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
        expect(routerCache).toHaveProperty(MION_ROUTES.methodsMetadataByPath);
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
// Proves that the combined virtual module's side-effect (calling
// addAOTCaches + addRoutesToCache) registered caches correctly
// ============================================================
describe('mion vite plugin: AOT cache registration', () => {
    it('should auto-register internal routes in routesCache via addRoutesToCache', () => {
        expect(routesCache.hasMetadata(MION_ROUTES.methodsMetadataById)).toBe(true);
        expect(routesCache.hasMetadata(MION_ROUTES.methodsMetadataByPath)).toBe(true);
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
    const baseURL = TEST_SERVER_BASE_URL_JSON;
    let options: ClientOptions;

    beforeEach(() => {
        options = {
            baseURL,
            fetchOptions: {},
            prefix: '',
            suffix: '',
            validateParams: true,
            autoGenerateErrorId: false,
            serializer: 'stringifyJson',
        };
        localStorage.clear();
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
