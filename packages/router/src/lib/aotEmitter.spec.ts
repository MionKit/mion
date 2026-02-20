/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {AOTCacheMessage} from './aotEmitter.ts';
import {resetRouter} from '../router.ts';
import {resetJitFnCaches, getJitUtils} from '@mionkit/core';
import {
    cpf_asJSONString,
    cpf_getUnknownKeysFromArray,
    cpf_hasUnknownKeysFromArray,
    cpf_newRunTypeErr,
    cpf_formatErr,
    cpf_safeIterableKey,
    cpf_sanitizeCompiledFn,
} from '@mionkit/run-types/src/run-types-pure-fns.ts';

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
