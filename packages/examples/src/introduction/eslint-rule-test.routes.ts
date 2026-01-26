// This file demonstrates the ESLint rules for @mionkit/router
// The rules are disabled for this file so you can see both valid and invalid examples
import {HeadersSubset} from '@mionkit/core';
import {route, linkedFn, headersLinkedFn, Handler, HeaderHandler, CallContext} from '@mionkit/router';

// ========================================
// ✅ VALID EXAMPLES (these should NOT trigger ESLint errors)
// ========================================

// start:strong-typed-valid-inline
// 1. Direct inline handlers with proper types
route((ctx, name: string): string => `hello ${name}`);
linkedFn((ctx, data: number): void => {
    console.log(data);
});
headersLinkedFn((c: CallContext, {headers}: HeadersSubset<'auth'>): void => {
    // do something
});
// end:strong-typed-valid-inline

// start:strong-typed-valid-function-refs
// 2. Function references with proper types
function validHandler(ctx, name: string): string {
    return `hello ${name}`;
}
const validArrowHandler = (ctx, name: string): string => `hello ${name}`;
route(validHandler);
route(validArrowHandler);
// end:strong-typed-valid-function-refs

// start:strong-typed-valid-type-annotations
// 3. Type annotations
const typedHandler: Handler = (ctx, name: string): string => `hello ${name}`;
const typedHeaderHandler: HeaderHandler = (c: CallContext, {headers}: HeadersSubset<'auth'>): void => {
    const token = headers.auth;
    console.log(token);
};
// end:strong-typed-valid-type-annotations

// start:strong-typed-valid-satisfies
// 4. Satisfies expressions
const satisfiesHandler = ((ctx, name: string): string => `hello ${name}`) satisfies Handler;
const satisfiesHeaderHandler = ((c: CallContext, {headers}: HeadersSubset<'auth'>): void => {
    const token = headers.auth;
    console.log(token);
}) satisfies HeaderHandler;
// end:strong-typed-valid-satisfies

// start:strong-typed-valid-jsdoc
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
 * @mion:headersLinkedFn
 */
function headersLinkedFnWithJSDoc(c: CallContext, {headers}: HeadersSubset<'auth'>): void {
    const token = headers.auth;
    console.log(token);
}
// end:strong-typed-valid-jsdoc

// start:union-types-valid-order
// 6. Union types with proper order (more specific types first)
type UserResponse = {id: string; name: string; email: string} | {id: string; name: string} | {id: string};
route((ctx): UserResponse => ({id: '1', name: 'John', email: 'john@example.com'}));

// 7. Union types in parameters with proper order
type UserInput = {id: string; name: string; email: string} | {id: string; name: string} | {id: string};
route((ctx, user: UserInput): string => user.id);
// end:union-types-valid-order

// start:union-types-valid-distinct
// 8. Union types with distinct properties (no overlap)
type Action = {type: 'create'; data: string} | {type: 'update'; id: string} | {type: 'delete'; id: string};
route((ctx): Action => ({type: 'create', data: 'test'}));

// 9. Return objects matching single union type (no mixed properties)
type Result = {success: true; data: string} | {success: false; error: string};
route((ctx): Result => ({success: true, data: 'ok'}));
route((ctx): Result => ({success: false, error: 'failed'}));
// end:union-types-valid-distinct

// ========================================
// ❌ INVALID EXAMPLES (these SHOULD trigger ESLint errors when rule is enabled)
// ========================================

// ========================================
// Rule: @mionkit/strong-typed-routes
// ========================================

// start:strong-typed-invalid-inline
// 1. Direct inline handlers missing types
route((ctx, name) => `hello ${name}`); // Missing both param type and return type
linkedFn((ctx, data: number) => {
    console.log(data);
}); // Missing return type
headersLinkedFn((c: CallContext, [token]): void => {
    // do something
}); // Missing param type
// end:strong-typed-invalid-inline

// start:strong-typed-invalid-function-refs
// 2. Function references missing types
function invalidHandler(ctx, name) {
    return `hello ${name}`;
}
const invalidArrowHandler = (ctx, name) => `hello ${name}`;
route(invalidHandler); // Should error: missing both types
route(invalidArrowHandler); // Should error: missing both types
// end:strong-typed-invalid-function-refs

// start:strong-typed-invalid-type-annotations
// 3. Type annotations missing types
const invalidTypedHandler: Handler = (ctx, name) => `hello ${name}`; // Missing both types
const invalidTypedHeaderHandler: HeaderHandler = (c: CallContext, {headers}: HeadersSubset<'auth'>) => {
    const token = headers.auth;
    console.log(token);
}; // Missing return type
// end:strong-typed-invalid-type-annotations

// start:strong-typed-invalid-satisfies
// 4. Satisfies expressions missing types
const invalidSatisfiesHandler = ((ctx, name) => `hello ${name}`) satisfies Handler; // Missing both types
const invalidSatisfiesHeaderHandler = ((c: CallContext, {headers}): void => {
    const token = headers.auth;
    console.log(token);
}) satisfies HeaderHandler; // Missing param type
// end:strong-typed-invalid-satisfies

// start:strong-typed-invalid-jsdoc
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
 * @mion:headersLinkedFn
 */
function invalidHeadersLinkedFnJSDoc(c: CallContext, {headers}): void {
    const token = headers.auth;
    console.log(token);
} // Missing param type
// end:strong-typed-invalid-jsdoc

// ========================================
// Rule: @mionkit/no-unreachable-union-types
// ========================================

// start:unreachable-union-basic
// 1. Unreachable union type in return (subset before superset)
type UnreachableReturn = {a: string} | {a: string; b: number}; // Second type is unreachable
route((ctx): UnreachableReturn => ({a: 'hello'}));

// 2. Unreachable union type in parameter
type UnreachableParam = {id: string} | {id: string; name: string}; // Second type is unreachable
route((ctx, data: UnreachableParam): string => data.id);
// end:unreachable-union-basic

// start:unreachable-union-optional
// 3. Optional properties blocking more specific types
type OptionalBlocking = {a?: string} | {a: string; b: number}; // Second type is unreachable
route((ctx): OptionalBlocking => ({a: 'hello', b: 1}));

// 4. Mixed optional/required blocking
type MixedBlocking = {a: string; b?: number} | {a: string; b: number}; // Second type is unreachable
route((ctx): MixedBlocking => ({a: 'hello', b: 1}));
// end:unreachable-union-optional

// start:unreachable-union-multiple
// 5. Multiple unreachable types
type MultipleUnreachable = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
// Both second and third types are unreachable
route((ctx): MultipleUnreachable => ({a: 'hello'}));
// end:unreachable-union-multiple

// start:unreachable-union-linkedFns
// 6. Unreachable in headersLinkedFn parameter (third parameter)
type UnreachableHeaderParam = {x: number} | {x: number; y: number}; // Second type is unreachable
headersLinkedFn((ctx, {headers}: HeadersSubset<'auth'>, data: UnreachableHeaderParam): void => {
    console.log(data.x);
});

// 7. Unreachable in linkedFn parameter
type UnreachableLinkedFnParam = {status: string} | {status: string; code: number}; // Second type is unreachable
linkedFn((ctx, data: UnreachableLinkedFnParam): void => {
    console.log(data.status);
});
// end:unreachable-union-linkedFns

// start:unreachable-union-complex
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
// end:unreachable-union-complex

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
