import {describe, it, expect} from 'vitest';
import {generateVirtualModule} from './virtualModule.ts';
import {ExtractedPureFn} from './types.ts';
import {PURE_SERVER_FN_NAMESPACE} from './pureFnUtils.ts';

describe('generateVirtualModule', () => {
    it('should generate a valid module with one function nested by namespace', () => {
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

        const result = generateVirtualModule(fns);
        expect(result).toContain('serverPureFnsCache');
        // Namespace level key
        expect(result).toContain(`"${PURE_SERVER_FN_NAMESPACE}"`);
        // Function name as nested key
        expect(result).toContain('"mapUsers"');
        expect(result).toContain('"abc12345"');
        expect(result).toContain('return users.map');
        expect(result).toContain('pureFnDependencies: []');
        expect(result).toContain('isFactory: false');
        // Regular functions have direct fn, not createFn
        expect(result).toContain('fn: function mapUsers(users)');
    });

    it('should generate a module with multiple functions and dependencies', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: PURE_SERVER_FN_NAMESPACE,
                fnName: 'fn1',
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'hash1111',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: false,
            },
            {
                namespace: PURE_SERVER_FN_NAMESPACE,
                fnName: 'fn2',
                paramNames: ['x', 'y'],
                code: 'return x * y;',
                bodyHash: 'hash2222',
                dependencies: new Set([`${PURE_SERVER_FN_NAMESPACE}::fn1`]),
                sourceFile: 'test.ts',
                isFactory: false,
            },
        ];

        const result = generateVirtualModule(fns);
        expect(result).toContain('"fn1"');
        expect(result).toContain('"fn2"');
        expect(result).toContain('"hash1111"');
        expect(result).toContain('"hash2222"');
        // Dependencies should be stripped to just fnName
        expect(result).toContain('pureFnDependencies: ["fn1"]');
    });

    it('should generate an empty module when no functions', () => {
        const result = generateVirtualModule([]);
        expect(result).toContain('serverPureFnsCache');
        expect(result).toContain('serverPureFnsCache = {');
    });

    it('should generate direct fn for regular pure functions', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: PURE_SERVER_FN_NAMESPACE,
                fnName: 'addOne',
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'hashtest',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: false,
            },
        ];

        const result = generateVirtualModule(fns);
        // Regular functions should have a direct fn property
        expect(result).toContain('fn: function addOne(x)');
        // Should NOT have createFn for non-factory functions
        expect(result).not.toContain('createFn');
    });

    it('should generate createFn for factory functions', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: 'myNamespace',
                fnName: 'myFactory',
                paramNames: ['jitUtils'],
                code: `const dep = jitUtils.getPureFunction('someDep');
return function inner(x) {
    return dep(x) + 1;
};`,
                bodyHash: 'factoryhash',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: true,
            },
        ];

        const result = generateVirtualModule(fns);
        expect(result).toContain('"myNamespace"');
        expect(result).toContain('"myFactory"');
        expect(result).toContain('isFactory: true');
        // Factory functions have createFn and fn: undefined
        expect(result).toContain('fn: undefined');
        expect(result).toContain('createFn: function myFactory(jitUtils)');
        expect(result).toContain('function factory(jitUtils)');
    });

    it('should support multiple namespaces', () => {
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

        const result = generateVirtualModule(fns);
        expect(result).toContain('"namespace1"');
        expect(result).toContain('"namespace2"');
        expect(result).toContain('namespace: "namespace1"');
        expect(result).toContain('namespace: "namespace2"');
        // Cross-namespace dependency stripped to fnName
        expect(result).toContain('pureFnDependencies: ["fn1"]');
    });

    it('should handle function names with special characters', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: PURE_SERVER_FN_NAMESPACE,
                fnName: 'abc12345', // bodyHash used as name for anonymous functions
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'abc12345',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: false,
            },
        ];

        const result = generateVirtualModule(fns);
        expect(result).toContain(`"${PURE_SERVER_FN_NAMESPACE}"`);
        expect(result).toContain('"abc12345"');
        // Function name should be safe for JS
        expect(result).toContain('function abc12345(x)');
    });

    it('should generate evaluable code that produces correct results', () => {
        const fns: ExtractedPureFn[] = [
            {
                namespace: 'testNs',
                fnName: 'double',
                paramNames: ['x'],
                code: 'return x * 2;',
                bodyHash: 'testhash',
                dependencies: new Set(),
                sourceFile: 'test.ts',
                isFactory: false,
            },
        ];

        const result = generateVirtualModule(fns);
        // Evaluate the generated module code (strip 'export' for new Function)
        const evalCode = result.replace(/^export /gm, '') + '\nreturn serverPureFnsCache;';
        const fn = new Function(evalCode);
        const cache = fn();
        expect(cache.testNs.double.fn(5)).toBe(10);
        expect(cache.testNs.double.bodyHash).toBe('testhash');
        expect(cache.testNs.double.namespace).toBe('testNs');
    });
});
