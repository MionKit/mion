// This file demonstrates the ESLint rules for @mionkit/router
// The rules are disabled for this file so you can see both valid and invalid examples
import {HeadersSubset} from '@mionkit/core';
import {route, linkedFn, headersFn, Handler, HeaderHandler, CallContext} from '@mionkit/router';

// ========================================
// ✅ VALID EXAMPLES (these should NOT trigger ESLint errors)
// ========================================

// 1. Direct inline handlers with proper types
route((ctx, name: string): string => `hello ${name}`);
linkedFn((ctx, data: number): void => {
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
 * @mion:linkedFn
 */
const linkedFnWithJSDoc = (ctx, data: number): void => {
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
// Rule: @mionkit/strong-typed-routes
// ========================================

// 1. Direct inline handlers missing types
route((ctx, name) => `hello ${name}`); // Missing both param type and return type
linkedFn((ctx, data: number) => {
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
 * @mion:linkedFn
 */
const invalidLinkedFnJSDoc = (ctx, data: number) => {
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
// Rule: @mionkit/no-unreachable-union-types
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

// 7. Unreachable in linkedFn parameter
type UnreachableLinkedFnParam = {status: string} | {status: string; code: number}; // Second type is unreachable
linkedFn((ctx, data: UnreachableLinkedFnParam): void => {
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
// Rule: @mionkit/no-mixed-union-properties , !!RULE DISABLED AS DOES NOT ADD MUCH VALUE!!
// ========================================

// // 1. Return object with properties from multiple union types
// type MixedResult = {success: true; data: string} | {success: false; error: string};
// route((ctx): MixedResult => ({success: true, data: 'ok', error: 'also has error'})); // Mixed properties

// // 2. Object literal with unique properties from different union types
// type UserOrProduct = {userId: string; userName: string} | {productId: string; productName: string};
// route((ctx): UserOrProduct => ({userId: '1', productId: '2'})); // Has properties from both types

// // 3. Multiple mixed returns in conditional
// type Status = {active: boolean; lastSeen: Date} | {active: boolean; reason: string};
// route((ctx): Status => {
//     if (Math.random() > 0.5) {
//         return {active: true, lastSeen: new Date(), reason: 'mixed'}; // Mixed properties
//     }
//     return {active: false, lastSeen: new Date(), reason: 'also mixed'}; // Mixed properties
// });

// 4. LinkedFn with mixed properties
type LinkedFnData = {name: string} | {age: number};
linkedFn((ctx): LinkedFnData => ({name: 'John', age: 25})); // Mixed properties

export {}; // Make this a module

// ========================================
// Rule: @mionkit/no-type-imports
// ========================================

// start:no-type-imports
// ❌ WRONG: Type-only import - types are erased at runtime
import type {User, Product} from './models';

// Types imported with 'type' keyword are erased at runtime
// mion cannot generate validation/serialization functions for them
const getUser = route((ctx, id: number): User => {
    return {id, name: 'John', email: 'john@example.com'};
});

const createProduct = route((ctx, product: Product): Product => {
    return product;
});

const logUser = linkedFn((ctx, user: User): void => {
    console.log(user.name);
});

export const routes = {getUser, createProduct, logUser};
