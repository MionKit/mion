import {describe, it, expect} from 'vitest';
import {generateVirtualModule} from './virtualModule.ts';
import {ExtractedPureFn} from './types.ts';
import {PURE_SERVER_FN_NAMESPACE} from '@mionkit/core';

describe('generateVirtualModule', () => {
    it('should generate a valid module with one function', () => {
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

        const result = generateVirtualModule(fns);
        expect(result).toContain('pureFnsCache');
        expect(result).toContain(JSON.stringify(PURE_SERVER_FN_NAMESPACE));
        expect(result).toContain('"mapUsers"');
        expect(result).toContain('"abc12345"');
        expect(result).toContain('return users.map');
        expect(result).toContain('createJitFn');
        expect(result).toContain('new Set(');
    });

    it('should generate a module with multiple functions', () => {
        const fns: ExtractedPureFn[] = [
            {
                fnName: 'fn1',
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'hash1111',
                dependencies: [],
                sourceFile: 'test.ts',
            },
            {
                fnName: 'fn2',
                paramNames: ['x', 'y'],
                code: 'return x * y;',
                bodyHash: 'hash2222',
                dependencies: ['fn1'],
                sourceFile: 'test.ts',
            },
        ];

        const result = generateVirtualModule(fns);
        expect(result).toContain('"fn1"');
        expect(result).toContain('"fn2"');
        expect(result).toContain('"hash1111"');
        expect(result).toContain('"hash2222"');
        expect(result).toContain('new Set(["fn1"])');
    });

    it('should generate an empty module when no functions', () => {
        const result = generateVirtualModule([]);
        expect(result).toContain('pureFnsCache');
        expect(result).toContain(JSON.stringify(PURE_SERVER_FN_NAMESPACE));
    });

    it('should generate valid createJitFn closures', () => {
        const fns: ExtractedPureFn[] = [
            {
                fnName: 'addOne',
                paramNames: ['x'],
                code: 'return x + 1;',
                bodyHash: 'hashtest',
                dependencies: [],
                sourceFile: 'test.ts',
            },
        ];

        const result = generateVirtualModule(fns);
        // The createJitFn should be a function that takes jitUtils and returns the pure function
        expect(result).toContain('function addOne(jitUtils)');
        expect(result).toContain('function addOne(x)');
    });
});
