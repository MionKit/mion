// This file demonstrates the ESLint rules for @mionjs/router
// The rules are disabled for this file so you can see both valid and invalid examples
import {HeadersSubset} from '@mionjs/core';
import {route, middleFn, headersFn, Handler, HeaderHandler, CallContext} from '@mionjs/router';

// ========================================
// ✅ VALID EXAMPLES (these should NOT trigger ESLint errors)
// ========================================

// 1. Direct inline handlers with proper types
route((ctx, name: string): string => `hello ${name}`);
middleFn((ctx, data: number): void => {
    console.log(data);
});
headersFn((c: CallContext, {headers}: HeadersSubset<'auth'>): void => {
    // do something
});

// 2. Function references with proper types
function validHandler(ctx, name: string): string {
    return `hello ${name}`;
}
const validArrowHandler = (ctx, name: string): string => `hello ${name}`;
route(validHandler);
route(validArrowHandler);

// 3. Type annotations
const typedHandler: Handler = (ctx, name: string): string => `hello ${name}`;
const typedHeaderHandler: HeaderHandler = (c: CallContext, {headers}: HeadersSubset<'auth'>): void => {
    const token = headers.auth;
    console.log(token);
};

// 4. Satisfies expressions
const satisfiesHandler = ((ctx, name: string): string => `hello ${name}`) satisfies Handler;
const satisfiesHeaderHandler = ((c: CallContext, {headers}: HeadersSubset<'auth'>): void => {
    const token = headers.auth;
    console.log(token);
}) satisfies HeaderHandler;

// 5. JSDoc tags
/**
 * @mion:route
 */
function routeWithJSDoc(ctx, name: string): string {
    return `hello ${name}`;
}

/**
 * @mion:middleFn
 */
const middleFnWithJSDoc = (ctx, data: number): void => {
    console.log(data);
};

/**
 * @mion:headersFn
 */
function headersFnWithJSDoc(c: CallContext, {headers}: HeadersSubset<'auth'>): void {
    const token = headers.auth;
    console.log(token);
}

// 6. Union types with proper order (more specific types first)
type UserResponse = {id: string; name: string; email: string} | {id: string; name: string} | {id: string};
route((ctx): UserResponse => ({id: '1', name: 'John', email: 'john@example.com'}));

// 7. Union types in parameters with proper order
type UserInput = {id: string; name: string; email: string} | {id: string; name: string} | {id: string};
route((ctx, user: UserInput): string => user.id);

// 8. Union types with distinct properties (no overlap)
type Action = {type: 'create'; data: string} | {type: 'update'; id: string} | {type: 'delete'; id: string};
route((ctx): Action => ({type: 'create', data: 'test'}));

// 9. Return objects matching single union type (no mixed properties)
type Result = {success: true; data: string} | {success: false; error: string};
route((ctx): Result => ({success: true, data: 'ok'}));
route((ctx): Result => ({success: false, error: 'failed'}));

// ========================================
// ❌ INVALID EXAMPLES (these SHOULD trigger ESLint errors when rule is enabled)
// ========================================

// ========================================
// Rule: @mionjs/strong-typed-routes
// ========================================

// 1. Direct inline handlers missing types
route((ctx, name) => `hello ${name}`); // Missing both param type and return type
middleFn((ctx, data: number) => {
    console.log(data);
}); // Missing return type
headersFn((c: CallContext, [token]): void => {
    // do something
}); // Missing param type

// 2. Function references missing types
function invalidHandler(ctx, name) {
    return `hello ${name}`;
}
const invalidArrowHandler = (ctx, name) => `hello ${name}`;
route(invalidHandler); // Should error: missing both types
route(invalidArrowHandler); // Should error: missing both types

// 3. Type annotations missing types
const invalidTypedHandler: Handler = (ctx, name) => `hello ${name}`; // Missing both types
const invalidTypedHeaderHandler: HeaderHandler = (c: CallContext, {headers}: HeadersSubset<'auth'>) => {
    const token = headers.auth;
    console.log(token);
}; // Missing return type

// 4. Satisfies expressions missing types
const invalidSatisfiesHandler = ((ctx, name) => `hello ${name}`) satisfies Handler; // Missing both types
const invalidSatisfiesHeaderHandler = ((c: CallContext, {headers}): void => {
    const token = headers.auth;
    console.log(token);
}) satisfies HeaderHandler; // Missing param type

// 5. JSDoc tags missing types
/**
 * @mion:route
 */
function invalidRouteJSDoc(ctx, name) {
    return `hello ${name}`;
} // Missing both types

