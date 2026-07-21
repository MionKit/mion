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
        // serverMapFrom mapper with only local variables and params
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', (x: number) => x + 1);
            `,
        },
        // serverMapFrom mapper using allowed globals (Math)
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', (x: number) => Math.floor(x));
            `,
        },
        // serverMapFrom mapper using allowed globals (JSON)
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', (x: any) => JSON.stringify(x));
            `,
        },
        // serverMapFrom mapper with local const/let/var declarations
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', function compute(x: number) {
                    const y = x * 2;
                    let z = y + 1;
                    return z;
                });
            `,
        },
        // serverMapFrom mapper with nested arrow callbacks
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', (items: number[]) => items.map(x => x + 1));
            `,
        },
        // serverMapFrom mapper with destructuring
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', ({a, b}: {a: number, b: number}) => a + b);
            `,
        },
        // serverMapFrom mapper with for loop
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', function sum(items: number[]) {
                    let total = 0;
                    for (let i = 0; i < items.length; i++) {
                        total += items[i];
                    }
                    return total;
                });
            `,
        },
        // serverMapFrom mapper with for-of loop
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', function sum(items: number[]) {
                    let total = 0;
                    for (const item of items) {
                        total += item;
                    }
                    return total;
                });
            `,
        },
        // serverMapFrom mapper with try-catch
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', function safeParse(s: string) {
                    try {
                        return JSON.parse(s);
                    } catch (e) {
                        return null;
                    }
                });
            `,
        },
        // serverMapFrom mapper returning an object literal (not shorthand for outer var)
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', (x: number) => ({ value: x, doubled: x * 2 }));
            `,
        },
        // serverMapFrom mapper as a pure named function
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', function greeting() { return 'hello'; });
            `,
        },
        // registerMionPureFn factory returning an inner fn, local scope only (isFactory: true)
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                registerMionPureFn('validate', function factory() {
                    const regexp = new RegExp('^[a-z]+$');
                    return function inner(s: string) { return regexp.test(s); };
                });
            `,
        },
        // registerMionPureFn factory with local scope only
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                registerMionPureFn('fn', function() {
                    const multiplier = 2;
                    return function inner(x: number) { return x * multiplier; };
                });
            `,
        },
        // registerMionPureFn not imported from a mion package — should be ignored
        {
            code: `
                import { registerMionPureFn } from 'other-package';
                const SECRET = 'key';
                registerMionPureFn('fn', () => SECRET);
            `,
        },
        // Function named serverMapFrom but not imported — should be ignored
        {
            code: `
                function serverMapFrom(source: any, fn: any) { return fn; }
                const SECRET = 'key';
                serverMapFrom('sourceRoute', () => SECRET);
            `,
        },
        // File without relevant imports — should be ignored
        {
            code: `
                const x = 42;
                const fn = () => x + 1;
            `,
        },
        // serverMapFrom mapper using various allowed globals
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', function validate(s: string) {
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
        // Aliased serverMapFrom import
        {
            code: `
                import { serverMapFrom as smf } from '@mionjs/client';
                smf('sourceRoute', (x: number) => x + 1);
            `,
        },
        // Variable reference: mapper defined as variable, passed by name
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const myFn = (x: number) => x + 1;
                serverMapFrom('sourceRoute', myFn);
            `,
        },
        // Variable reference: factory function passed to registerMionPureFn
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                const myFactory = function() {
                    return function inner(x: number) { return x + 1; };
                };
                registerMionPureFn('fn', myFactory);
            `,
        },
        // serverMapFrom() with pure arrow mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                serverMapFrom(sub, (x: number) => x * 2);
            `,
        },
        // serverMapFrom() with pure named function mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                serverMapFrom(sub, function extractId(item: {id: number}) { return item.id; });
            `,
        },
        // serverMapFrom() with allowed globals
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                serverMapFrom(sub, (x: any) => JSON.stringify(x));
            `,
        },
        // serverMapFrom() with local variables
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                serverMapFrom(sub, (x: number) => {
                    const doubled = x * 2;
                    return doubled;
                });
            `,
        },
        // serverMapFrom() with variable reference mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                const myMapper = (x: number) => x + 1;
                serverMapFrom(sub, myMapper);
            `,
        },
        // serverMapFrom() not imported from @mionjs/client — should be ignored
        {
            code: `
                import { serverMapFrom } from 'other-package';
                const SECRET = 'key';
                serverMapFrom({} as any, () => SECRET);
            `,
        },
    ],
    invalid: [
        // serverMapFrom mapper with 'this' keyword
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', function() { return this.x; });
            `,
            errors: [{messageId: 'purityThis', data: {fnType: 'pure functions'}}],
        },
        // serverMapFrom mapper with await
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', async (x: number) => await x);
            `,
            errors: [{messageId: 'purityAwait', data: {fnType: 'pure functions'}}],
        },
        // serverMapFrom mapper with dynamic import
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', (x: string) => import(x));
            `,
            errors: [{messageId: 'purityDynamicImport', data: {fnType: 'pure functions'}}],
        },
        // serverMapFrom mapper with eval
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', (x: string) => eval(x));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}}],
        },
        // serverMapFrom mapper with fetch
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', (url: string) => fetch(url));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'fetch', fnType: 'pure functions'}}],
        },
        // serverMapFrom mapper with setTimeout
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', () => { setTimeout(() => {}, 100); });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'setTimeout', fnType: 'pure functions'}}],
        },
        // serverMapFrom mapper with closure variable
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const SECRET = 'key';
                serverMapFrom('sourceRoute', (x: string) => x + SECRET);
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'SECRET', fnType: 'pure functions'}}],
        },
        // serverMapFrom mapper with process
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', () => process.env.KEY);
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'process', fnType: 'pure functions'}}],
        },
        // serverMapFrom mapper with window
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', () => window.location.href);
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'window', fnType: 'pure functions'}}],
        },
        // registerMionPureFn factory with eval (forbidden even for factories)
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                registerMionPureFn('fn', function() {
                    return function inner(x: string) { return eval(x); };
                });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'factory functions'}}],
        },
        // registerMionPureFn factory with Function constructor (forbidden for factories)
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                registerMionPureFn('fn', function() {
                    return new Function('return 1');
                });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'Function', fnType: 'factory functions'}}],
        },
        // registerMionPureFn factory with fetch (forbidden for factories)
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                registerMionPureFn('fn', function() {
                    return function inner() { return fetch('/api'); };
                });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'fetch', fnType: 'factory functions'}}],
        },
        // registerMionPureFn factory with this (forbidden for factories)
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                registerMionPureFn('fn', function() {
                    return this.value;
                });
            `,
            errors: [{messageId: 'purityThis', data: {fnType: 'factory functions'}}],
        },
        // registerMionPureFn factory with closure variable used in the factory body
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                const outer = 42;
                registerMionPureFn('factory', function factory() { return outer; });
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'outer', fnType: 'factory functions'}}],
        },
        // registerMionPureFn factory referencing setTimeout (forbidden for factories)
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                registerMionPureFn('factory', function factory() { return setTimeout; });
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'setTimeout', fnType: 'factory functions'}}],
        },
        // registerMionPureFn factory with closure variable used in the inner fn
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                const MAX = 100;
                registerMionPureFn('fn', function() {
                    return function inner(x: number) { return x + MAX; };
                });
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'MAX', fnType: 'factory functions'}}],
        },
        // Multiple violations reported
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom('sourceRoute', function() {
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
                import { serverMapFrom as smf } from '@mionjs/client';
                smf('sourceRoute', () => eval('x'));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}}],
        },
        // Variable reference: mapper with violation
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const SECRET = 'key';
                const myFn = (x: string) => x + SECRET;
                serverMapFrom('sourceRoute', myFn);
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'SECRET', fnType: 'pure functions'}}],
        },
        // Variable reference: factory fn with violation via registerMionPureFn
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                const myFactory = function() { return eval('x'); };
                registerMionPureFn('fn', myFactory);
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'factory functions'}}],
        },
        // serverMapFrom with imported named mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                import { myFn } from './myModule';
                serverMapFrom('sourceRoute', myFn);
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'serverMapFrom', name: 'myFn'}}],
        },
        // registerMionPureFn with imported factory
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                import { myFactory } from './myModule';
                registerMionPureFn('fn', myFactory);
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'registerMionPureFn', name: 'myFactory'}}],
        },
        // serverMapFrom with default-imported mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                import myFn from './myModule';
                serverMapFrom('sourceRoute', myFn);
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'serverMapFrom', name: 'myFn'}}],
        },
        // serverMapFrom with function parameter (dynamic value)
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                function wrap(fn: any) {
                    serverMapFrom('sourceRoute', fn);
                }
            `,
            errors: [{messageId: 'unresolvedArgument', data: {callee: 'serverMapFrom', name: 'fn'}}],
        },
        // registerMionPureFn with function parameter
        {
            code: `
                import { registerMionPureFn } from '@mionjs/run-types';
                function wrap(factory: any) {
                    registerMionPureFn('fn', factory);
                }
            `,
            errors: [{messageId: 'unresolvedArgument', data: {callee: 'registerMionPureFn', name: 'factory'}}],
        },
        // serverMapFrom with variable initialized from a function call (not resolvable to a function)
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const myFn = createFn();
                serverMapFrom('sourceRoute', myFn);
            `,
            errors: [{messageId: 'unresolvedArgument', data: {callee: 'serverMapFrom', name: 'myFn'}}],
        },
        // serverMapFrom() with closure variable in mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                const MULTIPLIER = 5;
                serverMapFrom(sub, (x: number) => x * MULTIPLIER);
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'MULTIPLIER', fnType: 'pure functions'}}],
        },
        // serverMapFrom() with forbidden identifier in mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                serverMapFrom(sub, (url: string) => fetch(url));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'fetch', fnType: 'pure functions'}}],
        },
        // serverMapFrom() with eval in mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                serverMapFrom(sub, (x: string) => eval(x));
            `,
            errors: [{messageId: 'purityForbiddenIdentifier', data: {name: 'eval', fnType: 'pure functions'}}],
        },
        // serverMapFrom() with this in mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                serverMapFrom(sub, function() { return this.value; });
            `,
            errors: [{messageId: 'purityThis', data: {fnType: 'pure functions'}}],
        },
        // serverMapFrom() with imported mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                import { myMapper } from './myModule';
                const sub = {} as any;
                serverMapFrom(sub, myMapper);
            `,
            errors: [{messageId: 'importedArgument', data: {callee: 'serverMapFrom', name: 'myMapper'}}],
        },
        // serverMapFrom() with unresolved mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                function wrap(mapper: any) {
                    serverMapFrom(sub, mapper);
                }
            `,
            errors: [{messageId: 'unresolvedArgument', data: {callee: 'serverMapFrom', name: 'mapper'}}],
        },
        // serverMapFrom() with variable reference mapper that has a violation
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const sub = {} as any;
                const SECRET = 'key';
                const myMapper = (x: string) => x + SECRET;
                serverMapFrom(sub, myMapper);
            `,
            errors: [{messageId: 'purityClosureVariable', data: {name: 'SECRET', fnType: 'pure functions'}}],
        },
    ],
});
