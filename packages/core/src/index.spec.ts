/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

const COUNTER_KEY = Symbol.for('mion.core.loadCounter');

describe('@mionjs/core double-load detector', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('emits a warning on second load with a count > 1', async () => {
        // Force the counter to look like core has already been loaded once.
        // Re-importing index.ts will then bump the count to 2 and trigger the warning.
        (globalThis as any)[COUNTER_KEY] = {count: 1};
        vi.resetModules();
        await import('../index.ts');
        expect(warnSpy).toHaveBeenCalled();
        const msg = String(warnSpy.mock.calls[0]?.[0] ?? '');
        expect(msg).toMatch(/loaded 2 times/);
        expect(msg).toMatch(/ssr\.noExternal/);
    });

    it('respects MION_SUPPRESS_DUAL_LOAD_WARN', async () => {
        const original = process.env.MION_SUPPRESS_DUAL_LOAD_WARN;
        process.env.MION_SUPPRESS_DUAL_LOAD_WARN = '1';
        try {
            (globalThis as any)[COUNTER_KEY] = {count: 1};
            vi.resetModules();
            await import('../index.ts');
            expect(warnSpy).not.toHaveBeenCalled();
        } finally {
            if (original === undefined) delete process.env.MION_SUPPRESS_DUAL_LOAD_WARN;
            else process.env.MION_SUPPRESS_DUAL_LOAD_WARN = original;
        }
    });
});
