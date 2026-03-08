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

    it('should strip types from TSX files with JSX syntax', () => {
        const input = `
const App = ({name}: {name: string}) => <div>{name}</div>;
const x: number = 5;
`;
        const output = stripTypes(input, 'component.tsx');
        expect(output).toContain('const x = 5;');
        // JSX is transformed to function calls by esbuild
        expect(output).not.toContain('<div>');
    });
});

describe('extractPureFnsFromSource - TSX files', () => {
    it('should extract pureServerFn from a .tsx file with JSX', () => {
        const source = `
import {pureServerFn} from '@mionjs/client';

const MyComponent = () => <div>Hello</div>;

const double = pureServerFn((x) => x * 2);
`;
        const results = extractPureFnsFromSource(source, 'MyComponent.tsx', 'pureServerFn');
        expect(results).toHaveLength(1);
        expect(results[0].fnBody).toContain('x * 2');
    });

    it('should extract mapFrom from a .tsx file with JSX', () => {
        const source = `
import {mapFrom} from '@mionjs/client';

const Header = () => <h1>Title</h1>;

const mapped = mapFrom(someSource, (data) => data.value);
`;
        const results = extractPureFnsFromSource(source, 'Page.tsx', 'mapFrom');
        expect(results).toHaveLength(1);
        expect(results[0].fnBody).toContain('data.value');
    });

    it('should extract registerPureFnFactory from a .tsx file with JSX', () => {
        const source = `
import {registerPureFnFactory} from '@mionjs/client';

const Layout = () => <main>Content</main>;

registerPureFnFactory('myNs', 'multiply', (factor) => (x) => x * factor);
`;
        const results = extractPureFnsFromSource(source, 'Layout.tsx', 'registerPureFnFactory');
        expect(results).toHaveLength(1);
        expect(results[0].namespace).toBe('myNs');
        expect(results[0].fnName).toBe('multiply');
        expect(results[0].isFactory).toBe(true);
    });
});

describe('extractPureFnsFromSource - pureServerFn with PureFnDef', () => {
    it('should extract a named function expression with TypeScript types', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';

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
import {pureServerFn} from '@mionjs/server-pure-functions';

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
import {pureServerFn} from '@mionjs/server-pure-functions';

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
import {pureServerFn} from '@mionjs/server-pure-functions';

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
import {pureServerFn} from '@mionjs/server-pure-functions';

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
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn({ pureFn: function myFn(x: number): number { return x + 1; } });
`;
        const source2 = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn({ pureFn: function myFn(x: number): number { return x + 2; } });
`;
        const result1 = extractPureFnsFromSource(source1, 'test.ts');
        const result2 = extractPureFnsFromSource(source2, 'test.ts');
        expect(result1[0].bodyHash).not.toBe(result2[0].bodyHash);
    });

    it('should assign pureServerFn namespace by default', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn({ pureFn: function myFn(x: any): any { return x; } });
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result[0].namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        expect(result[0].sourceFile).toBe('test.ts');
    });

    it('should handle functions with complex type annotations', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';

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
import {pureServerFn} from '@mionjs/server-pure-functions';

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
import {pureServerFn} from '@mionjs/server-pure-functions';

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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn(unknownDef);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/could not be resolved/);
    });

    it('should throw with import-specific message when argument is a named import', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
import {myFn} from './myModule';
export const fn = pureServerFn(myFn);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/imported from another module/);
    });

    it('should throw with import-specific message when argument is a default import', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
import myFn from './myModule';
export const fn = pureServerFn(myFn);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/imported from another module/);
    });

    it('should throw with import-specific message when pureFn property is an import', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
import {myFn} from './myModule';
export const fn = pureServerFn({ pureFn: myFn });
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/imported from another module/);
    });

    it('should throw when variable resolves to a non-object-literal', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
const def = getSomeDef();
export const fn = pureServerFn(def);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/object literal/);
    });

    it('should throw when pureFn property is missing', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn({ namespace: 'test' });
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/pureFn/);
    });
});

