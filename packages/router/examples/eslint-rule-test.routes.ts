// This file demonstrates the strong-typed-routes ESLint rule
// The rule is disabled for this file so you can see both valid and invalid examples
import {route, hook, headersHook, Handler, HeaderHandler} from '@mionkit/router';

// ========================================
// ✅ VALID EXAMPLES (these should NOT trigger ESLint errors)
// ========================================

// 1. Direct inline handlers with proper types
route((ctx, name: string): string => `hello ${name}`);
hook((ctx, data: number): void => {
    console.log(data);
});
headersHook(['auth'], (ctx, token: string): void => {
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
const typedHeaderHandler: HeaderHandler = (ctx, token: string): void => {
    console.log(token);
};

// 4. Satisfies expressions
const satisfiesHandler = ((ctx, name: string): string => `hello ${name}`) satisfies Handler;
const satisfiesHeaderHandler = ((ctx, token: string): void => {
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
 * @mion:hook
 */
const hookWithJSDoc = (ctx, data: number): void => {
    console.log(data);
};

/**
 * @mion:headersHook
 */
function headersHookWithJSDoc(ctx, token: string): void {
    console.log(token);
}

// ========================================
// ❌ INVALID EXAMPLES (these SHOULD trigger ESLint errors when rule is enabled)
// ========================================

/* eslint-disable @mionkit/strong-typed-routes */

// 1. Direct inline handlers missing types
route((ctx, name) => `hello ${name}`); // Missing both param type and return type
hook((ctx, data: number) => {
    console.log(data);
}); // Missing return type
headersHook(['auth'], (ctx, token): void => {
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
const invalidTypedHeaderHandler: HeaderHandler = (ctx, token: string) => {
    console.log(token);
}; // Missing return type

// 4. Satisfies expressions missing types
const invalidSatisfiesHandler = ((ctx, name) => `hello ${name}`) satisfies Handler; // Missing both types
const invalidSatisfiesHeaderHandler = ((ctx, token): void => {
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
 * @mion:hook
 */
const invalidHookJSDoc = (ctx, data: number) => {
    console.log(data);
}; // Missing return type

/**
 * @mion:headersHook
 */
function invalidHeadersHookJSDoc(ctx, token): void {
    console.log(token);
} // Missing param type

// ========================================
// 📝 INSTRUCTIONS FOR TESTING:
// ========================================
// 1. Remove the first line: /* eslint-disable @mionkit/strong-typed-routes */
// 2. Run: npx eslint packages/router/examples/eslint-rule-test.routes.ts
// 3. You should see ESLint errors for all the "INVALID EXAMPLES" above
// 4. The "VALID EXAMPLES" should not produce any errors
// 5. Add the disable comment back to prevent CI failures

export {}; // Make this a module
