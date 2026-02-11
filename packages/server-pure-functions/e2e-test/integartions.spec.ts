import {describe, it, expect, beforeAll} from 'vitest';
import {readFileSync} from 'fs';
import {join, resolve} from 'path';
import {extractPureFnsFromSource, PurityError} from '../src/extract';
import {createRegistry} from '../src/registry';
import {generateVirtualModule} from '../src/virtualModule';
import {resetHashes, pureFnHashLength} from '@mionkit/core';
import {PURE_SERVER_FN_NAMESPACE} from '../src/types';

const FIXTURE_DIR = resolve(__dirname, '.');
const CLIENT_SRC = join(FIXTURE_DIR, 'packages', 'test-client', 'src');

beforeAll(() => {
    resetHashes();
});

describe('E2E: Build extraction', () => {
    it('should extract all pureServerFn() calls from client source', () => {
        const source = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');
        const extracted = extractPureFnsFromSource(source, 'pureFns.ts');

        expect(extracted).toHaveLength(4);
        // fnName is now optional, but these named functions should still have names
        const names = extracted
            .map((f) => f.fnName)
            .filter(Boolean)
            .sort();
        expect(names).toEqual(['addOne', 'combineArrays', 'filterByThreshold', 'mapUsersToPreferences']);
    });

    it('should correctly extract function parameters', () => {
        const source = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');
        const extracted = extractPureFnsFromSource(source, 'pureFns.ts');

        const mapUsers = extracted.find((f) => f.fnName === 'mapUsersToPreferences');
        expect(mapUsers?.paramNames).toEqual(['users']);

        const addOne = extracted.find((f) => f.fnName === 'addOne');
        expect(addOne?.paramNames).toEqual(['x']);

        const combine = extracted.find((f) => f.fnName === 'combineArrays');
        expect(combine?.paramNames).toEqual(['a', 'b']);

        const filter = extracted.find((f) => f.fnName === 'filterByThreshold');
        expect(filter?.paramNames).toEqual(['items']);
    });

    it('should extract function bodies correctly', () => {
        const source = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');
        const extracted = extractPureFnsFromSource(source, 'pureFns.ts');

        const addOne = extracted.find((f) => f.fnName === 'addOne');
        expect(addOne?.code).toContain('return x + 1');

        const filter = extracted.find((f) => f.fnName === 'filterByThreshold');
        expect(filter?.code).toContain('threshold');
        expect(filter?.code).toContain('filter');
    });

    it('should generate bodyHash for each function', () => {
        const source = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');
        const extracted = extractPureFnsFromSource(source, 'pureFns.ts');

        for (const fn of extracted) {
            expect(fn.bodyHash).toBeDefined();
            expect(typeof fn.bodyHash).toBe('string');
            expect(fn.bodyHash.length).toBe(pureFnHashLength);
        }

        // All hashes should be unique
        const hashes = extracted.map((f) => f.bodyHash);
        expect(new Set(hashes).size).toBe(hashes.length);
    });
});

