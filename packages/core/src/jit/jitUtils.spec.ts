/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {getJitUtils, installJitLookupBackend, isJitLookupBackendInstalled, MissingJitBackendError} from './jitUtils.ts';
import type {JitLookupBackend, JitCompiledFn} from '@mionjs/core';

// R33 — core↔run-types backend coupling rides an import side effect (installJitLookupBackend
// runs at @mionjs/run-types module scope). Before this change getJIT/getCompiledPureFn silently
// returned undefined when the backend was not installed, so a mis-ordered import failed far away
// with a confusing "Jit function X not found" error. Core has no run-types dependency, so its own
// test project runs with NO backend installed — the perfect place to pin the fail-loud contract.

describe('jitUtils backend coupling (R33)', () => {
    const resetBackend = () => installJitLookupBackend(undefined as unknown as JitLookupBackend);
    beforeEach(resetBackend);
    afterEach(resetBackend);

    it('reports no backend installed by default', () => {
        expect(isJitLookupBackendInstalled()).toBe(false);
    });

    it('getJIT throws a clear MissingJitBackendError naming the missing import', () => {
        expect(() => getJitUtils().getJIT('isType_abc')).toThrow(MissingJitBackendError);
        expect(() => getJitUtils().getJIT('isType_abc')).toThrow(/@mionjs\/run-types/);
    });

    it('getCompiledPureFn throws a clear MissingJitBackendError when no backend is installed', () => {
        expect(() => getJitUtils().getCompiledPureFn('ns', 'fn')).toThrow(MissingJitBackendError);
    });

    it('existence probes stay quiet without a backend (no throw)', () => {
        expect(getJitUtils().hasJitFn('isType_abc')).toBe(false);
        expect(getJitUtils().hasPureFn('ns', 'fn')).toBe(false);
        expect(getJitUtils().getPureFn('ns', 'fn')).toBeUndefined();
    });

    it('resolves through the installed backend once present, and undefined is only for real misses', () => {
        const fakeJit = {fn: () => true} as unknown as JitCompiledFn;
        const backend: JitLookupBackend = {
            getJIT: (hash) => (hash === 'isType_abc' ? fakeJit : undefined),
            getCompiledPureFn: (ns, name) => (ns === 'ns' && name === 'fn' ? ({fn: () => 1} as any) : undefined),
        };
        installJitLookupBackend(backend);
        expect(isJitLookupBackendInstalled()).toBe(true);
        expect(getJitUtils().getJIT('isType_abc')).toBe(fakeJit);
        expect(getJitUtils().getJIT('missing_hash')).toBeUndefined(); // installed backend → real miss returns undefined
        expect(getJitUtils().hasJitFn('isType_abc')).toBe(true);
        expect(getJitUtils().getCompiledPureFn('ns', 'fn')).toBeTruthy();
    });
});
