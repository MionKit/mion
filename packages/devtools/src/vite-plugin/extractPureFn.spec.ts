import {describe, it, expect, beforeAll, beforeEach} from 'vitest';
import {extractPureFnsFromSource, PurityError, stripTypes} from './extractPureFn.ts';
import {resetHashes, pureFnHashLength, pureServerFn, pureServerFnGroup} from '@mionkit/core';
import {PURE_SERVER_FN_NAMESPACE} from './pureFnUtils.ts';

beforeAll(() => {
    resetHashes();
});

beforeEach(() => {
    resetHashes();
});

describe('stripTypes', () => {
    // Note: These tests verify that type annotations are stripped.

    it('should strip type annotations from simple code', () => {
        const input = 'const x: number = 5;';
        const output = stripTypes(input);
        expect(output).toContain('const x = 5;');
    });

    it('should strip type annotations from arrow functions', () => {
        const input = 'const fn = (x: number): number => x + 1;';
        const output = stripTypes(input);
        // Types should be stripped from the arrow function
        expect(output).toContain('(x) => x + 1');
    });

    it('should strip interface declarations', () => {
        const input = `
interface User {
    id: number;
    name: string;
}
const x = 5;
`;
        const output = stripTypes(input);
        expect(output).toContain('const x = 5;');
    });

    it('should strip type aliases', () => {
        const input = `
type UserId = number;
const x = 5;
`;
        const output = stripTypes(input);
        expect(output).toContain('const x = 5;');
    });

    it('should handle generic type parameters', () => {
        const input = 'const arr: Array<number> = [1, 2, 3];';
        const output = stripTypes(input);
        expect(output).toContain('const arr = [1, 2, 3];');
    });

    it('should strip types from function parameters', () => {
        const input = 'function add(a: number, b: number): number { return a + b; }';
        const output = stripTypes(input);
        expect(output).toContain('function add(a, b) { return a + b; }');
    });

    it('should strip type assertions', () => {
        const input = 'const x = value as string;';
        const output = stripTypes(input);
        expect(output).toContain('const x = value;');
    });

    it('should strip types from arrow function callbacks', () => {
        const input = 'items.map((x: number) => x + 1);';
        const output = stripTypes(input);
        // Types should be stripped from the callback
        expect(output).toContain('(x) => x + 1');
    });

    it('should handle complex object type annotations', () => {
        const input = 'const fn = (u: {id: number, name: string}) => u.id;';
        const output = stripTypes(input);
        // Types should be stripped from the parameter
        expect(output).toContain('(u) => u.id');
    });
});

