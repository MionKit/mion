import {describe, it, expect, beforeAll} from 'vitest';
import {resolve, join} from 'path';
import {createServer} from 'vite';
import {pureFunctionsPlugin} from '../src/plugin';
import {VIRTUAL_MODULE_ID, RESOLVED_VIRTUAL_MODULE_ID} from '../src/types';
import {resetHashes, resetJitFnCaches, addAOTCaches, getJitUtils} from '@mionkit/core';
import {PURE_SERVER_FN_NAMESPACE} from '../src/types';

const FIXTURE_DIR = resolve(__dirname, '.');
const CLIENT_SRC = join(FIXTURE_DIR, 'packages', 'test-client', 'src');

describe('E2E: Vite Plugin Integration', () => {
    beforeAll(() => {
        resetHashes();
        resetJitFnCaches();
    });

    it('should resolve virtual module ID', () => {
        const plugin = pureFunctionsPlugin({
            clientSrcPath: CLIENT_SRC,
        });

        // @ts-expect-error - accessing internal plugin method for testing
        const resolvedId = plugin.resolveId(VIRTUAL_MODULE_ID);
        expect(resolvedId).toBe(RESOLVED_VIRTUAL_MODULE_ID);
    });

    it('should return null for non-virtual module IDs', () => {
        const plugin = pureFunctionsPlugin({
            clientSrcPath: CLIENT_SRC,
        });

        // @ts-expect-error - accessing internal plugin method for testing
        const resolvedId = plugin.resolveId('some-other-module');
        expect(resolvedId).toBeNull();
    });

    it('should load virtual module with extracted functions', async () => {
        const plugin = pureFunctionsPlugin({
            clientSrcPath: CLIENT_SRC,
        });

        // @ts-expect-error - accessing internal plugin method for testing
        const moduleCode = plugin.load(RESOLVED_VIRTUAL_MODULE_ID);

        expect(moduleCode).toBeDefined();
        expect(moduleCode).toContain('export const pureFnsCache');
        expect(moduleCode).toContain(JSON.stringify(PURE_SERVER_FN_NAMESPACE));
        expect(moduleCode).toContain('createJitFn');
    });

    it('should return null for non-virtual module loads', () => {
        const plugin = pureFunctionsPlugin({
            clientSrcPath: CLIENT_SRC,
        });

        // @ts-expect-error - accessing internal plugin method for testing
        const result = plugin.load('/some/random/file.ts');
        expect(result).toBeNull();
    });

    it('should extract functions from client source and generate valid module code', async () => {
        const plugin = pureFunctionsPlugin({
            clientSrcPath: CLIENT_SRC,
        });

        // @ts-expect-error - accessing internal plugin method for testing
        const moduleCode = plugin.load(RESOLVED_VIRTUAL_MODULE_ID) as string;

        // The module code should be valid JavaScript that can be evaluated
        expect(moduleCode).toContain('export const pureFnsCache');
        expect(moduleCode).toContain(JSON.stringify(PURE_SERVER_FN_NAMESPACE));

        // Should contain function entries with bodyHash keys
        expect(moduleCode).toMatch(/"[a-zA-Z0-9]+":\s*\{/);

        // Should contain createJitFn closures
        expect(moduleCode).toContain('createJitFn');

        // Should contain function implementations
        expect(moduleCode).toContain('return');
    });

    it('should generate module code that can be evaluated and registered in core', async () => {
        const plugin = pureFunctionsPlugin({
            clientSrcPath: CLIENT_SRC,
        });

        // @ts-expect-error - accessing internal plugin method for testing
        const moduleCode = plugin.load(RESOLVED_VIRTUAL_MODULE_ID) as string;

        // Evaluate the module code (simulating what happens when the module is imported)
        const moduleExports: any = {};
        const evalCode = moduleCode.replace('export const', 'moduleExports.');
        eval(evalCode);

        // Verify the structure
        expect(moduleExports.pureFnsCache).toBeDefined();
        expect(moduleExports.pureFnsCache[PURE_SERVER_FN_NAMESPACE]).toBeDefined();

        // Register into core
        addAOTCaches({}, moduleExports.pureFnsCache);

        // Verify functions are accessible via jitUtils
        const jitUtils = getJitUtils();
        const pureFnsCache = moduleExports.pureFnsCache[PURE_SERVER_FN_NAMESPACE];
        const bodyHashes = Object.keys(pureFnsCache);

        expect(bodyHashes.length).toBeGreaterThanOrEqual(4);

        // Each function should be accessible
        for (const bodyHash of bodyHashes) {
            expect(jitUtils.hasPureFn(PURE_SERVER_FN_NAMESPACE, bodyHash)).toBe(true);
        }
    });

    it('should generate executable functions from virtual module', async () => {
        const plugin = pureFunctionsPlugin({
            clientSrcPath: CLIENT_SRC,
        });

        // @ts-expect-error - accessing internal plugin method for testing
        const moduleCode = plugin.load(RESOLVED_VIRTUAL_MODULE_ID) as string;

        // Evaluate and register
        const moduleExports: any = {};
        const evalCode = moduleCode.replace('export const', 'moduleExports.');
        eval(evalCode);
        addAOTCaches({}, moduleExports.pureFnsCache);

        // Find and execute the addOne-like function (bodyHash key)
        const jitUtils = getJitUtils();
        const pureFnsCache = moduleExports.pureFnsCache[PURE_SERVER_FN_NAMESPACE];
        const bodyHashes = Object.keys(pureFnsCache);

        // Find a function that looks like addOne (x + 1)
        const addOneHash = bodyHashes.find((hash) => {
            const entry = pureFnsCache[hash];
            return entry.code.includes('x + 1') || entry.code.includes('return x + 1');
        });

        expect(addOneHash).toBeDefined();

        if (addOneHash) {
            const addOneFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, addOneHash);
            expect(addOneFn(5)).toBe(6);
            expect(addOneFn(0)).toBe(1);
            expect(addOneFn(-1)).toBe(0);
        }
    });

    it('should work with actual Vite server', async () => {
        // Create a Vite server with the plugin
        const server = await createServer({
            root: __dirname,
            plugins: [
                pureFunctionsPlugin({
                    clientSrcPath: CLIENT_SRC,
                }),
            ],
            // Don't actually start the server, just use it for module resolution
            server: {
                port: 0, // Random port
                hmr: false,
            },
            logLevel: 'silent',
        });

        try {
            // Resolve the virtual module
            const resolved = await server.pluginContainer.resolveId(VIRTUAL_MODULE_ID);
            expect(resolved).toBeDefined();
            expect(resolved?.id).toBe(RESOLVED_VIRTUAL_MODULE_ID);

            // Load the virtual module
            const loadResult = await server.pluginContainer.load(RESOLVED_VIRTUAL_MODULE_ID);
            expect(loadResult).toBeDefined();
            // loadResult can be a string directly or an object with code property
            const code = typeof loadResult === 'string' ? loadResult : loadResult?.code;
            expect(code).toContain('export const pureFnsCache');
        } finally {
            await server.close();
        }
    });

    it('should handle hot updates for client source files', async () => {
        const plugin = pureFunctionsPlugin({
            clientSrcPath: CLIENT_SRC,
        });

        // First load to populate the cache
        // @ts-expect-error - accessing internal plugin method for testing
        const firstLoad = plugin.load(RESOLVED_VIRTUAL_MODULE_ID);
        expect(firstLoad).toBeDefined();

        // Simulate a hot update for a client source file
        const mockServer = {
            moduleGraph: {
                getModuleById: (id: string) => ({
                    id,
                    url: id,
                    type: 'js',
                }),
                invalidateModule: () => {},
            },
        };

        // @ts-expect-error - accessing internal plugin method for testing
        const hotUpdateResult = plugin.handleHotUpdate?.({
            file: join(CLIENT_SRC, 'pureFns.ts'),
            server: mockServer,
        });

        // Should return the invalidated module or undefined
        expect(hotUpdateResult).toBeDefined();
    });
});
