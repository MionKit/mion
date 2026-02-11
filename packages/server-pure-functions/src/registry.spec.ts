import {describe, it, expect} from 'vitest';
import {createRegistry} from './registry';
import {ExtractedPureFn, PURE_SERVER_FN_NAMESPACE} from './types';

describe('createRegistry', () => {
    it('should create a registry from extracted functions (keyed by bodyHash)', () => {
        const fns: ExtractedPureFn[] = [
            {
                fnName: 'mapUsers',
                paramNames: ['users'],
                code: 'return users.map((u) => ({userId: u.id}));',
                bodyHash: 'abc12345',
                dependencies: [],
                sourceFile: 'test.ts',
            },
        ];

        const registry = createRegistry(fns);
        expect(registry.version).toBe('1.0.0');
        // Registry is now keyed by bodyHash, not fnName
        expect(registry.entries['abc12345']).toBeDefined();
        expect(registry.entries['abc12345'].namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        expect(registry.entries['abc12345'].fnName).toBe('mapUsers');
        expect(registry.entries['abc12345'].bodyHash).toBe('abc12345');
        expect(registry.entries['abc12345'].paramNames).toEqual(['users']);
    });

    it('should create a registry with multiple functions', () => {
        const fns: ExtractedPureFn[] = [
            {
                fnName: 'fn1',
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'hash1',
                dependencies: [],
                sourceFile: 'test.ts',
            },
            {
                fnName: 'fn2',
                paramNames: ['x'],
                code: 'return x * 2;',
                bodyHash: 'hash2',
                dependencies: ['fn1'],
                sourceFile: 'test.ts',
            },
        ];

        const registry = createRegistry(fns);
        expect(Object.keys(registry.entries)).toHaveLength(2);
        // Registry is now keyed by bodyHash
        expect(registry.entries['hash2'].dependencies).toEqual(['fn1']);
    });

    it('should handle anonymous functions (fnName is undefined)', () => {
        const fns: ExtractedPureFn[] = [
            {
                fnName: undefined,
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'anonHash',
                dependencies: [],
                sourceFile: 'test.ts',
            },
        ];

        const registry = createRegistry(fns);
        expect(registry.entries['anonHash']).toBeDefined();
        expect(registry.entries['anonHash'].fnName).toBeUndefined();
        expect(registry.entries['anonHash'].bodyHash).toBe('anonHash');
    });
});
