/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './pure-functions.ts';

const ruleTester = new RuleTester();

ruleTester.run('pure-functions', rule, {
    valid: [
        // Pure function with only local variables and params
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: number) => x + 1);
            `,
        },
        // Pure function using allowed globals (Math, JSON)
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: number) => Math.floor(x));
            `,
        },
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: any) => JSON.stringify(x));
            `,
        },
        // Pure function with local const/let/var declarations
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(function compute(x: number) {
                    const y = x * 2;
                    let z = y + 1;
                    return z;
                });
            `,
        },
        // Pure function with nested arrow callbacks
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((items: number[]) => items.map(x => x + 1));
            `,
        },
        // Pure function with destructuring
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(({a, b}: {a: number, b: number}) => a + b);
            `,
        },
        // Pure function with for loop
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(function sum(items: number[]) {
                    let total = 0;
                    for (let i = 0; i < items.length; i++) {
                        total += items[i];
                    }
                    return total;
                });
            `,
        },
        // Pure function with for-of loop
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(function sum(items: number[]) {
                    let total = 0;
                    for (const item of items) {
                        total += item;
                    }
                    return total;
                });
            `,
        },
        // Pure function with try-catch
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(function safeParse(s: string) {
                    try {
                        return JSON.parse(s);
                    } catch (e) {
                        return null;
                    }
                });
            `,
        },
        // Pure function with object literal (not shorthand for outer var)
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: number) => ({ value: x, doubled: x * 2 }));
            `,
        },
        // Object form with pureFn property
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn({
                    pureFn: function greeting() { return 'hello'; },
                    fnName: 'greeting',
                });
            `,
        },
        // Factory function with local scope only (isFactory: true)
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn({
                    pureFn: function factory() {
                        const regexp = new RegExp('^[a-z]+$');
                        return function inner(s: string) { return regexp.test(s); };
                    },
                    isFactory: true,
                });
            `,
        },
        // registerPureFnFactory with local scope only
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                registerPureFnFactory('ns', 'fn', function() {
                    const multiplier = 2;
                    return function inner(x: number) { return x * multiplier; };
                });
            `,
        },
        // Not imported from @mionjs/core — should be ignored
        {
            code: `
                import { pureServerFn } from 'other-package';
                const SECRET = 'key';
                pureServerFn(() => SECRET);
            `,
        },
        // Function named pureServerFn but not imported — should be ignored
        {
            code: `
                function pureServerFn(fn: any) { return fn; }
                const SECRET = 'key';
                pureServerFn(() => SECRET);
            `,
        },
        // File without relevant imports — should be ignored
        {
            code: `
                const x = 42;
                const fn = () => x + 1;
            `,
        },
        // Pure function using various allowed globals
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(function validate(s: string) {
                    const encoded = encodeURIComponent(s);
                    const num = parseInt(s, 10);
                    const valid = isNaN(num) ? false : isFinite(num);
                    const regex = new RegExp('^[a-z]+$');
                    const arr = new Array(10);
                    const map = new Map();
                    const set = new Set();
                    console.log(encoded);
                    return valid;
                });
            `,
        },
        // Aliased import
        {
            code: `
                import { pureServerFn as psf } from '@mionjs/core';
                psf((x: number) => x + 1);
            `,
        },
        // Variable reference: function defined as variable, passed by name
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const myFn = (x: number) => x + 1;
                pureServerFn(myFn);
            `,
        },
        // Variable reference: object literal defined as variable
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const myDef = {
                    pureFn: function greeting() { return 'hello'; },
                    fnName: 'greeting',
                };
                pureServerFn(myDef);
            `,
        },
        // Variable reference: factory function passed to registerPureFnFactory
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                const myFactory = function() {
                    return function inner(x: number) { return x + 1; };
                };
                registerPureFnFactory('ns', 'fn', myFactory);
            `,
        },
        // Variable reference: pureFn property is also a variable reference
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const myFn = function double(x: number) { return x * 2; };
                const myDef = {
                    pureFn: myFn,
                    fnName: 'double',
                };
                pureServerFn(myDef);
            `,
        },
        // mapFrom() with pure arrow mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                mapFrom(sub, (x: number) => x * 2);
            `,
        },
        // mapFrom() with pure named function mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                mapFrom(sub, function extractId(item: {id: number}) { return item.id; });
            `,
        },
        // mapFrom() with allowed globals
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                mapFrom(sub, (x: any) => JSON.stringify(x));
            `,
        },
        // mapFrom() with local variables
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                mapFrom(sub, (x: number) => {
                    const doubled = x * 2;
                    return doubled;
                });
            `,
        },
        // mapFrom() with variable reference mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                const myMapper = (x: number) => x + 1;
                mapFrom(sub, myMapper);
            `,
        },
        // mapFrom() not imported from @mionjs/client — should be ignored
        {
            code: `
                import { mapFrom } from 'other-package';
                const SECRET = 'key';
                mapFrom({} as any, () => SECRET);
            `,
        },
    ],
    invalid: [
        // pureServerFn with 'this' keyword
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(function() { return this.x; });
            `,
            errors: [{messageId: 'purityThis', data: {fnType: 'pure functions'}}],
        },
        // pureServerFn with await
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(async (x: number) => await x);
            `,
            errors: [{messageId: 'purityAwait', data: {fnType: 'pure functions'}}],
        },
        // pureServerFn with dynamic import
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: string) => import(x));
            `,
            errors: [{messageId: 'purityDynamicImport', data: {fnType: 'pure functions'}}],
        },
        // pureServerFn with eval
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: string) => eval(x));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}}],
        },
        // pureServerFn with fetch
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((url: string) => fetch(url));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'fetch', fnType: 'pure functions'}}],
        },
        // pureServerFn with setTimeout
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(() => { setTimeout(() => {}, 100); });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'setTimeout', fnType: 'pure functions'}}],
        },
        // pureServerFn with closure variable
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const SECRET = 'key';
                pureServerFn((x: string) => x + SECRET);
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'SECRET', fnType: 'pure functions'}}],
        },
        // pureServerFn with process
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(() => process.env.KEY);
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'process', fnType: 'pure functions'}}],
        },
        // pureServerFn with window
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(() => window.location.href);
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'window', fnType: 'pure functions'}}],
        },
        // Object form with purity violation
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn({ pureFn: (x: string) => eval(x) });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}}],
        },
        // Object form with isFactory: false and closure — should report
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const outer = 42;
                pureServerFn({
                    pureFn: () => outer,
                    isFactory: false,
                });
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'outer', fnType: 'pure functions'}}],
        },
        // registerPureFnFactory with eval (forbidden even for factories)
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                registerPureFnFactory('ns', 'fn', function() {
                    return function inner(x: string) { return eval(x); };
                });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'factory functions'}}],
        },
        // registerPureFnFactory with Function constructor (forbidden for factories)
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                registerPureFnFactory('ns', 'fn', function() {
                    return new Function('return 1');
                });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'Function', fnType: 'factory functions'}}],
        },
        // registerPureFnFactory with fetch (forbidden for factories)
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                registerPureFnFactory('ns', 'fn', function() {
                    return function inner() { return fetch('/api'); };
                });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'fetch', fnType: 'factory functions'}}],
        },
        // registerPureFnFactory with this (forbidden for factories)
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                registerPureFnFactory('ns', 'fn', function() {
                    return this.value;
                });
            `,
            errors: [{messageId: 'purityThis', data: {fnType: 'factory functions'}}],
        },
        // Factory function with closure variable (isFactory: true)
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const outer = 42;
                pureServerFn({
                    pureFn: function factory() { return outer; },
                    isFactory: true,
                });
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'outer', fnType: 'factory functions'}}],
        },
        // Factory function with setTimeout (forbidden for factories)
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn({
                    pureFn: function factory() { return setTimeout; },
                    isFactory: true,
                });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'setTimeout', fnType: 'factory functions'}}],
        },
        // registerPureFnFactory with closure variable
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                const MAX = 100;
                registerPureFnFactory('ns', 'fn', function() {
                    return function inner(x: number) { return x + MAX; };
                });
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'MAX', fnType: 'factory functions'}}],
        },
        // Multiple violations reported
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn(function() {
                    eval('code');
                    return fetch('/api');
                });
            `,
            errors: [
                {messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}},
                {messageId: 'purityForbiddenIdentifier', data: {name: 'fetch', fnType: 'pure functions'}},
            ],
        },
        // Aliased import still catches violations
        {
            code: `
                import { pureServerFn as psf } from '@mionjs/core';
                psf(() => eval('x'));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}}],
        },
        // Variable reference: function with violation
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const SECRET = 'key';
                const myFn = (x: string) => x + SECRET;
                pureServerFn(myFn);
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'SECRET', fnType: 'pure functions'}}],
        },
        // Variable reference: object literal with violation
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const myDef = {
                    pureFn: () => eval('x'),
                };
                pureServerFn(myDef);
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}}],
        },
        // Variable reference: factory fn with violation via registerPureFnFactory
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                const myFactory = function() { return eval('x'); };
                registerPureFnFactory('ns', 'fn', myFactory);
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'factory functions'}}],
        },
        // Variable reference: pureFn property is variable with violation
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const myFn = () => fetch('/api');
                const myDef = {
                    pureFn: myFn,
                };
                pureServerFn(myDef);
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'fetch', fnType: 'pure functions'}}],
        },
        // pureServerFn with imported named function
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                import { myFn } from './myModule';
                pureServerFn(myFn);
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'pureServerFn', name: 'myFn'}}],
        },
        // pureServerFn with imported function in object form
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                import { myFn } from './myModule';
                pureServerFn({ pureFn: myFn });
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'pureServerFn', name: 'myFn'}}],
        },
        // registerPureFnFactory with imported function
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                import { myFactory } from './myModule';
                registerPureFnFactory('ns', 'fn', myFactory);
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'registerPureFnFactory', name: 'myFactory'}}],
        },
        // pureServerFn with default import
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                import myFn from './myModule';
                pureServerFn(myFn);
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'pureServerFn', name: 'myFn'}}],
        },
        // pureServerFn with function parameter (dynamic value)
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                function wrap(fn: any) {
                    pureServerFn(fn);
                }
            `,
            errors: [{messageId: 'unresolvedArgument', data: {callee: 'pureServerFn', name: 'fn'}}],
        },
        // registerPureFnFactory with function parameter
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                function wrap(factory: any) {
                    registerPureFnFactory('ns', 'fn', factory);
                }
            `,
            errors: [{messageId: 'unresolvedArgument', data: {callee: 'registerPureFnFactory', name: 'factory'}}],
        },
        // pureServerFn with variable initialized from function call (not resolvable to function)
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const myFn = createFn();
                pureServerFn(myFn);
            `,
            errors: [{messageId: 'unresolvedArgument', data: {callee: 'pureServerFn', name: 'myFn'}}],
        },
        // mapFrom() with closure variable in mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                const MULTIPLIER = 5;
                mapFrom(sub, (x: number) => x * MULTIPLIER);
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'MULTIPLIER', fnType: 'pure functions'}}],
        },
        // mapFrom() with forbidden identifier in mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                mapFrom(sub, (url: string) => fetch(url));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'fetch', fnType: 'pure functions'}}],
        },
        // mapFrom() with eval in mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                mapFrom(sub, (x: string) => eval(x));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}}],
        },
        // mapFrom() with this in mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                mapFrom(sub, function() { return this.value; });
            `,
            errors: [{messageId: 'purityThis', data: {fnType: 'pure functions'}}],
        },
        // mapFrom() with imported mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                import { myMapper } from './myModule';
                const sub = {} as any;
                mapFrom(sub, myMapper);
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'mapFrom', name: 'myMapper'}}],
        },
        // mapFrom() with unresolved mapper
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                function wrap(mapper: any) {
                    mapFrom(sub, mapper);
                }
            `,
            errors: [{messageId: 'unresolvedArgument', data: {callee: 'mapFrom', name: 'mapper'}}],
        },
        // mapFrom() with variable reference mapper that has violation
        {
            code: `
                import { mapFrom } from '@mionjs/client';
                const sub = {} as any;
                const SECRET = 'key';
                const myMapper = (x: string) => x + SECRET;
                mapFrom(sub, myMapper);
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'SECRET', fnType: 'pure functions'}}],
        },
    ],
});
