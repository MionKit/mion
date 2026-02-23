import {describe, it, expect} from 'vitest';
import * as ts from 'typescript';
import {createPureFnTransformerFactory} from './transformers.ts';
import {ExtractedPureFn} from './types.ts';
import {BODY_HASH_LENGTH} from './constants.ts';

/** Helper: runs the transformer via ts.transpileModule and returns the output JS */
function transformWithPureFn(source: string, filePath = 'test.ts'): {output: string; collected: ExtractedPureFn[]} {
    const collected: ExtractedPureFn[] = [];
    const result = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
        },
        fileName: filePath,
        transformers: {
            before: [createPureFnTransformerFactory(source, filePath, collected)],
        },
    });
    return {output: result.outputText, collected};
}

describe('pureFnTransformer - pureServerFn', () => {
    it('should inject bodyHash as 2nd string argument', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
export const fn = pureServerFn({
    pureFn: function addOne(x) { return x + 1; }
});
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(1);
        const hash = collected[0].bodyHash;
        expect(hash.length).toBe(BODY_HASH_LENGTH);
        // Output should contain the hash as a string argument
        expect(output).toContain(`"${hash}"`);
        // Original function structure should be preserved
        expect(output).toContain('function addOne(x)');
    });

    it('should handle multiple pureServerFn calls in one file', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
export const fn1 = pureServerFn({
    pureFn: function addOne(x) { return x + 1; }
});
export const fn2 = pureServerFn({
    pureFn: function double(x) { return x * 2; }
});
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(2);
        expect(output).toContain(`"${collected[0].bodyHash}"`);
        expect(output).toContain(`"${collected[1].bodyHash}"`);
    });

    it('should be idempotent — skip calls that already have 2 arguments', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
export const fn = pureServerFn({
    pureFn: function addOne(x) { return x + 1; }
}, 'existingHash');
`;
        const {output, collected} = transformWithPureFn(source);
        // Should not collect (already has 2 args)
        expect(collected).toHaveLength(0);
        // Should preserve the existing hash
        expect(output).toContain('existingHash');
    });

    it('should return source unchanged for files without target calls', () => {
        const source = `const x = 1; export function hello() { return 'world'; }`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(0);
        expect(output).toContain('const x = 1');
    });

    it('should handle pureServerFn with custom namespace and fnName', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
export const fn = pureServerFn({
    pureFn: function myFn(x) { return x; },
    namespace: 'customNs',
    fnName: 'customName'
});
`;
        const {collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(1);
        expect(collected[0].namespace).toBe('customNs');
        expect(collected[0].fnName).toBe('customName');
    });

    it('should handle variable reference as argument', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
const myDef = {
    pureFn: function addOne(x) { return x + 1; },
    fnName: 'addOne'
};
export const fn = pureServerFn(myDef);
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(1);
        expect(collected[0].fnName).toBe('addOne');
        expect(output).toContain(`"${collected[0].bodyHash}"`);
    });

    it('should handle TypeScript type annotations', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
interface User { id: number; name: string; }
export const fn = pureServerFn({
    pureFn: function mapUsers(users: User[]): {userId: number}[] {
        return users.map((u: User) => ({userId: u.id}));
    }
});
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(1);
        expect(output).toContain(`"${collected[0].bodyHash}"`);
    });

    it('should inject bodyHash for plain function expression', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
export const fn = pureServerFn(function addOne(x) { return x + 1; });
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(1);
        const hash = collected[0].bodyHash;
        expect(hash.length).toBe(BODY_HASH_LENGTH);
        expect(output).toContain(`"${hash}"`);
        expect(output).toContain('function addOne(x)');
    });

    it('should inject bodyHash for plain arrow function', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
export const fn = pureServerFn((x) => x + 1);
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(1);
        expect(output).toContain(`"${collected[0].bodyHash}"`);
    });

    it('should be idempotent for plain function with existing hash', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
export const fn = pureServerFn((x) => x + 1, 'existingHash');
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(0);
        expect(output).toContain('existingHash');
    });

    it('should handle mixed plain and PureFnDef calls', () => {
        const source = `
import {pureServerFn} from '@mionkit/core';
export const fn1 = pureServerFn((x) => x + 1);
export const fn2 = pureServerFn({
    pureFn: function double(x) { return x * 2; }
});
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(2);
        expect(output).toContain(`"${collected[0].bodyHash}"`);
        expect(output).toContain(`"${collected[1].bodyHash}"`);
    });
});

describe('pureFnTransformer - registerPureFnFactory', () => {
    it('should inject ParsedFactoryFn as 4th argument', () => {
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mion', 'isHours', function () {
    return function is_h(hours) {
        const h = Number(hours);
        return h >= 0 && h <= 23;
    };
});
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(1);
        // Should contain the injected ParsedFactoryFn object properties
        expect(output).toContain('bodyHash');
        expect(output).toContain('paramNames');
        expect(output).toContain('code');
        // Original code structure should be preserved
        expect(output).toContain('function is_h');
    });

    it('should handle multiple registerPureFnFactory calls', () => {
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf1 = registerPureFnFactory('mion', 'fn1', function () {
    return function a(x) { return x + 1; };
});
export const cpf2 = registerPureFnFactory('mion', 'fn2', function () {
    return function b(x) { return x * 2; };
});
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(2);
        // Both should have bodyHash in the output
        const matches = output.match(/bodyHash/g);
        expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    it('should be idempotent — skip calls that already have 4 arguments', () => {
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mion', 'fn', function () {
    return function t(x) { return x; };
}, {bodyHash: 'existing', paramNames: [], code: 'return x;'});
`;
        const {collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(0);
    });

    it('should inject correct paramNames for factory with parameter', () => {
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mionFormats', 'dateFn', function (jUtil) {
    const dep = jUtil.getPureFn('mionFormats', 'isDate');
    return function check(v) { return dep(v); };
});
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(1);
        expect(collected[0].paramNames).toEqual(['jUtil']);
        expect(output).toContain('jUtil');
    });

    it('should return source unchanged for files without registerPureFnFactory', () => {
        const source = `const x = 1; export function hello() { return 'world'; }`;
        const {collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(0);
    });
});

describe('pureFnTransformer - mixed file', () => {
    it('should handle both pureServerFn and registerPureFnFactory in the same file', () => {
        const source = `
import {pureServerFn, registerPureFnFactory} from '@mionkit/core';

export const fn = pureServerFn({
    pureFn: function addOne(x) { return x + 1; }
});

export const cpf = registerPureFnFactory('mion', 'double', function () {
    return function d(x) { return x * 2; };
});
`;
        const {output, collected} = transformWithPureFn(source);
        expect(collected).toHaveLength(2);
        // pureServerFn should have bodyHash injected as string
        expect(output).toContain(`"${collected[0].bodyHash}"`);
        // registerPureFnFactory should have object injected
        expect(output).toContain('bodyHash');
        expect(output).toContain('paramNames');
        expect(output).toContain('code');
    });
});
