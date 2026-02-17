import {describe, it, expect} from 'vitest';
import {createRegistry} from './registry.ts';
import {ExtractedPureFn} from './types.ts';
import {PURE_SERVER_FN_NAMESPACE} from './pureFnUtils.ts';

describe('createRegistry', () => {
    it('should create a registry from extracted functions (keyed by namespace::fnName)', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: PURE_SERVER_FN_NAMESPACE,
                fnName: 'mapUsers',
                paramNames: ['users'],
                code: 'return users.map((u) => ({userId: u.id}));',
                bodyHash: 'abc12345',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: false,
            },
        ];

        const registry = createRegistry(fns);
        expect(registry.version).toBe('1.0.0');
        // Registry is now keyed by namespace::fnName
        const key = `${PURE_SERVER_FN_NAMESPACE}::mapUsers`;
        expect(registry.entries[key]).toBeDefined();
        expect(registry.entries[key].namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        expect(registry.entries[key].fnName).toBe('mapUsers');
        expect(registry.entries[key].bodyHash).toBe('abc12345');
        expect(registry.entries[key].paramNames).toEqual(['users']);
        expect(registry.entries[key].isFactory).toBe(false);
    });

    it('should create a registry with multiple functions', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: PURE_SERVER_FN_NAMESPACE,
                fnName: 'fn1',
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'hash1',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: false,
            },
            {
                namespace: PURE_SERVER_FN_NAMESPACE,
                fnName: 'fn2',
                paramNames: ['x'],
                code: 'return x * 2;',
                bodyHash: 'hash2',
                dependencies: new Set([`${PURE_SERVER_FN_NAMESPACE}::fn1`]),
                sourceFile: 'test.ts',
                isFactory: false,
            },
        ];

        const registry = createRegistry(fns);
        expect(Object.keys(registry.entries)).toHaveLength(2);
        // Registry is now keyed by namespace::fnName
        const key2 = `${PURE_SERVER_FN_NAMESPACE}::fn2`;
        expect(registry.entries[key2].dependencies).toEqual(new Set([`${PURE_SERVER_FN_NAMESPACE}::fn1`]));
    });

    it('should handle functions with bodyHash as fnName (anonymous functions)', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: PURE_SERVER_FN_NAMESPACE,
                fnName: 'anonHash', // bodyHash used as fnName for anonymous functions
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'anonHash',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: false,
            },
        ];

        const registry = createRegistry(fns);
        const key = `${PURE_SERVER_FN_NAMESPACE}::anonHash`;
        expect(registry.entries[key]).toBeDefined();
        expect(registry.entries[key].fnName).toBe('anonHash');
        expect(registry.entries[key].bodyHash).toBe('anonHash');
    });

    it('should handle factory functions', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: 'myNamespace',
                fnName: 'myFactory',
                paramNames: ['jitUtils'],
                code: 'return function inner(x) { return x + 1; };',
                bodyHash: 'factoryHash',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: true,
            },
        ];

        const registry = createRegistry(fns);
        const key = 'myNamespace::myFactory';
        expect(registry.entries[key]).toBeDefined();
        expect(registry.entries[key].namespace).toBe('myNamespace');
        expect(registry.entries[key].fnName).toBe('myFactory');
        expect(registry.entries[key].isFactory).toBe(true);
    });

    it('should handle multiple namespaces', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: 'namespace1',
                fnName: 'fn1',
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'hash1',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: false,
            },
            {
                namespace: 'namespace2',
                fnName: 'fn2',
                paramNames: ['x'],
                code: 'return x * 2;',
                bodyHash: 'hash2',
                dependencies: new Set(['namespace1::fn1']),
                sourceFile: 'test.ts',
                isFactory: false,
            },
        ];

        const registry = createRegistry(fns);
        expect(registry.entries['namespace1::fn1']).toBeDefined();
        expect(registry.entries['namespace2::fn2']).toBeDefined();
        expect(registry.entries['namespace1::fn1'].namespace).toBe('namespace1');
        expect(registry.entries['namespace2::fn2'].namespace).toBe('namespace2');
        expect(registry.entries['namespace2::fn2'].dependencies).toEqual(new Set(['namespace1::fn1']));
    });
});
