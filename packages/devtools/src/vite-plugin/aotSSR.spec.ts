import {describe, it, expect, vi} from 'vitest';
import {generateInProcessAOTCaches} from './aotCacheGenerator.ts';
import {InProcessAOTOptions} from './types.ts';

/** Creates a mock module loader with configurable responses */
function createMockLoader(modules: Record<string, Record<string, any>>) {
    return vi.fn((url: string) => {
        const mod = modules[url];
        if (!mod) throw new Error(`Module not found: ${url}`);
        return Promise.resolve(mod);
    });
}

const mockCacheData = {
    jitFnsCode: '{test: "jit"}',
    pureFnsCode: '{test: "pure"}',
    routerCacheCode: '{test: "router"}',
};

describe('generateInProcessAOTCaches', () => {
    it('should load server entry, call initFn, and return serialized caches', async () => {
        const initApi = vi.fn();
        const getSerializedCaches = vi.fn().mockResolvedValue(mockCacheData);

        const loadModule = createMockLoader({
            '/app/api/src/api.ts': {initApi},
            '@mionjs/router/aot': {getSerializedCaches},
        });

        const options: InProcessAOTOptions = {
            serverEntry: '/app/api/src/api.ts',
        };

        const result = await generateInProcessAOTCaches(loadModule, options);

        expect(loadModule).toHaveBeenCalledWith('/app/api/src/api.ts');
        expect(initApi).toHaveBeenCalledOnce();
        expect(loadModule).toHaveBeenCalledWith('@mionjs/router/aot');
        expect(getSerializedCaches).toHaveBeenCalledOnce();
        expect(result).toEqual(mockCacheData);
    });

    it('should use custom initFn name when provided', async () => {
        const startServer = vi.fn();
        const getSerializedCaches = vi.fn().mockResolvedValue(mockCacheData);

        const loadModule = createMockLoader({
            '/app/server.ts': {startServer},
            '@mionjs/router/aot': {getSerializedCaches},
        });

        const options: InProcessAOTOptions = {
            serverEntry: '/app/server.ts',
            initFn: 'startServer',
        };

        const result = await generateInProcessAOTCaches(loadModule, options);

        expect(startServer).toHaveBeenCalledOnce();
        expect(result).toEqual(mockCacheData);
    });

    it('should default initFn to initApi', async () => {
        const initApi = vi.fn();
        const getSerializedCaches = vi.fn().mockResolvedValue(mockCacheData);

        const loadModule = createMockLoader({
            '/app/api.ts': {initApi},
            '@mionjs/router/aot': {getSerializedCaches},
        });

        await generateInProcessAOTCaches(loadModule, {serverEntry: '/app/api.ts'});
        expect(initApi).toHaveBeenCalledOnce();
    });

    it('should support Promise exports (top-level init pattern)', async () => {
        const getSerializedCaches = vi.fn().mockResolvedValue(mockCacheData);
        // Simulate: export const defaultApi = initMionRouter(...)
        const defaultApi = Promise.resolve({routes: {}});

        const loadModule = createMockLoader({
            '/app/defaultRoutes.ts': {defaultApi},
            '@mionjs/router/aot': {getSerializedCaches},
        });

        const result = await generateInProcessAOTCaches(loadModule, {
            serverEntry: '/app/defaultRoutes.ts',
            initFn: 'defaultApi',
        });

        expect(getSerializedCaches).toHaveBeenCalledOnce();
        expect(result).toEqual(mockCacheData);
    });

    it('should throw if server entry does not export the init function', async () => {
        const loadModule = createMockLoader({
            '/app/api.ts': {someOtherExport: () => {}},
            '@mionjs/router/aot': {getSerializedCaches: vi.fn()},
        });

        await expect(generateInProcessAOTCaches(loadModule, {serverEntry: '/app/api.ts'})).rejects.toThrow(
            "does not export 'initApi'"
        );
    });

    it('should throw if @mionjs/router/aot does not export getSerializedCaches', async () => {
        const loadModule = createMockLoader({
            '/app/api.ts': {initApi: vi.fn()},
            '@mionjs/router/aot': {},
        });

        await expect(generateInProcessAOTCaches(loadModule, {serverEntry: '/app/api.ts'})).rejects.toThrow(
            'does not export getSerializedCaches'
        );
    });

    it('should propagate errors from initFn', async () => {
        const initApi = vi.fn().mockRejectedValue(new Error('Init failed'));

        const loadModule = createMockLoader({
            '/app/api.ts': {initApi},
            '@mionjs/router/aot': {getSerializedCaches: vi.fn()},
        });

        await expect(generateInProcessAOTCaches(loadModule, {serverEntry: '/app/api.ts'})).rejects.toThrow('Init failed');
    });

    it('should propagate errors from getSerializedCaches', async () => {
        const getSerializedCaches = vi.fn().mockRejectedValue(new Error('Serialization failed'));

        const loadModule = createMockLoader({
            '/app/api.ts': {initApi: vi.fn()},
            '@mionjs/router/aot': {getSerializedCaches},
        });

        await expect(generateInProcessAOTCaches(loadModule, {serverEntry: '/app/api.ts'})).rejects.toThrow(
            'Serialization failed'
        );
    });

    it('should call loadModule in correct order: server entry first, then router/aot', async () => {
        const callOrder: string[] = [];
        const initApi = vi.fn(() => callOrder.push('initApi'));
        const getSerializedCaches = vi.fn(() => {
            callOrder.push('getSerializedCaches');
            return Promise.resolve(mockCacheData);
        });

        const loadModule = vi.fn((url: string) => {
            callOrder.push(`loadModule:${url}`);
            if (url === '/app/api.ts') return Promise.resolve({initApi});
            if (url === '@mionjs/router/aot') return Promise.resolve({getSerializedCaches});
            throw new Error(`Unexpected module: ${url}`);
        });

        await generateInProcessAOTCaches(loadModule, {serverEntry: '/app/api.ts'});

        expect(callOrder).toEqual(['loadModule:/app/api.ts', 'initApi', 'loadModule:@mionjs/router/aot', 'getSerializedCaches']);
    });
});
