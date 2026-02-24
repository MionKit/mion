/* eslint-disable */
// This file demonstrates the ESLint rules for @mionkit pure functions
// The rules are disabled for this file so you can see both valid and invalid examples
import {pureServerFn, registerPureFnFactory} from '@mionkit/core';

// ========================================
// ✅ VALID EXAMPLES
// ========================================

// start:pure-functions-valid-basic
// Pure function using only params and allowed globals
pureServerFn((x: number) => Math.floor(x * 2));

// Pure function with local variables
pureServerFn(function compute(x: number) {
    const y = x * 2;
    const z = y + 1;
    return z;
});

// Pure function with nested callbacks and destructuring
pureServerFn((items: number[]) => items.map((x) => x + 1).filter((x) => x > 0));
pureServerFn(({a, b}: {a: number; b: number}) => a + b);
// end:pure-functions-valid-basic

// start:pure-functions-valid-globals
// Pure functions can use allowed globals: JSON, Math, RegExp, console, etc.
pureServerFn(function validate(s: string) {
    const encoded = encodeURIComponent(s);
    const num = parseInt(s, 10);
    const valid = isNaN(num) ? false : isFinite(num);
    const regex = new RegExp('^[a-z]+$');
    console.log(encoded, valid, regex);
    return num;
});

// Pure function with try-catch
pureServerFn(function safeParse(s: string) {
    try {
        return JSON.parse(s);
    } catch (e) {
        return null;
    }
});
// end:pure-functions-valid-globals

// start:pure-functions-valid-factory
// Factory functions follow the same purity rules — only local scope is allowed
pureServerFn({
    pureFn: function factory() {
        const regexp = new RegExp('^[a-z]+$');
        return function inner(s: string) {
            return regexp.test(s);
        };
    },
    isFactory: true,
});

// registerPureFnFactory — local variables within the factory are allowed
registerPureFnFactory('ns', 'limitItems', function () {
    const MAX_ITEMS = 100;
    return function inner(items: any[]) {
        return items.slice(0, MAX_ITEMS);
    };
});
// end:pure-functions-valid-factory

// ========================================
// ❌ INVALID EXAMPLES
// ========================================

// start:pure-functions-invalid-impure
// Using 'this' keyword
pureServerFn(function () {
    return this.x; // ❌ Error: 'this' is not allowed in pure functions
});

// Using async/await
pureServerFn(async (x: number) => await x); // ❌ Error: async/await is not allowed

// Using dynamic import()
pureServerFn((x: string) => import(x)); // ❌ Error: Dynamic import() is not allowed
// end:pure-functions-invalid-impure

// start:pure-functions-invalid-forbidden
// Forbidden identifiers: eval, fetch, setTimeout, process, window, etc.
pureServerFn((x: string) => eval(x)); // ❌ Error: "eval" is not allowed
pureServerFn((url: string) => fetch(url)); // ❌ Error: "fetch" is not allowed
pureServerFn(() => {
    setTimeout(() => {}, 100); // ❌ Error: "setTimeout" is not allowed
});
pureServerFn(() => process.env.KEY); // ❌ Error: "process" is not allowed
pureServerFn(() => window.location.href); // ❌ Error: "window" is not allowed
// end:pure-functions-invalid-forbidden

// start:pure-functions-invalid-closure
// Closure variables — referencing outer scope is not allowed
const SECRET = 'my-secret-key';
pureServerFn((x: string) => x + SECRET); // ❌ Error: Closure variable "SECRET" is not allowed

const config = {maxRetries: 3};
pureServerFn((x: number) => x + config.maxRetries); // ❌ Error: Closure variable "config" is not allowed
// end:pure-functions-invalid-closure

// start:pure-functions-invalid-factory
// Factory functions follow the same rules — closure variables are not allowed
const THRESHOLD = 10;
pureServerFn({
    pureFn: function factory() {
        return THRESHOLD; // ❌ Error: Closure variable "THRESHOLD" is not allowed
    },
    isFactory: true,
});

// Factory functions forbid dangerous identifiers like eval and fetch
registerPureFnFactory('ns', 'badFactory', function () {
    return function inner(x: string) {
        return eval(x); // ❌ Error: "eval" is not allowed in factory functions
    };
});

registerPureFnFactory('ns', 'badFactory2', function () {
    return function inner() {
        return fetch('/api'); // ❌ Error: "fetch" is not allowed in factory functions
    };
});
// end:pure-functions-invalid-factory

// start:pure-functions-invalid-imported
// Imported functions cannot be statically analyzed — must be defined in the same file
import {myFn} from './helpers.ts';
pureServerFn(myFn); // ❌ Error: argument "myFn" is imported from another module

pureServerFn({pureFn: myFn}); // ❌ Error: argument "myFn" is imported from another module

import {myFactory} from './helpers.ts';
registerPureFnFactory('ns', 'fn', myFactory); // ❌ Error: argument "myFactory" is imported from another module
// end:pure-functions-invalid-imported

// start:pure-functions-invalid-dynamic
// Dynamic arguments (function parameters) cannot be statically analyzed
function enhancePureServerFn(fn: (x: number) => number) {
    pureServerFn(fn); // ❌ Error: argument "fn" could not be resolved
}

function wrapFactory(factory: () => (x: number) => number) {
    registerPureFnFactory('ns', 'fn', factory); // ❌ Error: argument "factory" could not be resolved
}
// end:pure-functions-invalid-dynamic

export {}; // Make this a module
