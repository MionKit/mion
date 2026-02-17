import {describe, it, expect} from 'vitest';
import {generateVirtualModule} from './virtualModule.ts';
import {ExtractedPureFn} from './types.ts';
import {PURE_SERVER_FN_NAMESPACE} from './pureFnUtils.ts';

describe('generateVirtualModule', () => {
    it('should generate a valid module with one function keyed by namespace::fnName', () => {
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
        expect(result).toContain('pureFnsCache');
        // Key should be namespace::fnName
        expect(result).toContain(`"${PURE_SERVER_FN_NAMESPACE}::mapUsers"`);
        expect(result).toContain('"mapUsers"');
        expect(result).toContain('"abc12345"');
        expect(result).toContain('return users.map');
        expect(result).toContain('createJitFn');
        expect(result).toContain('new Set(');
        expect(result).toContain('isFactory: false');
    });

    it('should generate a module with multiple functions', () => {
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
        expect(result).toContain(`"${PURE_SERVER_FN_NAMESPACE}::fn1"`);
        expect(result).toContain(`"${PURE_SERVER_FN_NAMESPACE}::fn2"`);
        expect(result).toContain('"hash1111"');
        expect(result).toContain('"hash2222"');
        expect(result).toContain(`new Set(["${PURE_SERVER_FN_NAMESPACE}::fn1"])`);
    });

    it('should generate an empty module when no functions', () => {
        const result = generateVirtualModule([]);
        expect(result).toContain('pureFnsCache');
        expect(result).toContain('pureFnsCache = {');
    });

    it('should generate valid createJitFn closures for regular functions', () => {
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
        // The createJitFn should be a function that takes jitUtils and returns the pure function
        expect(result).toContain('function addOne(jitUtils)');
        expect(result).toContain('function addOne(x)');
    });

    it('should generate valid createJitFn closures for factory functions', () => {
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
        // Key should be namespace::fnName
        expect(result).toContain('"myNamespace::myFactory"');
        expect(result).toContain('isFactory: true');
        // Factory functions have a different createJitFn structure
        expect(result).toContain('function myFactory(jitUtils)');
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
        expect(result).toContain('"namespace1::fn1"');
        expect(result).toContain('"namespace2::fn2"');
        expect(result).toContain('namespace: "namespace1"');
        expect(result).toContain('namespace: "namespace2"');
        expect(result).toContain('new Set(["namespace1::fn1"])');
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
        expect(result).toContain(`"${PURE_SERVER_FN_NAMESPACE}::abc12345"`);
        // Function name should be safe for JS
        expect(result).toContain('function abc12345(jitUtils)');
    });
});