describe('extractPureFnsFromSource - pureServerFn with PureFnDef', () => {
    it('should extract a named function expression with TypeScript types', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

interface User {
    id: number;
    name: string;
}

export const mapUsers = pureServerFn({
    pureFn: function mapUsers(users: User[]): {userId: number}[] {
        return users.map((u: User) => ({userId: u.id}));
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe('mapUsers');
        expect(result[0].namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        expect(result[0].paramNames).toEqual(['users']);
        expect(result[0].code).toContain('return users.map');
        // Types should be stripped from the code
        expect(result[0].code).not.toContain(': User');
        expect(result[0].bodyHash).toBeDefined();
        expect(result[0].bodyHash.length).toBe(pureFnHashLength);
        expect(result[0].isFactory).toBe(false);
    });

    it('should extract multiple pure functions from one file with types', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const fn1 = pureServerFn({
    pureFn: function addOne(x: number): number {
        return x + 1;
    }
});

export const fn2 = pureServerFn({
    pureFn: function double(x: number): number {
        return x * 2;
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(2);
        expect(result[0].fnName).toBe('addOne');
        expect(result[1].fnName).toBe('double');
        // Types should be stripped
        expect(result[0].code).not.toContain(': number');
        expect(result[1].code).not.toContain(': number');
    });

    it('should extract function with multiple typed parameters', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const combine = pureServerFn({
    pureFn: function combine(a: string, b: string, c: string): string {
        return [a, b, c].join('-');
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].paramNames).toEqual(['a', 'b', 'c']);
    });

    it('should extract function with no parameters', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const getDefault = pureServerFn({
    pureFn: function getDefault(): number {
        return 42;
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].paramNames).toEqual([]);
    });

    it('should return empty array for files without pureServerFn', () => {
        const source = `
const x: number = 1;
export function hello(): string { return 'world'; }
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(0);
    });

    it('should generate deterministic hashes for the same function', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const fn = pureServerFn({
    pureFn: function myFn(x: number): number {
        return x + 1;
    }
});
`;
        const result1 = extractPureFnsFromSource(source, 'test.ts');
        resetHashes();
        const result2 = extractPureFnsFromSource(source, 'test.ts');
        expect(result1[0].bodyHash).toBe(result2[0].bodyHash);
    });

    it('should generate different hashes for different function bodies', () => {
        const source1 = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({ pureFn: function myFn(x: number): number { return x + 1; } });
`;
        const source2 = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({ pureFn: function myFn(x: number): number { return x + 2; } });
`;
        const result1 = extractPureFnsFromSource(source1, 'test.ts');
        const result2 = extractPureFnsFromSource(source2, 'test.ts');
        expect(result1[0].bodyHash).not.toBe(result2[0].bodyHash);
    });

    it('should assign pureServerFn namespace by default', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({ pureFn: function myFn(x: any): any { return x; } });
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result[0].namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        expect(result[0].sourceFile).toBe('test.ts');
    });

    it('should handle functions with complex type annotations', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

interface User {
    id: number;
    name: string;
    preferences: { theme: string };
}

type UserPrefs = { userId: number; prefs: { theme: string } };

export const fn = pureServerFn({
    pureFn: function mapUserPrefs(users: User[]): UserPrefs[] {
        return users.map((u: User) => ({ userId: u.id, prefs: u.preferences }));
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].paramNames).toEqual(['users']);
        // Types should be stripped from the code
        expect(result[0].code).not.toContain(': User');
        expect(result[0].code).not.toContain('UserPrefs');
    });

    it('should handle generic type parameters', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const fn = pureServerFn({
    pureFn: function identity<T>(x: T): T {
        return x;
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].paramNames).toEqual(['x']);
    });

    it('should handle type assertions in function body', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const fn = pureServerFn({
    pureFn: function castValue(x: unknown): string {
        const str = x as string;
        return str.toUpperCase();
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        // Type assertion should be stripped
        expect(result[0].code).not.toContain('as string');
    });

    it('should accept anonymous functions and use bodyHash as fnName', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function(x: number): number {
        return x + 1;
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        // Anonymous function expressions get bodyHash as name
        expect(result[0].fnName).toBe(result[0].bodyHash);
        expect(result[0].bodyHash).toBeDefined();
    });

    it('should extract pureServerFn with explicit namespace property', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(x: number): number {
        return x + 1;
    },
    namespace: 'customNamespace'
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].namespace).toBe('customNamespace');
        expect(result[0].fnName).toBe('myFn');
    });

    it('should extract pureServerFn with explicit fnName property', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function(x: number): number {
        return x + 1;
    },
    fnName: 'customName'
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe('customName');
    });

    it('should extract pureServerFn with isFactory property', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFactory(jitUtils: any) {
        return function inner(x: number) {
            return x + 1;
        };
    },
    isFactory: true
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].isFactory).toBe(true);
    });

    it('should throw when argument is not an object literal', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
const def = { pureFn: function myFn(x: number) { return x; } };
export const fn = pureServerFn(def);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/object literal/);
    });

    it('should throw when pureFn property is missing', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({ namespace: 'test' });
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/pureFn/);
    });
});

