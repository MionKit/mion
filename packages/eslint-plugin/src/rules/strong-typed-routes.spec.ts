/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from 'eslint';
import rule from './strong-typed-routes';

const ruleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
});

ruleTester.run('strong-typed-routes', rule, {
    valid: [
        // Valid route with explicit types
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name: string): string => \`hello \${name}\`);
            `,
        },
        // Valid hook with explicit types
        {
            code: `
                import { hook } from '@mionkit/router';
                hook((ctx, data: number): void => { console.log(data); });
            `,
        },
        // Valid headersHook with explicit types
        {
            code: `
                import { headersHook } from '@mionkit/router';
                headersHook(['auth'], (ctx, headers: string): boolean => true);
            `,
        },
        // Valid function expression
        {
            code: `
                import { route } from '@mionkit/router';
                route(function(ctx, name: string): string { return \`hello \${name}\`; });
            `,
        },
        // Valid with multiple parameters
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name: string, age: number): string => \`hello \${name}, age \${age}\`);
            `,
        },
        // Valid with only context parameter (no other params to check)
        {
            code: `
                import { hook } from '@mionkit/router';
                hook((ctx): void => { console.log('hook'); });
            `,
        },
        // Functions from different packages should be ignored
        {
            code: `
                import { route } from 'some-other-package';
                route((ctx, name) => \`hello \${name}\`);
            `,
        },
        // Different function names should be ignored
        {
            code: `
                import { route } from '@mionkit/router';
                const otherFunction = (ctx, name) => \`hello \${name}\`;
                otherFunction(null, 'test');
            `,
        },
        // rawHook should be ignored (not in the list)
        {
            code: `
                import { rawHook } from '@mionkit/router';
                rawHook((ctx, req, resp) => undefined);
            `,
        },
        // Valid with rest parameters
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, ...args: string[]): void => { console.log(args); });
            `,
        },
        // Valid with function declaration reference
        {
            code: `
                import { route } from '@mionkit/router';
                function sayHello(ctx, name: string): string { return \`hello \${name}\`; }
                route(sayHello);
            `,
        },
        // Valid with arrow function variable reference
        {
            code: `
                import { route } from '@mionkit/router';
                const sayHello = (ctx, name: string): string => \`hello \${name}\`;
                route(sayHello);
            `,
        },
        // Valid with function expression variable reference
        {
            code: `
                import { route } from '@mionkit/router';
                const sayHello = function(ctx, name: string): string { return \`hello \${name}\`; };
                route(sayHello);
            `,
        },
        // Valid with headersHook function reference
        {
            code: `
                import { headersHook } from '@mionkit/router';
                const authHandler = (ctx, token: string): void => { console.log(token); };
                headersHook(['auth'], authHandler);
            `,
        },
        // Valid with hook function reference
        {
            code: `
                import { hook } from '@mionkit/router';
                function logHandler(ctx, data: number): void { console.log(data); }
                hook(logHandler);
            `,
        },
    ],
    invalid: [
        // Missing return type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name: string) => \`hello \${name}\`);
            `,
            errors: [
                {
                    messageId: 'missingReturnType',
                },
            ],
        },
        // Missing parameter type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name): string => \`hello \${name}\`);
            `,
            errors: [
                {
                    messageId: 'missingParamTypes',
                },
            ],
        },
        // Missing both return type and parameter type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name) => \`hello \${name}\`);
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // Missing types in hook
        {
            code: `
                import { hook } from '@mionkit/router';
                hook((ctx, data) => { console.log(data); });
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // Missing types in headersHook
        {
            code: `
                import { headersHook } from '@mionkit/router';
                headersHook(['auth'], (ctx, headers) => true);
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // Function expression missing types
        {
            code: `
                import { route } from '@mionkit/router';
                route(function(ctx, name) { return \`hello \${name}\`; });
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // Multiple parameters missing types
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name, age) => \`hello \${name}, age \${age}\`);
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // Some parameters missing types
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name: string, age): string => \`hello \${name}, age \${age}\`);
            `,
            errors: [
                {
                    messageId: 'missingParamTypes',
                },
            ],
        },
        // Rest parameter missing type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, ...args): void => { console.log(args); });
            `,
            errors: [
                {
                    messageId: 'missingParamTypes',
                },
            ],
        },
        // Function declaration reference missing types
        {
            code: `
                import { route } from '@mionkit/router';
                function sayHello(ctx, name) { return \`hello \${name}\`; }
                route(sayHello);
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // Arrow function variable reference missing types
        {
            code: `
                import { route } from '@mionkit/router';
                const sayHello = (ctx, name) => \`hello \${name}\`;
                route(sayHello);
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // Function expression variable reference missing return type
        {
            code: `
                import { route } from '@mionkit/router';
                const sayHello = function(ctx, name: string) { return \`hello \${name}\`; };
                route(sayHello);
            `,
            errors: [
                {
                    messageId: 'missingReturnType',
                },
            ],
        },
        // Function declaration reference missing parameter type
        {
            code: `
                import { route } from '@mionkit/router';
                function sayHello(ctx, name): string { return \`hello \${name}\`; }
                route(sayHello);
            `,
            errors: [
                {
                    messageId: 'missingParamTypes',
                },
            ],
        },
        // headersHook function reference missing types
        {
            code: `
                import { headersHook } from '@mionkit/router';
                const authHandler = (ctx, token) => { console.log(token); };
                headersHook(['auth'], authHandler);
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
    ],
});
