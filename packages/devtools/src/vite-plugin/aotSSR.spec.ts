import {describe, it, expect, vi} from 'vitest';
import {loadSSRRouterAndGenerateAOTCaches} from './aotCacheGenerator.ts';

const mockCacheData = {
    jitFnsCode: '{test: "jit"}',
    pureFnsCode: '{test: "pure"}',
    routerCacheCode: '{test: "router"}',
};

// `@mionjs/router/aot` is now consumed via native dynamic import inside
// loadSSRRouterAndGenerateAOTCaches (to hit the same Node ESM cache the
// user-loaded router populated). Mock that module directly.
vi.mock('@mionjs/router/aot', () => ({
    getSerializedCaches: () => Promise.resolve(mockCacheData),
}));

/** Creates a mock loader for the user's start script (the only thing still routed through loadModule). */
function createMockLoader(_startScript: string) {
    return vi.fn((_url: string) => {
        // Simulate: module loads → initMionRouter() populates caches (no process.send in SSR mode)
        return Promise.resolve({});
    });
}

describe('generateSSRAOTCaches', () => {
    it('should load startScript via loadModule and retrieve caches via dynamic import of @mionjs/router/aot', async () => {
        const loadModule = createMockLoader('/app/src/server.ts');

        const result = await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');

        expect(loadModule).toHaveBeenCalledWith('/app/src/server.ts');
        expect(result).toEqual(mockCacheData);
    });

    it('should call loadModule once (start script only — @mionjs/router/aot is loaded via native import)', async () => {
        const loadModule = createMockLoader('/app/src/server.ts');

        await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');

        expect(loadModule).toHaveBeenCalledTimes(1);
        expect(loadModule).toHaveBeenNthCalledWith(1, '/app/src/server.ts');
    });

    it('should set MION_COMPILE=middleware before loading and restore after', async () => {
        let envDuringLoad: string | undefined;
        const loadModule = vi.fn((url: string) => {
            if (url === '/app/src/server.ts') {
                envDuringLoad = process.env.MION_COMPILE;
            }
            return Promise.resolve({});
        });

        const prevCompile = process.env.MION_COMPILE;
        delete process.env.MION_COMPILE;

        try {
            await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');
            expect(envDuringLoad).toBe('middleware');
            expect(process.env.MION_COMPILE).toBeUndefined();
        } finally {
            if (prevCompile !== undefined) process.env.MION_COMPILE = prevCompile;
        }
    });

    it('should not modify process.send', async () => {
        const loadModule = createMockLoader('/app/src/server.ts');
        const originalSend = process.send;

        await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');

        expect(process.send).toBe(originalSend);
    });

    it('should propagate errors from loadModule', async () => {
        const loadModule = vi.fn().mockRejectedValue(new Error('Module load failed'));

        await expect(loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts')).rejects.toThrow('Module load failed');
    });

    it('should restore MION_COMPILE even when loadModule throws', async () => {
        const prevCompile = process.env.MION_COMPILE;
        delete process.env.MION_COMPILE;

        const loadModule = vi.fn().mockRejectedValue(new Error('fail'));

        try {
            await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts').catch(() => {});
            expect(process.env.MION_COMPILE).toBeUndefined();
        } finally {
            if (prevCompile !== undefined) process.env.MION_COMPILE = prevCompile;
        }
    });

    it('should set MION_AOT_IS_CLIENT when isClient is true and restore after', async () => {
        let envDuringLoad: string | undefined;
        const loadModule = vi.fn((url: string) => {
            if (url === '/app/src/server.ts') {
                envDuringLoad = process.env.MION_AOT_IS_CLIENT;
            }
            return Promise.resolve({});
        });

        const prevIsClient = process.env.MION_AOT_IS_CLIENT;
        delete process.env.MION_AOT_IS_CLIENT;

        try {
            await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts', true);
            expect(envDuringLoad).toBe('true');
            expect(process.env.MION_AOT_IS_CLIENT).toBeUndefined();
        } finally {
            if (prevIsClient !== undefined) process.env.MION_AOT_IS_CLIENT = prevIsClient;
        }
    });

    it('should not set MION_AOT_IS_CLIENT when isClient is false or undefined', async () => {
        let envDuringLoad: string | undefined;
        const loadModule = vi.fn((url: string) => {
            if (url === '/app/src/server.ts') {
                envDuringLoad = process.env.MION_AOT_IS_CLIENT;
            }
            return Promise.resolve({});
        });

        delete process.env.MION_AOT_IS_CLIENT;

        await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');
        expect(envDuringLoad).toBeUndefined();
    });

    it('should restore MION_AOT_IS_CLIENT even when loadModule throws', async () => {
        const prevIsClient = process.env.MION_AOT_IS_CLIENT;
        delete process.env.MION_AOT_IS_CLIENT;

        const loadModule = vi.fn().mockRejectedValue(new Error('fail'));

        try {
            await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts', true).catch(() => {});
            expect(process.env.MION_AOT_IS_CLIENT).toBeUndefined();
        } finally {
            if (prevIsClient !== undefined) process.env.MION_AOT_IS_CLIENT = prevIsClient;
        }
    });
});