describe('extractPureFnsFromSource - pureServerFnGroup with PureFnDef', () => {
    it('should extract functions from a group and set cross-dependencies', () => {
        const source = `
import {pureServerFnGroup} from '@mionkit/server-pure-functions';

const [refA, refB, refC] = pureServerFnGroup([
    { pureFn: function addOne(x: number): number { return x + 1; } },
    { pureFn: function double(x: number): number { return x * 2; } },
    { pureFn: function triple(x: number): number { return x * 3; } }
]);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(3);

        // Each function should have the other two as dependencies
        const fn1Result = result.find((f) => f.fnName === 'addOne')!;
        const fn2Result = result.find((f) => f.fnName === 'double')!;
        const fn3Result = result.find((f) => f.fnName === 'triple')!;

        expect(fn1Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::double`)).toBe(true);
        expect(fn1Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::triple`)).toBe(true);
        expect(fn1Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::addOne`)).toBe(false);

        expect(fn2Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::addOne`)).toBe(true);
        expect(fn2Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::triple`)).toBe(true);
        expect(fn2Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::double`)).toBe(false);

        expect(fn3Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::addOne`)).toBe(true);
        expect(fn3Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::double`)).toBe(true);
        expect(fn3Result.dependencies.has(`${PURE_SERVER_FN_NAMESPACE}::triple`)).toBe(false);
    });

    it('should handle groups with custom namespaces', () => {
        const source = `
import {pureServerFnGroup} from '@mionkit/server-pure-functions';

const [refA, refB] = pureServerFnGroup([
    { pureFn: function addOne(x: number): number { return x + 1; }, namespace: 'customNs' },
    { pureFn: function double(x: number): number { return x * 2; }, namespace: 'customNs' }
]);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(2);

        const fn1Result = result.find((f) => f.fnName === 'addOne')!;
        const fn2Result = result.find((f) => f.fnName === 'double')!;

        expect(fn1Result.namespace).toBe('customNs');
        expect(fn2Result.namespace).toBe('customNs');

        expect(fn1Result.dependencies.has('customNs::double')).toBe(true);
        expect(fn2Result.dependencies.has('customNs::addOne')).toBe(true);
    });

    it('should handle groups with mixed namespaces', () => {
        const source = `
import {pureServerFnGroup} from '@mionkit/server-pure-functions';

const [refA, refB] = pureServerFnGroup([
    { pureFn: function addOne(x: number): number { return x + 1; }, namespace: 'ns1' },
    { pureFn: function double(x: number): number { return x * 2; }, namespace: 'ns2' }
]);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(2);

        const fn1Result = result.find((f) => f.fnName === 'addOne')!;
        const fn2Result = result.find((f) => f.fnName === 'double')!;

        expect(fn1Result.dependencies.has('ns2::double')).toBe(true);
        expect(fn2Result.dependencies.has('ns1::addOne')).toBe(true);
    });

    it('should throw when pureServerFnGroup argument is not an array literal', () => {
        const source = `
import {pureServerFnGroup} from '@mionkit/server-pure-functions';

const defs = [{ pureFn: function addOne(x: number) { return x + 1; } }];
pureServerFnGroup(defs);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/array literal/);
    });

    it('should throw when array elements are not object literals', () => {
        const source = `
import {pureServerFnGroup} from '@mionkit/server-pure-functions';

const def1 = { pureFn: function addOne(x: number) { return x + 1; } };
pureServerFnGroup([def1]);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/object literal/);
    });
});

describe('purity validation', () => {
    it('should reject functions using eval', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(x: string): any {
        return eval(x);
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/eval/);
    });

    it('should reject functions using require', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(): any {
        const fs = require('fs');
        return fs.readFileSync('/etc/passwd');
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using dynamic import', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(): Promise<any> {
        return import('./secret');
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using this', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(): any {
        return this.value;
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using fetch', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(url: string): Promise<Response> {
        return fetch(url);
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using setTimeout', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(): void {
        setTimeout(() => {}, 1000);
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions accessing closure variables', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
const SECRET: string = 'hidden';
export const fn = pureServerFn({
    pureFn: function myFn(x: string): string {
        return x + SECRET;
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/SECRET/);
    });

    it('should reject functions using process', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(): string | undefined {
        return process.env.SECRET;
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using window', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(): string {
        return window.location.href;
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using await', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(): number {
        const result = await Promise.resolve(1);
        return result;
    }
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should allow functions using Math', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(x: number): number {
        return Math.floor(x);
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
    });

    it('should allow functions using JSON', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(x: object): string {
        return JSON.stringify(x);
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
    });

    it('should allow functions using Array methods with typed callbacks', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(items: number[]): number[] {
        return items.filter((x: number) => x > 0).map((x: number) => x * 2);
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        // Types in callbacks should be stripped
        expect(result[0].code).not.toContain(': number');
    });

    it('should allow functions with typed local variable declarations', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function myFn(x: number): number {
        const doubled: number = x * 2;
        const tripled: number = x * 3;
        return doubled + tripled;
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        // Types should be stripped
        expect(result[0].code).not.toContain(': number');
    });

    it('should allow functions with typed destructuring', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

interface User {
    name: string;
    age: number;
}

export const fn = pureServerFn({
    pureFn: function myFn(user: User): string {
        const {name, age}: {name: string; age: number} = user;
        return name + ' is ' + age;
    }
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
    });

    it('should allow factory functions to access jitUtils methods', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const myFactory = pureServerFn({
    pureFn: function myFactory(jitUtils: any) {
        const serialize = jitUtils.getSerializer('myType');
        const validate = jitUtils.getValidator('myType');
        return function inner(x: any) {
            return serialize(validate(x));
        };
    },
    isFactory: true
});
`;
        // Should not throw - factory functions have relaxed purity rules
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].isFactory).toBe(true);
    });
});