describe('extractPureFnsFromSource - pureServerFn with plain function', () => {
    it('should extract a named function expression and always use bodyHash as fnName', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn(function addOne(x: number): number {
    return x + 1;
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        // Plain function overload always uses bodyHash as fnName (not function.name)
        expect(result[0].fnName).toBe(result[0].bodyHash);
        expect(result[0].namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        expect(result[0].paramNames).toEqual(['x']);
        expect(result[0].fnBody).toContain('return x + 1');
        expect(result[0].fnBody).not.toContain(': number');
        expect(result[0].bodyHash).toBeDefined();
        expect(result[0].bodyHash.length).toBe(BODY_HASH_LENGTH);
        expect(result[0].isFactory).toBe(false);
    });

    it('should extract an arrow function with expression body', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn((x: number) => x + 1);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe(result[0].bodyHash);
        expect(result[0].paramNames).toEqual(['x']);
        expect(result[0].fnBody).toContain('return x + 1');
        expect(result[0].isFactory).toBe(false);
    });

    it('should extract an arrow function with block body', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn((users: any[]) => {
    return users.map((u: any) => ({id: u.id}));
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].paramNames).toEqual(['users']);
        expect(result[0].fnBody).toContain('users.map');
    });

    it('should extract multiple plain function calls from one file', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn1 = pureServerFn(function addOne(x: number) { return x + 1; });
export const fn2 = pureServerFn((x: number) => x * 2);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(2);
        // Both should use bodyHash as fnName
        expect(result[0].fnName).toBe(result[0].bodyHash);
        expect(result[1].fnName).toBe(result[1].bodyHash);
    });

    it('should produce same hash as equivalent PureFnDef form', () => {
        const plainSource = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn(function addOne(x) { return x + 1; });
`;
        const defSource = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn({ pureFn: function addOne(x) { return x + 1; } });
`;
        const plainResult = extractPureFnsFromSource(plainSource, 'test.ts');
        const defResult = extractPureFnsFromSource(defSource, 'test.ts');
        expect(plainResult[0].bodyHash).toBe(defResult[0].bodyHash);
        expect(plainResult[0].fnBody).toBe(defResult[0].fnBody);
    });

    it('should handle mixed plain function and PureFnDef calls in one file', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn1 = pureServerFn((x: number) => x + 1);
export const fn2 = pureServerFn({
    pureFn: function double(x: number) { return x * 2; },
    fnName: 'double'
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(2);
        expect(result[0].fnName).toBe(result[0].bodyHash);
        expect(result[1].fnName).toBe('double');
    });

    it('should resolve a variable reference that holds a function', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
const myFn = function addOne(x) { return x + 1; };
export const fn = pureServerFn(myFn);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        // Variable-resolved function still uses bodyHash as fnName
        expect(result[0].fnName).toBe(result[0].bodyHash);
    });

    it('should validate purity for plain functions (reject closure variables)', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
const SECRET = 'hidden';
export const fn = pureServerFn((x: string) => x + SECRET);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/SECRET/);
    });

    it('should validate purity for plain functions (reject this)', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn(function myFn() { return this.value; });
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
    });
});

