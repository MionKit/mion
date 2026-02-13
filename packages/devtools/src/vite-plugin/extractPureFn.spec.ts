import {describe, it, expect, beforeAll} from 'vitest';
import {extractPureFnsFromSource, PurityError, stripTypes} from './extractPureFn.ts';
import {resetHashes, pureFnHashLength} from '@mionkit/core';

beforeAll(() => {
    resetHashes();
});

describe('stripTypes', () => {
    it('should strip type annotations from simple code', () => {
        const input = 'const x: number = 5;';
        const output = stripTypes(input);
        expect(output).toBe('const x = 5;');
    });

    it('should strip type annotations from arrow functions', () => {
        const input = 'const fn = (x: number): number => x + 1;';
        const output = stripTypes(input);
        expect(output).toBe('const fn = (x) => x + 1;');
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
        expect(output).toBe('const x = 5;');
    });

    it('should strip type aliases', () => {
        const input = `
type UserId = number;
const x = 5;
`;
        const output = stripTypes(input);
        expect(output).toBe('const x = 5;');
    });

    it('should handle generic type parameters', () => {
        const input = 'const arr: Array<number> = [1, 2, 3];';
        const output = stripTypes(input);
        expect(output).toBe('const arr = [1, 2, 3];');
    });

    it('should strip types from function parameters', () => {
        const input = 'function add(a: number, b: number): number { return a + b; }';
        const output = stripTypes(input);
        expect(output).toBe('function add(a, b) { return a + b; }');
    });

    it('should strip type assertions', () => {
        const input = 'const x = value as string;';
        const output = stripTypes(input);
        expect(output).toBe('const x = value;');
    });

    it('should strip types from arrow function callbacks', () => {
        const input = 'items.map((x: number) => x + 1);';
        const output = stripTypes(input);
        expect(output).toBe('items.map((x) => x + 1);');
    });

    it('should handle complex object type annotations', () => {
        const input = 'const fn = (u: {id: number, name: string}) => u.id;';
        const output = stripTypes(input);
        expect(output).toBe('const fn = (u) => u.id;');
    });
});

describe('extractPureFnsFromSource', () => {
    it('should extract a named function expression with TypeScript types', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

interface User {
    id: number;
    name: string;
}

export const mapUsers = pureServerFn(function mapUsers(users: User[]): {userId: number}[] {
    return users.map((u: User) => ({userId: u.id}));
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe('mapUsers');
        expect(result[0].paramNames).toEqual(['users']);
        expect(result[0].code).toContain('return users.map');
        // Types should be stripped from the code
        expect(result[0].code).not.toContain(': User');
        expect(result[0].bodyHash).toBeDefined();
        expect(result[0].bodyHash.length).toBe(pureFnHashLength);
    });

    it('should extract multiple pure functions from one file with types', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const fn1 = pureServerFn(function addOne(x: number): number {
    return x + 1;
});

export const fn2 = pureServerFn(function double(x: number): number {
    return x * 2;
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

export const combine = pureServerFn(function combine(a: string, b: string, c: string): string {
    return [a, b, c].join('-');
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].paramNames).toEqual(['a', 'b', 'c']);
    });

    it('should extract function with no parameters', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const getDefault = pureServerFn(function getDefault(): number {
    return 42;
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

export const fn = pureServerFn(function myFn(x: number): number {
    return x + 1;
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
export const fn = pureServerFn(function myFn(x: number): number { return x + 1; });
`;
        const source2 = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(x: number): number { return x + 2; });
`;
        const result1 = extractPureFnsFromSource(source1, 'test.ts');
        const result2 = extractPureFnsFromSource(source2, 'test.ts');
        expect(result1[0].bodyHash).not.toBe(result2[0].bodyHash);
    });

    it('should assign pureServerFn namespace', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(x: any): any { return x; });
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
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

export const fn = pureServerFn(function mapUserPrefs(users: User[]): UserPrefs[] {
    return users.map((u: User) => ({ userId: u.id, prefs: u.preferences }));
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

export const fn = pureServerFn(function identity<T>(x: T): T {
    return x;
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].paramNames).toEqual(['x']);
    });

    it('should handle type assertions in function body', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';

export const fn = pureServerFn(function castValue(x: unknown): string {
    const str = x as string;
    return str.toUpperCase();
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        // Type assertion should be stripped
        expect(result[0].code).not.toContain('as string');
    });
});

describe('purity validation', () => {
    it('should reject functions using eval', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(x: string): any {
    return eval(x);
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/eval/);
    });

    it('should reject functions using require', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(): any {
    const fs = require('fs');
    return fs.readFileSync('/etc/passwd');
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using dynamic import', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(): Promise<any> {
    return import('./secret');
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using this', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(): any {
    return this.value;
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using fetch', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(url: string): Promise<Response> {
    return fetch(url);
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using setTimeout', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(): void {
    setTimeout(() => {}, 1000);
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions accessing closure variables', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
const SECRET: string = 'hidden';
export const fn = pureServerFn(function myFn(x: string): string {
    return x + SECRET;
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/SECRET/);
    });

    it('should reject functions using process', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(): string | undefined {
    return process.env.SECRET;
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using window', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(): string {
    return window.location.href;
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should reject functions using await', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(): number {
    const result = await Promise.resolve(1);
    return result;
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });

    it('should allow functions using Math', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(x: number): number {
    return Math.floor(x);
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
    });

    it('should allow functions using JSON', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(x: object): string {
    return JSON.stringify(x);
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
    });

    it('should allow functions using Array methods with typed callbacks', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function myFn(items: number[]): number[] {
    return items.filter((x: number) => x > 0).map((x: number) => x * 2);
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
export const fn = pureServerFn(function myFn(x: number): number {
    const doubled: number = x * 2;
    const tripled: number = x * 3;
    return doubled + tripled;
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

export const fn = pureServerFn(function myFn(user: User): string {
    const {name, age}: {name: string; age: number} = user;
    return name + ' is ' + age;
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
    });

    it('should accept anonymous functions (fnName is optional)', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(function(x: number): number {
    return x + 1;
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        // Anonymous function expressions don't get a name (only arrow functions get name from variable)
        expect(result[0].fnName).toBeUndefined();
        expect(result[0].bodyHash).toBeDefined();
    });
});

// Note: validatePurity is now internal and tested through extractPureFnsFromSource
// The purity validation tests above cover all the validation cases
