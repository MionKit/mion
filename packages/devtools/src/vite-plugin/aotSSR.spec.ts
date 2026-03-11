import {describe, it, expect, vi} from 'vitest';
import {loadSSRRouterAndGenerateAOTCaches} from './aotCacheGenerator.ts';

const mockCacheData = {
    jitFnsCode: '{test: "jit"}',
    pureFnsCode: '{test: "pure"}',
    routerCacheCode: '{test: "router"}',
};

/** Simulates what emitAOTCaches() does: calls process.send with the cache message */
function simulateEmitAOTCaches() {
    (process as any).send({
        type: 'mion-aot-caches',
        ...mockCacheData,
    });
}

/** Creates a mock loader where loading the startServerScript triggers process.send (like the real router) */
function createMockLoader(startScript: string) {
    return vi.fn((url: string) => {
        if (url === startScript) {
            // Simulate: module loads → initMionRouter() → emitAOTCaches() → process.send()
            simulateEmitAOTCaches();
        }
        return Promise.resolve({});
    });
}

describe('generateSSRAOTCaches', () => {
    it('should load startServerScript and capture emitted AOT caches via process.send', async () => {
        const loadModule = createMockLoader('/app/src/server.ts');

        const result = await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');

        expect(loadModule).toHaveBeenCalledWith('/app/src/server.ts');
        expect(result).toEqual(mockCacheData);
    });

    it('should only call loadModule once (no separate router/aot load)', async () => {
        const loadModule = createMockLoader('/app/src/server.ts');

        await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');

        expect(loadModule).toHaveBeenCalledTimes(1);
        expect(loadModule).toHaveBeenCalledWith('/app/src/server.ts');
    });

    it('should set MION_COMPILE=true before loading and restore after', async () => {
        let envDuringLoad: string | undefined;
        const loadModule = vi.fn((_url: string) => {
            envDuringLoad = process.env.MION_COMPILE;
            simulateEmitAOTCaches();
            return Promise.resolve({});
        });

        const prevCompile = process.env.MION_COMPILE;
        delete process.env.MION_COMPILE;

        try {
            await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');
            expect(envDuringLoad).toBe('true');
            expect(process.env.MION_COMPILE).toBeUndefined();
        } finally {
            if (prevCompile !== undefined) process.env.MION_COMPILE = prevCompile;
        }
    });

    it('should restore process.send after completion', async () => {
        const loadModule = createMockLoader('/app/src/server.ts');
        const originalSend = process.send;

        await loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');

        expect(process.send).toBe(originalSend);
    });

    it('should propagate errors from loadModule', async () => {
        const loadModule = vi.fn().mockRejectedValue(new Error('Module load failed'));

        await expect(loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts')).rejects.toThrow('Module load failed');
    });

    it('should timeout if startServerScript never emits AOT caches', async () => {
        vi.useFakeTimers();
        try {
            // Module loads but never calls process.send
            const loadModule = vi.fn().mockResolvedValue({});

            const promise = loadSSRRouterAndGenerateAOTCaches(loadModule, '/app/src/server.ts');
            // Suppress unhandled rejection from the timeout Promise.race loser
            promise.catch(() => {});
            await vi.advanceTimersByTimeAsync(30_001);

            await expect(promise).rejects.toThrow('timed out');
        } finally {
            vi.useRealTimers();
        }
    });
});