describe('bodyHash consistency between runtime and AST extraction', () => {
    // These tests verify that the bodyHash produced by runtime pureServerFn()
    // matches the bodyHash produced by AST extraction in extractPureFnsFromSource()

    it('should produce same bodyHash for pureServerFn at runtime and AST extraction', () => {
        // Define the function
        const fn = function addOne(x: number) {
            return x + 1;
        };

        // Get runtime result
        resetHashes();
        const runtimeRef = pureServerFn({pureFn: fn});

        // Get AST extraction result
        const source = `
import {pureServerFn} from '@mionkit/core';
export const ref = pureServerFn({
    pureFn: function addOne(x) {
        return x + 1;
    }
});
`;
        resetHashes();
        const astResult = extractPureFnsFromSource(source, 'test.ts');

        // Both should produce the same bodyHash
        expect(astResult).toHaveLength(1);
        expect(astResult[0].bodyHash).toBe(runtimeRef.bodyHash);
        expect(astResult[0].fnName).toBe(runtimeRef.fnName);
        expect(astResult[0].namespace).toBe(runtimeRef.namespace);
    });

    it('should produce same bodyHash for arrow functions', () => {
        // Get runtime result
        resetHashes();
        const runtimeRef = pureServerFn({
            pureFn: (x: number) => x * 2,
            fnName: 'double',
        });

        // Get AST extraction result
        const source = `
import {pureServerFn} from '@mionkit/core';
export const ref = pureServerFn({
    pureFn: (x) => x * 2,
    fnName: 'double'
});
`;
        resetHashes();
        const astResult = extractPureFnsFromSource(source, 'test.ts');

        expect(astResult).toHaveLength(1);
        expect(astResult[0].bodyHash).toBe(runtimeRef.bodyHash);
    });

    it('should produce same bodyHash for pureServerFnGroup at runtime and AST extraction', () => {
        // Get runtime result
        resetHashes();
        const runtimeRefs = pureServerFnGroup([
            {
                pureFn: function fnA(x: number) {
                    return x + 1;
                },
            },
            {
                pureFn: function fnB(x: number) {
                    return x * 2;
                },
            },
        ]);

        // Get AST extraction result
        const source = `
import {pureServerFnGroup} from '@mionkit/core';
export const [refA, refB] = pureServerFnGroup([
    { pureFn: function fnA(x) { return x + 1; } },
    { pureFn: function fnB(x) { return x * 2; } }
]);
`;
        resetHashes();
        const astResult = extractPureFnsFromSource(source, 'test.ts');

        expect(astResult).toHaveLength(2);

        const astFnA = astResult.find((f) => f.fnName === 'fnA')!;
        const astFnB = astResult.find((f) => f.fnName === 'fnB')!;
        const runtimeFnA = runtimeRefs.find((f) => f.fnName === 'fnA')!;
        const runtimeFnB = runtimeRefs.find((f) => f.fnName === 'fnB')!;

        expect(astFnA.bodyHash).toBe(runtimeFnA.bodyHash);
        expect(astFnB.bodyHash).toBe(runtimeFnB.bodyHash);

        // Dependencies should also match
        expect(astFnA.dependencies.has('pureServerFn::fnB')).toBe(true);
        expect(astFnB.dependencies.has('pureServerFn::fnA')).toBe(true);
    });

    it('should produce same bodyHash with custom namespace', () => {
        // Get runtime result
        resetHashes();
        const runtimeRef = pureServerFn({
            pureFn: function myFn(x: number) {
                return x;
            },
            namespace: 'customNs',
        });

        // Get AST extraction result
        const source = `
import {pureServerFn} from '@mionkit/core';
export const ref = pureServerFn({
    pureFn: function myFn(x) { return x; },
    namespace: 'customNs'
});
`;
        resetHashes();
        const astResult = extractPureFnsFromSource(source, 'test.ts');

        expect(astResult).toHaveLength(1);
        expect(astResult[0].bodyHash).toBe(runtimeRef.bodyHash);
        expect(astResult[0].namespace).toBe('customNs');
    });

    it('should produce same bodyHash for multi-line function bodies', () => {
        // Get runtime result - note: no type annotations to match AST extraction
        // (AST extraction strips types, so runtime must also not have them for hash to match)
        resetHashes();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const runtimeRef = pureServerFn({
            pureFn: function processData(data) {
                const filtered = data.filter((x) => x > 0);
                const mapped = filtered.map((x) => x * 2);
                return mapped;
            },
        });

        // Get AST extraction result - same logic
        const source = `
import {pureServerFn} from '@mionkit/core';
export const ref = pureServerFn({
    pureFn: function processData(data) {
        const filtered = data.filter((x) => x > 0);
        const mapped = filtered.map((x) => x * 2);
        return mapped;
    }
});
`;
        resetHashes();
        const astResult = extractPureFnsFromSource(source, 'test.ts');

        expect(astResult).toHaveLength(1);
        expect(astResult[0].bodyHash).toBe(runtimeRef.bodyHash);
    });
});

// Note: validatePurity is now internal and tested through extractPureFnsFromSource
// The purity validation tests above cover all the validation cases
