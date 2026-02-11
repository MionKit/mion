import {describe, it, expect, beforeAll} from 'vitest';
import {join, resolve} from 'path';
import {readdirSync, readFileSync, statSync} from 'fs';
import {extractPureFnsFromSource} from '../../../src/extract';
import {generateVirtualModule} from '../../../src/virtualModule';
import {resetHashes} from '@mionkit/core';
import {PURE_SERVER_FN_NAMESPACE, ExtractedPureFn} from '../../../src/types';
import {getJitUtils, resetJitFnCaches, addAOTCaches} from '@mionkit/core';

const FIXTURE_DIR = resolve(__dirname, '../..');
const CLIENT_SRC = join(FIXTURE_DIR, 'packages', 'test-client', 'src');

beforeAll(() => {
    resetHashes();
    resetJitFnCaches();
});

/** Scans the client source directory and extracts all pure functions (simulates server plugin behavior) */
function scanClientSource(): ExtractedPureFn[] {
    const fns: ExtractedPureFn[] = [];

    function scanDir(dir: string) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                scanDir(fullPath);
            } else if (stat.isFile() && /\.(ts|tsx)$/.test(fullPath)) {
                try {
                    const code = readFileSync(fullPath, 'utf-8');
                    if (!code.includes('pureServerFn')) continue;
                    const extracted = extractPureFnsFromSource(code, fullPath);
                    fns.push(...extracted);
                } catch {
                    // Skip files that can't be parsed (like impureFns.ts which throws)
                }
            }
        }
    }

    scanDir(CLIENT_SRC);
    return fns;
}

/** Generates virtual module from extracted functions and registers into core */
function loadPureFunctionsIntoCore(fns: ExtractedPureFn[]) {
    const virtualModuleCode = generateVirtualModule(fns);

    // Evaluate the virtual module (simulates server importing virtual:mion-pure-functions)
    const moduleExports: any = {};
    const moduleCode = virtualModuleCode.replace('export const', 'moduleExports.');
    eval(moduleCode);

    // Register into the core runtime
    addAOTCaches({}, moduleExports.pureFnsCache);
}

describe('E2E: Server scans client source and executes pure functions', () => {
    it('should scan client source directly and execute pure functions without client build', () => {
        // Server scans client TypeScript source directly (no build required)
        const extractedFns = scanClientSource();

        expect(extractedFns.length).toBeGreaterThanOrEqual(4);

        // All entries should have bodyHash (fnName is optional now)
        for (const fn of extractedFns) {
            // Verify function structure
            expect(fn.bodyHash).toBeDefined();
            expect(fn.code).toBeDefined();
            expect(fn.paramNames).toBeInstanceOf(Array);
        }

        // Load into core runtime
        loadPureFunctionsIntoCore(extractedFns);

        // Find functions by name (for named functions) or by code pattern
        const addOne = extractedFns.find((f) => f.fnName === 'addOne' || f.code.includes('return x + 1'));
        const mapUsers = extractedFns.find((f) => f.fnName === 'mapUsersToPreferences' || f.code.includes('userId'));
        const combine = extractedFns.find((f) => f.fnName === 'combineArrays' || f.code.includes('[...a, ...b]'));
        const filter = extractedFns.find((f) => f.fnName === 'filterByThreshold' || f.code.includes('threshold'));

        expect(addOne).toBeDefined();
        expect(mapUsers).toBeDefined();
        expect(combine).toBeDefined();
        expect(filter).toBeDefined();

        // Verify all functions are accessible via jitUtils using bodyHash
        const jitUtils = getJitUtils();
        expect(jitUtils.hasPureFn(PURE_SERVER_FN_NAMESPACE, addOne!.bodyHash)).toBe(true);
        expect(jitUtils.hasPureFn(PURE_SERVER_FN_NAMESPACE, mapUsers!.bodyHash)).toBe(true);
        expect(jitUtils.hasPureFn(PURE_SERVER_FN_NAMESPACE, combine!.bodyHash)).toBe(true);
        expect(jitUtils.hasPureFn(PURE_SERVER_FN_NAMESPACE, filter!.bodyHash)).toBe(true);

        // Execute addOne using bodyHash
        const addOneFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, addOne!.bodyHash);
        expect(addOneFn).toBeInstanceOf(Function);
        expect(addOneFn(5)).toBe(6);
        expect(addOneFn(0)).toBe(1);
        expect(addOneFn(-1)).toBe(0);

        // Execute mapUsersToPreferences using bodyHash
        const mapFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, mapUsers!.bodyHash);
        const users = [
            {id: 1, name: 'Alice', preferences: {theme: 'dark'}},
            {id: 2, name: 'Bob', preferences: {theme: 'light'}},
        ];
        expect(mapFn(users)).toEqual([
            {userId: 1, prefs: {theme: 'dark'}},
            {userId: 2, prefs: {theme: 'light'}},
        ]);

        // Execute combineArrays using bodyHash
        const combineFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, combine!.bodyHash);
        expect(combineFn([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);

        // Execute filterByThreshold using bodyHash
        const filterFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, filter!.bodyHash);
        const items = [
            {name: 'low', value: 5},
            {name: 'high', value: 15},
            {name: 'medium', value: 10},
            {name: 'very-high', value: 100},
        ];
        expect(filterFn(items)).toEqual([
            {name: 'high', value: 15},
            {name: 'very-high', value: 100},
        ]);
    });

    it('should produce valid bodyHashes that match between extraction and core cache', () => {
        const extractedFns = scanClientSource();
        loadPureFunctionsIntoCore(extractedFns);

        // Verify bodyHash matches between extracted functions and core cache (using bodyHash as key)
        for (const fn of extractedFns) {
            const compiled = getJitUtils().getCompiledPureFn(PURE_SERVER_FN_NAMESPACE, fn.bodyHash);
            expect(compiled).toBeDefined();
            expect(compiled?.bodyHash).toBe(fn.bodyHash);
        }
    });
});