/**
 * @mion:middleFn
 */
const invalidMiddleFnJSDoc = (ctx, data: number) => {
    console.log(data);
}; // Missing return type

/**
 * @mion:headersFn
 */
function invalidHeadersFnJSDoc(c: CallContext, {headers}): void {
    const token = headers.auth;
    console.log(token);
} // Missing param type

// ========================================
// Rule: @mionjs/no-unreachable-union-types
// ========================================

// 1. Unreachable union type in return (subset before superset)
type UnreachableReturn = {a: string} | {a: string; b: number}; // Second type is unreachable
route((ctx): UnreachableReturn => ({a: 'hello'}));

// 2. Unreachable union type in parameter
type UnreachableParam = {id: string} | {id: string; name: string}; // Second type is unreachable
route((ctx, data: UnreachableParam): string => data.id);

// 3. Optional properties blocking more specific types
type OptionalBlocking = {a?: string} | {a: string; b: number}; // Second type is unreachable
route((ctx): OptionalBlocking => ({a: 'hello', b: 1}));

// 4. Mixed optional/required blocking
type MixedBlocking = {a: string; b?: number} | {a: string; b: number}; // Second type is unreachable
route((ctx): MixedBlocking => ({a: 'hello', b: 1}));

// 5. Multiple unreachable types
type MultipleUnreachable = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
// Both second and third types are unreachable
route((ctx): MultipleUnreachable => ({a: 'hello'}));

// 6. Unreachable in headersFn parameter (third parameter)
type UnreachableHeaderParam = {x: number} | {x: number; y: number}; // Second type is unreachable
headersFn((ctx, {headers}: HeadersSubset<'auth'>, data: UnreachableHeaderParam): void => {
    console.log(data.x);
});

// 7. Unreachable in middleFn parameter
type UnreachableMiddleFnParam = {status: string} | {status: string; code: number}; // Second type is unreachable
middleFn((ctx, data: UnreachableMiddleFnParam): void => {
    console.log(data.status);
});

// 8. Multiple parameters with unreachable unions
type UserBase = {id: string} | {id: string; email: string}; // Second type is unreachable
type ProductBase = {sku: string} | {sku: string; price: number}; // Second type is unreachable
route((ctx, user: UserBase, product: ProductBase): string => {
    return `${user.id}-${product.sku}`;
});

// 9. Nested object with unreachable union in parameter
type NestedUnreachable = {
    data: {value: string} | {value: string; extra: number}; // Second type is unreachable
};
route((ctx, input: NestedUnreachable): string => input.data.value);

// 10. Optional properties in parameter union
type OptionalParamBlocking = {name?: string} | {name: string; age: number}; // Second type is unreachable
route((ctx, person: OptionalParamBlocking): string => person.name || 'unknown');

// ========================================
// Rule: @mionjs/no-type-imports
// ========================================

// start:no-type-imports
// ❌ WRONG: Type-only import - types are erased at runtime
import type {User, Product} from './models.ts';

// Types imported with 'type' keyword are erased at runtime
// mion cannot generate validation/serialization functions for them
const getUser = route((ctx, id: number): User => {
    return {id, name: 'John', email: 'john@example.com'};
});

const createProduct = route((ctx, product: Product): Product => {
    return product;
});

const logUser = middleFn((ctx, user: User): void => {
    console.log(user.name);
});

export const routes = {getUser, createProduct, logUser};

// ========================================
// Rule: @mionjs/pure-functions
// ========================================

import {pureServerFn, registerPureFnFactory} from '@mionjs/core';

// ========================================
// ✅ VALID EXAMPLES (these should NOT trigger ESLint errors)
// ========================================

// 1. Pure function using only params and allowed globals
pureServerFn((x: number) => Math.floor(x * 2));

// 2. Pure function with local variables
pureServerFn(function compute(x: number) {
    const y = x * 2;
    const z = y + 1;
    return z;
});

// 3. Pure function with JSON, RegExp, and other allowed globals
pureServerFn(function validate(s: string) {
    const encoded = encodeURIComponent(s);
    const num = parseInt(s, 10);
    const valid = isNaN(num) ? false : isFinite(num);
    const regex = new RegExp('^[a-z]+$');
    console.log(encoded, valid, regex);
    return num;
});

// 4. Pure function with nested callbacks and destructuring
pureServerFn((items: number[]) => items.map((x) => x + 1).filter((x) => x > 0));
pureServerFn(({a, b}: {a: number; b: number}) => a + b);