describe('E2E: Namespace assignment', () => {
    it('should place all extracted functions in the pureServerFn namespace', () => {
        const source = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');
        const extracted = extractPureFnsFromSource(source, 'pureFns.ts');
        const registry = createRegistry(extracted);

        for (const entry of Object.values(registry.entries)) {
            expect(entry.namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        }
    });
});

describe('E2E: Registry shape', () => {
    it('should produce a PureFunctionsCache-compatible registry (keyed by bodyHash)', () => {
        const source = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');
        const extracted = extractPureFnsFromSource(source, 'pureFns.ts');
        const registry = createRegistry(extracted);

        expect(registry.version).toBeDefined();
        expect(registry.entries).toBeDefined();

        for (const [key, entry] of Object.entries(registry.entries)) {
            // Key is now bodyHash, not fnName
            expect(key).toBe(entry.bodyHash);
            expect(entry.namespace).toBe(PURE_SERVER_FN_NAMESPACE);
            expect(entry.paramNames).toBeInstanceOf(Array);
            expect(typeof entry.code).toBe('string');
            expect(typeof entry.bodyHash).toBe('string');
            expect(entry.dependencies).toBeInstanceOf(Array);
        }
    });

    it('should generate a valid virtual module from extracted functions', () => {
        const source = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');
        const extracted = extractPureFnsFromSource(source, 'pureFns.ts');
        const virtualModule = generateVirtualModule(extracted);

        // Should be valid JavaScript
        expect(virtualModule).toContain('export const pureFnsCache');
        expect(virtualModule).toContain(JSON.stringify(PURE_SERVER_FN_NAMESPACE));

        // Should contain all function entries (keyed by bodyHash)
        for (const fn of extracted) {
            expect(virtualModule).toContain(JSON.stringify(fn.bodyHash));
        }

        // Should contain createJitFn closures
        expect(virtualModule).toContain('createJitFn');
    });
});

describe('E2E: Hash validation', () => {
    it('should detect hash mismatches between builds', () => {
        const source1 = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');
        const extracted1 = extractPureFnsFromSource(source1, 'pureFns.ts');

        // Find the addOne function by code pattern
        const addOne1 = extracted1.find((f) => f.code.includes('return x + 1'));
        expect(addOne1).toBeDefined();
        const hash1 = addOne1!.bodyHash;

        // Simulate a modified version of the same function
        const modifiedSource = source1.replace('return x + 1', 'return x + 999');
        resetHashes();
        const extracted2 = extractPureFnsFromSource(modifiedSource, 'pureFns.ts');

        // Find the modified addOne function by code pattern
        const addOne2 = extracted2.find((f) => f.code.includes('return x + 999'));
        expect(addOne2).toBeDefined();
        const hash2 = addOne2!.bodyHash;

        expect(hash1).toBeDefined();
        expect(hash2).toBeDefined();
        expect(hash1).not.toBe(hash2);
    });

    it('should produce consistent hashes for unchanged functions', () => {
        const source = readFileSync(join(CLIENT_SRC, 'pureFns.ts'), 'utf-8');

        const extracted1 = extractPureFnsFromSource(source, 'pureFns.ts');
        resetHashes();
        const extracted2 = extractPureFnsFromSource(source, 'pureFns.ts');

        // Match by code content since fnName is optional
        for (const fn1 of extracted1) {
            const fn2 = extracted2.find((f) => f.code === fn1.code);
            expect(fn2).toBeDefined();
            expect(fn1.bodyHash).toBe(fn2!.bodyHash);
        }
    });
});

describe('E2E: Purity enforcement', () => {
    it('should reject impure functions that access closure variables', () => {
        const source = readFileSync(join(CLIENT_SRC, 'impureFns.ts'), 'utf-8');
        expect(() => extractPureFnsFromSource(source, 'impureFns.ts')).toThrow(PurityError);
    });

    it('should reject functions using eval', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function evilFn(x) {
    return eval(x);
});
`;
        expect(() => extractPureFnsFromSource(source, 'evil.ts')).toThrow(PurityError);
    });

    it('should reject functions using dynamic import', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function importFn() {
    return import('./secret');
});
`;
        expect(() => extractPureFnsFromSource(source, 'import.ts')).toThrow(PurityError);
    });

    it('should reject functions accessing process', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function processFn() {
    return process.env.SECRET;
});
`;
        expect(() => extractPureFnsFromSource(source, 'process.ts')).toThrow(PurityError);
    });

    it('should accept pure functions using only allowed globals', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function pureFn(items) {
    const result = items.map((x) => Math.floor(x));
    return JSON.stringify(result);
});
`;
        const extracted = extractPureFnsFromSource(source, 'pure.ts');
        expect(extracted).toHaveLength(1);
    });

    it('should accept anonymous arrow functions', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn((x) => x * 2);
`;
        const extracted = extractPureFnsFromSource(source, 'anonymous.ts');
        expect(extracted).toHaveLength(1);
        expect(extracted[0].fnName).toBe('fn'); // Gets name from variable declaration
        expect(extracted[0].bodyHash).toBeDefined();
    });
});
