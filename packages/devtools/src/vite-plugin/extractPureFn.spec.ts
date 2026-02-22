import {describe, it, expect} from 'vitest';
import {extractPureFnsFromSource, PurityError, stripTypes} from './extractPureFn.ts';
import {BODY_HASH_LENGTH, PURE_SERVER_FN_NAMESPACE} from './constants.ts';

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
        expect(output).toContain('function add(a, b)');
        expect(output).toContain('return a + b;');
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

export const mapUsersFn = pureServerFn({
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
        expect(result[0].fnBody).toContain('return users.map');
        // Types should be stripped from the code
        expect(result[0].fnBody).not.toContain(': User');
        expect(result[0].bodyHash).toBeDefined();
        expect(result[0].bodyHash.length).toBe(BODY_HASH_LENGTH);
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
        expect(result[0].fnBody).not.toContain(': number');
        expect(result[1].fnBody).not.toContain(': number');
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
        expect(result[0].fnBody).not.toContain(': User');
        expect(result[0].fnBody).not.toContain('UserPrefs');
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
        expect(result[0].fnBody).not.toContain('as string');
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

    it('should resolve a variable reference to its object literal initializer', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
const def = { pureFn: function myFn(x: number) { return x; } };
export const fn = pureServerFn(def);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe('myFn');
        expect(result[0].paramNames).toEqual(['x']);
    });

    it('should resolve a variable reference with all PureFnDef properties', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
const myDef = {
    pureFn: function addOne(x: number): number { return x + 1; },
    namespace: 'myNs',
    fnName: 'myAdd'
};
export const fn = pureServerFn(myDef);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe('myAdd');
        expect(result[0].namespace).toBe('myNs');
        expect(result[0].paramNames).toEqual(['x']);
    });

    it('should throw when variable reference cannot be resolved', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
export const fn = pureServerFn(unknownDef);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/could not be resolved/);
    });

    it('should throw when variable resolves to a non-object-literal', () => {
        const source = `
import {pureServerFn} from '@mionkit/server-pure-functions';
const def = getSomeDef();
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
        expect(result[0].fnBody).not.toContain(': number');
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
        expect(result[0].fnBody).not.toContain(': number');
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

describe('extractPureFnsFromSource - registerPureFnFactory', () => {
    it('should extract namespace, functionID, paramNames, code, bodyHash from simple factory', () => {
        const fnBody = `return function is_h(hours) {
    if (!hours.length || hours.length > 2)
      return false;
    const h = Number(hours);
    return h >= 0 && h <= 23;
  };`;
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mion', 'isHours', function () {
    ${fnBody}
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory');
        expect(result).toHaveLength(1);
        expect(result[0].namespace).toBe('mion');
        expect(result[0].fnName).toBe('isHours');
        expect(result[0].paramNames).toEqual([]);
        expect(result[0].fnBody).toBe(fnBody);
        expect(result[0].bodyHash).toBeDefined();
        expect(result[0].bodyHash.length).toBe(BODY_HASH_LENGTH);
        expect(result[0].isFactory).toBe(true);
    });

    it('should extract from factory with jitUtils parameter', () => {
        const fnBody = `const isDate = jUtil.getPureFn("mionFormats", "isDateString");
  return function is_date(value) {
    const parts = value.split("-");
    return isDate(parts[0], parts[1], parts[2]);
  };`;
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mionFormats', 'isDateString_YMD', function (jUtil) {
    ${fnBody}
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory');
        expect(result).toHaveLength(1);
        expect(result[0].namespace).toBe('mionFormats');
        expect(result[0].fnName).toBe('isDateString_YMD');
        expect(result[0].paramNames).toEqual(['jUtil']);
        expect(result[0].fnBody).toBe(fnBody);
    });

    it('should extract from arrow function factory', () => {
        const fnBody = `return function inner(x) {
    return x + 1;
  };`;
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('test', 'arrowFn', (jUtils) => {
    ${fnBody}
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory');
        expect(result).toHaveLength(1);
        expect(result[0].namespace).toBe('test');
        expect(result[0].fnName).toBe('arrowFn');
        expect(result[0].paramNames).toEqual(['jUtils']);
        expect(result[0].fnBody).toBe(fnBody);
    });

    it('should extract multiple registerPureFnFactory calls from one file', () => {
        const fnBody1 = `return function a(x) {
    return x + 1;
  };`;
        const fnBody2 = `return function b(x) {
    return x * 2;
  };`;
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf1 = registerPureFnFactory('mion', 'fn1', function () {
    ${fnBody1}
});
export const cpf2 = registerPureFnFactory('mion', 'fn2', function () {
    ${fnBody2}
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory');
        expect(result).toHaveLength(2);
        expect(result[0].fnName).toBe('fn1');
        expect(result[0].fnBody).toBe(fnBody1);
        expect(result[1].fnName).toBe('fn2');
        expect(result[1].fnBody).toBe(fnBody2);
    });

    it('should generate deterministic hashes', () => {
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mion', 'testFn', function () {
    return function t(x) { return x; };
});
`;
        const result1 = extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory');
        const result2 = extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory');
        expect(result1[0].bodyHash).toBe(result2[0].bodyHash);
    });

    it('should generate different hashes for different function bodies', () => {
        const source1 = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mion', 'fn', function () { return function t(x) { return x + 1; }; });
`;
        const source2 = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mion', 'fn', function () { return function t(x) { return x + 2; }; });
`;
        const r1 = extractPureFnsFromSource(source1, 'test.ts', 'registerPureFnFactory');
        const r2 = extractPureFnsFromSource(source2, 'test.ts', 'registerPureFnFactory');
        expect(r1[0].bodyHash).not.toBe(r2[0].bodyHash);
    });

    it('should include functionID in hash input (different IDs produce different hashes)', () => {
        const source1 = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mion', 'fn1', function () { return function t(x) { return x; }; });
`;
        const source2 = `
import {registerPureFnFactory} from '@mionkit/core';
export const cpf = registerPureFnFactory('mion', 'fn2', function () { return function t(x) { return x; }; });
`;
        const r1 = extractPureFnsFromSource(source1, 'test.ts', 'registerPureFnFactory');
        const r2 = extractPureFnsFromSource(source2, 'test.ts', 'registerPureFnFactory');
        expect(r1[0].bodyHash).not.toBe(r2[0].bodyHash);
    });

    it('should strip TypeScript types from factory function', () => {
        const fnBody = `return function check(s, p) {
    return p.isLower ? s === s.toLowerCase() : true;
  };`;
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
interface Params { isLower?: boolean; }
export const cpf = registerPureFnFactory('mion', 'typedFn', function (jUtil: any) {
    return function check(s: string, p: Params): boolean {
        return p.isLower ? s === s.toLowerCase() : true;
    };
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory');
        expect(result).toHaveLength(1);
        expect(result[0].fnBody).toBe(fnBody);
    });

    it('should return empty array for files without registerPureFnFactory', () => {
        const source = `const x = 1; export function hello() { return 'world'; }`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory');
        expect(result).toHaveLength(0);
    });

    it('should throw when namespace is not a string literal', () => {
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
const ns = 'mion';
export const cpf = registerPureFnFactory(ns, 'fn', function () { return function t() {}; });
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(/string literal/);
    });

    it('should throw when factoryFn is not a function expression', () => {
        const source = `
import {registerPureFnFactory} from '@mionkit/core';
const myFn = () => {};
export const cpf = registerPureFnFactory('mion', 'fn', myFn);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(
            /function expression or arrow function/
        );
    });
});