// 5. Pure function with loops and try-catch
pureServerFn(function safeParse(s: string) {
    try {
        return JSON.parse(s);
    } catch (e) {
        return null;
    }
});

// 6. Object form (PureFnDef)
pureServerFn({
    pureFn: function greeting() {
        return 'hello';
    },
    fnName: 'greeting',
});

// 7. Factory function via isFactory: true — closures are allowed
const THRESHOLD = 10;
pureServerFn({
    pureFn: function factory() {
        return THRESHOLD;
    },
    isFactory: true,
});

// 8. registerPureFnFactory — closures are allowed in factory functions
const MAX_ITEMS = 100;
registerPureFnFactory('ns', 'limitItems', function () {
    return function inner(items: any[]) {
        return items.slice(0, MAX_ITEMS);
    };
});

// 9. Variable references — function defined separately, passed by name
const doubler = (x: number) => x * 2;
pureServerFn(doubler);

const myDef = {
    pureFn: function triple(x: number) {
        return x * 3;
    },
    fnName: 'triple',
};
pureServerFn(myDef);

// ========================================
// ❌ INVALID EXAMPLES (these SHOULD trigger ESLint errors when rule is enabled)
// ========================================

// 1. Using 'this' keyword
pureServerFn(function () {
    return this.x;
});

// 2. Using async/await
pureServerFn(async (x: number) => await x);

// 3. Using dynamic import()
pureServerFn((x: string) => import(x));

// 4. Forbidden identifiers: eval, fetch, setTimeout, process, window, etc.
pureServerFn((x: string) => eval(x));
pureServerFn((url: string) => fetch(url));
pureServerFn(() => {
    setTimeout(() => {}, 100);
});
pureServerFn(() => process.env.KEY);
pureServerFn(() => window.location.href);
pureServerFn(() => document.getElementById('app'));

// 5. Closure variables — referencing outer scope
const SECRET = 'my-secret-key';
pureServerFn((x: string) => x + SECRET);

const config = {maxRetries: 3};
pureServerFn((x: number) => x + config.maxRetries);

// 6. Object form with violation
pureServerFn({pureFn: (x: string) => eval(x)});

// 7. Object form with isFactory: false — closures NOT allowed
const outerValue = 42;
pureServerFn({
    pureFn: () => outerValue,
    isFactory: false,
});

// 8. registerPureFnFactory with forbidden identifiers (forbidden even for factories)
registerPureFnFactory('ns', 'badFactory', function () {
    return function inner(x: string) {
        return eval(x);
    };
});

registerPureFnFactory('ns', 'badFactory2', function () {
    return new Function('return 1');
});

registerPureFnFactory('ns', 'badFactory3', function () {
    return function inner() {
        return fetch('/api');
    };
});

// 9. Variable reference with violation
const impureFn = (x: string) => x + SECRET;
pureServerFn(impureFn);

// 10. Imported functions — cannot be statically analyzed
import {myFn} from './helpers.ts';
pureServerFn(myFn); // ❌ Error: argument "myFn" is imported from another module
pureServerFn({pureFn: myFn}); // ❌ Error: argument "myFn" is imported from another module

import {myFactory} from './helpers.ts';
registerPureFnFactory('ns', 'importedFactory', myFactory); // ❌ Error: argument "myFactory" is imported from another module

// 11. Dynamic arguments (function parameters) — cannot be statically analyzed
function enhancePureServerFn(fn: (x: number) => number) {
    pureServerFn(fn); // ❌ Error: argument "fn" could not be resolved
}

function wrapFactory(factory: () => (x: number) => number) {
    registerPureFnFactory('ns', 'dynamicFactory', factory); // ❌ Error: argument "factory" could not be resolved
}

// ========================================
// Rule: @mionjs/type-formats-imports
// ========================================

// ✅ VALID: Regular imports preserve type metadata for runtime reflection
import {FormatEmail, FormatUrl} from '@mionjs/type-formats/StringFormats';
import {FormatNumber, FormatInteger} from '@mionjs/type-formats/NumberFormats';
import {FormatBigInt} from '@mionjs/type-formats/BigintFormats';
import {TypeFormat} from '@mionjs/run-types';

// ❌ INVALID: Type-only imports strip metadata, causing silent validation failures
import type {FormatStringTime, FormatStringDate} from '@mionjs/type-formats/StringFormats';
import type {FormatFloat} from '@mionjs/type-formats/NumberFormats';
import {type FormatBigInt64} from '@mionjs/type-formats/BigintFormats';
import type {TypeFormat as TF} from '@mionjs/run-types';