describe('purity validation', () => {
    it('should reject functions using eval', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';
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
import {pureServerFn} from '@mionjs/server-pure-functions';

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

    it('should allow factory functions with local variables and params only', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';

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
        // Should not throw - jitUtils is a param, serialize/validate are local variables
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].isFactory).toBe(true);
    });

    it('should reject factory functions accessing closure variables', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
const OUTER = 42;
export const fn = pureServerFn({
    pureFn: function factory() { return OUTER; },
    isFactory: true
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/OUTER/);
    });

    it('should reject factory functions using forbidden identifiers', () => {
        const source = `
import {pureServerFn} from '@mionjs/server-pure-functions';
export const fn = pureServerFn({
    pureFn: function factory() { return setTimeout; },
    isFactory: true
});
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/setTimeout/);
    });
});

describe('extractPureFnsFromSource - mapFrom', () => {
    it('should extract an arrow mapper from mapFrom(source, mapper)', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (value: number) => value * 2);
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe(result[0].bodyHash);
        expect(result[0].namespace).toBe(PURE_SERVER_FN_NAMESPACE);
        expect(result[0].paramNames).toEqual(['value']);
        expect(result[0].fnBody).toContain('return value * 2');
        expect(result[0].fnBody).not.toContain(': number');
        expect(result[0].bodyHash).toBeDefined();
        expect(result[0].bodyHash.length).toBe(BODY_HASH_LENGTH);
        expect(result[0].isFactory).toBe(false);
    });

    it('should extract a named function expression mapper', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, function extractId(item: {id: number}): number {
    return item.id;
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe(result[0].bodyHash);
        expect(result[0].paramNames).toEqual(['item']);
        expect(result[0].fnBody).toContain('return item.id');
        expect(result[0].fnBody).not.toContain(': number');
    });

    it('should extract mapper with block body', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (user: any) => {
    const name = user.name;
    return name.toUpperCase();
});
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result).toHaveLength(1);
        expect(result[0].paramNames).toEqual(['user']);
        expect(result[0].fnBody).toContain('name.toUpperCase()');
    });

    it('should extract multiple mapFrom() calls from one file', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref1 = mapFrom(sub, (x: number) => x + 1);
export const ref2 = mapFrom(sub, (x: number) => x * 2);
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result).toHaveLength(2);
        expect(result[0].fnName).toBe(result[0].bodyHash);
        expect(result[1].fnName).toBe(result[1].bodyHash);
        expect(result[0].bodyHash).not.toBe(result[1].bodyHash);
    });

    it('should generate deterministic hashes', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (x: number) => x + 1);
`;
        const result1 = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        const result2 = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result1[0].bodyHash).toBe(result2[0].bodyHash);
    });

    it('should generate different hashes for different mapper bodies', () => {
        const source1 = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (x: number) => x + 1);
`;
        const source2 = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (x: number) => x + 2);
`;
        const result1 = extractPureFnsFromSource(source1, 'test.ts', 'mapFrom');
        const result2 = extractPureFnsFromSource(source2, 'test.ts', 'mapFrom');
        expect(result1[0].bodyHash).not.toBe(result2[0].bodyHash);
    });

    it('should validate purity — reject closure variables', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
const SECRET = 'hidden';
export const ref = mapFrom(sub, (x: string) => x + SECRET);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(/SECRET/);
    });

    it('should validate purity — reject forbidden identifiers', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (url: string) => fetch(url));
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(/fetch/);
    });

    it('should validate purity — reject this keyword', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, function() { return this.value; });
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(PurityError);
    });

    it('should throw when mapper is imported from another module', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
import {myMapper} from './helpers';
const sub = {} as any;
export const ref = mapFrom(sub, myMapper);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(/imported from another module/);
    });

    it('should throw when mapper cannot be resolved', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, unknownMapper);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(/could not be resolved/);
    });

    it('should throw when mapper is not a function', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, 'notAFunction');
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(/function expression or arrow function/);
    });

    it('should resolve a variable reference holding a mapper function', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
const myMapper = (x: number) => x + 1;
export const ref = mapFrom(sub, myMapper);
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result).toHaveLength(1);
        expect(result[0].fnName).toBe(result[0].bodyHash);
    });

    it('should return empty array for files without mapFrom', () => {
        const source = `const x = 1; export function hello() { return 'world'; }`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result).toHaveLength(0);
    });

    it('should handle calls that already have 3 arguments (already transformed)', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (x: number) => x + 1, 'existingHash');
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result).toHaveLength(1);
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
import {registerPureFnFactory} from '@mionjs/core';
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
import {registerPureFnFactory} from '@mionjs/core';
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
import {registerPureFnFactory} from '@mionjs/core';
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
import {registerPureFnFactory} from '@mionjs/core';
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
import {registerPureFnFactory} from '@mionjs/core';
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
import {registerPureFnFactory} from '@mionjs/core';
export const cpf = registerPureFnFactory('mion', 'fn', function () { return function t(x) { return x + 1; }; });
`;
        const source2 = `
import {registerPureFnFactory} from '@mionjs/core';
export const cpf = registerPureFnFactory('mion', 'fn', function () { return function t(x) { return x + 2; }; });
`;
        const r1 = extractPureFnsFromSource(source1, 'test.ts', 'registerPureFnFactory');
        const r2 = extractPureFnsFromSource(source2, 'test.ts', 'registerPureFnFactory');
        expect(r1[0].bodyHash).not.toBe(r2[0].bodyHash);
    });

    it('should include functionID in hash input (different IDs produce different hashes)', () => {
        const source1 = `
import {registerPureFnFactory} from '@mionjs/core';
export const cpf = registerPureFnFactory('mion', 'fn1', function () { return function t(x) { return x; }; });
`;
        const source2 = `
import {registerPureFnFactory} from '@mionjs/core';
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
import {registerPureFnFactory} from '@mionjs/core';
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
import {registerPureFnFactory} from '@mionjs/core';
const ns = 'mion';
export const cpf = registerPureFnFactory(ns, 'fn', function () { return function t() {}; });
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(/string literal/);
    });

    it('should throw when factoryFn is not a function expression', () => {
        const source = `
import {registerPureFnFactory} from '@mionjs/core';
const myFn = () => {};
export const cpf = registerPureFnFactory('mion', 'fn', myFn);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(/could not be resolved/);
    });

    it('should throw with import-specific message when factoryFn is an import', () => {
        const source = `
import {registerPureFnFactory} from '@mionjs/core';
import {myFactory} from './myModule';
export const cpf = registerPureFnFactory('mion', 'fn', myFactory);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'registerPureFnFactory')).toThrow(
            /imported from another module/
        );
    });
});

describe('extractPureFnsFromSource - user-provided names', () => {
    it('should use user-provided name as bodyHash and fnName for pureServerFn', () => {
        const source = `
import {pureServerFn} from '@mionjs/core';
export const fn = pureServerFn((x) => x + 1, 'addOne');
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].bodyHash).toBe('addOne');
        expect(result[0].fnName).toBe('addOne');
        expect(result[0].fnBody).toContain('return x + 1');
    });

    it('should use user-provided name as bodyHash and fnName for mapFrom', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (x) => x * 2, 'doubleMapper');
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom');
        expect(result).toHaveLength(1);
        expect(result[0].bodyHash).toBe('doubleMapper');
        expect(result[0].fnName).toBe('doubleMapper');
        expect(result[0].fnBody).toContain('return x * 2');
    });

    it('should use user-provided name for pureServerFn with PureFnDef object', () => {
        const source = `
import {pureServerFn} from '@mionjs/core';
export const fn = pureServerFn({ pureFn: (x) => x + 1, fnName: 'ignored' }, 'myName');
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].bodyHash).toBe('myName');
        expect(result[0].fnName).toBe('myName');
    });

    it('should throw when pureServerFn name argument is not a string literal', () => {
        const source = `
import {pureServerFn} from '@mionjs/core';
const name = 'addOne';
export const fn = pureServerFn((x) => x + 1, name);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/must be a string literal/);
    });

    it('should throw when mapFrom name argument is not a string literal', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
const name = 'mapper';
export const ref = mapFrom(sub, (x) => x + 1, name);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(/must be a string literal/);
    });

    it('should throw when pureServerFn name is an empty string', () => {
        const source = `
import {pureServerFn} from '@mionjs/core';
export const fn = pureServerFn((x) => x + 1, '');
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts')).toThrow(/must not be an empty string/);
    });

    it('should throw when mapFrom name is an empty string', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (x) => x + 1, '');
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom')).toThrow(/must not be an empty string/);
    });

    it('should still compute hash when no name is provided (regression)', () => {
        const source = `
import {pureServerFn} from '@mionjs/core';
export const fn = pureServerFn((x) => x + 1);
`;
        const result = extractPureFnsFromSource(source, 'test.ts');
        expect(result).toHaveLength(1);
        expect(result[0].bodyHash.length).toBe(BODY_HASH_LENGTH);
        expect(result[0].fnName).toBe(result[0].bodyHash);
    });
});

describe('extractPureFnsFromSource - noViteClient option', () => {
    it('should throw when noViteClient is true and pureServerFn has no name', () => {
        const source = `
import {pureServerFn} from '@mionjs/core';
export const fn = pureServerFn((x) => x + 1);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'pureServerFn', true)).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'pureServerFn', true)).toThrow(/noViteClient/);
    });

    it('should throw when noViteClient is true and mapFrom has no name', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (x) => x + 1);
`;
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom', true)).toThrow(PurityError);
        expect(() => extractPureFnsFromSource(source, 'test.ts', 'mapFrom', true)).toThrow(/noViteClient/);
    });

    it('should succeed when noViteClient is true and pureServerFn has a name', () => {
        const source = `
import {pureServerFn} from '@mionjs/core';
export const fn = pureServerFn((x) => x + 1, 'addOne');
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'pureServerFn', true);
        expect(result).toHaveLength(1);
        expect(result[0].bodyHash).toBe('addOne');
        expect(result[0].fnName).toBe('addOne');
    });

    it('should succeed when noViteClient is true and mapFrom has a name', () => {
        const source = `
import {mapFrom} from '@mionjs/client';
const sub = {} as any;
export const ref = mapFrom(sub, (x) => x + 1, 'addOneMapper');
`;
        const result = extractPureFnsFromSource(source, 'test.ts', 'mapFrom', true);
        expect(result).toHaveLength(1);
        expect(result[0].bodyHash).toBe('addOneMapper');
        expect(result[0].fnName).toBe('addOneMapper');
    });
});
