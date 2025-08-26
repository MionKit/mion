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
        // Valid with Handler type annotation
        {
            code: `
                import { Handler } from '@mionkit/router';
                const sayHello: Handler = (ctx, name: string): string => \`hello \${name}\`;
            `,
        },
        // Valid with HeaderHandler type annotation
        {
            code: `
                import { HeaderHandler } from '@mionkit/router';
                const authHandler: HeaderHandler = (ctx, token: string): void => { console.log(token); };
            `,
        },
        // Valid with Handler satisfies expression
        {
            code: `
                import { Handler } from '@mionkit/router';
                const sayHello = ((ctx, name: string): string => \`hello \${name}\`) satisfies Handler;
            `,
        },
        // Valid with HeaderHandler satisfies expression
        {
            code: `
                import { HeaderHandler } from '@mionkit/router';
                const authHandler = ((ctx, token: string): void => { console.log(token); }) satisfies HeaderHandler;
            `,
        },
        // Valid with @mion:route JSDoc tag
        {
            code: `
                /**
                 * @mion:route
                 */
                function sayHello(ctx, name: string): string {
                    return \`hello \${name}\`;
                }
            `,
        },
        // Valid with @mion:hook JSDoc tag
        {
            code: `
                /**
                 * @mion:hook
                 */
                const logHandler = (ctx, data: number): void => { console.log(data); };
            `,
        },
        // Valid with @mion:headersHook JSDoc tag
        {
            code: `
                /**
                 * @mion:headersHook
                 */
                function authHandler(ctx, token: string): void {
                    console.log(token);
                }
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
                    messageId: 'missingReturnTypeRouter',
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
                    messageId: 'missingParamTypesRouter',
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
                    messageId: 'missingBothTypesRouter',
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
                    messageId: 'missingBothTypesRouter',
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
                    messageId: 'missingBothTypesRouter',
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
                    messageId: 'missingBothTypesRouter',
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
                    messageId: 'missingBothTypesRouter',
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
                    messageId: 'missingParamTypesRouter',
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
                    messageId: 'missingParamTypesRouter',
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
                    messageId: 'missingBothTypesRouter',
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
                    messageId: 'missingBothTypesRouter',
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
                    messageId: 'missingReturnTypeRouter',
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
                    messageId: 'missingParamTypesRouter',
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
                    messageId: 'missingBothTypesRouter',
                },
            ],
        },
        // Handler type annotation missing types
        {
            code: `
                import { Handler } from '@mionkit/router';
                const sayHello: Handler = (ctx, name) => \`hello \${name}\`;
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // HeaderHandler type annotation missing return type
        {
            code: `
                import { HeaderHandler } from '@mionkit/router';
                const authHandler: HeaderHandler = (ctx, token: string) => { console.log(token); };
            `,
            errors: [
                {
                    messageId: 'missingReturnType',
                },
            ],
        },
        // Handler satisfies expression missing parameter type
        {
            code: `
                import { Handler } from '@mionkit/router';
                const sayHello = ((ctx, name): string => \`hello \${name}\`) satisfies Handler;
            `,
            errors: [
                {
                    messageId: 'missingParamTypes',
                },
            ],
        },
        // HeaderHandler satisfies expression missing both types
        {
            code: `
                import { HeaderHandler } from '@mionkit/router';
                const authHandler = ((ctx, token) => { console.log(token); }) satisfies HeaderHandler;
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // @mion:route JSDoc tag missing types
        {
            code: `
                /**
                 * @mion:route
                 */
                function sayHello(ctx, name) {
                    return \`hello \${name}\`;
                }
            `,
            errors: [
                {
                    messageId: 'missingBothTypes',
                },
            ],
        },
        // @mion:hook JSDoc tag missing return type
        {
            code: `
                /**
                 * @mion:hook
                 */
                const logHandler = (ctx, data: number) => { console.log(data); };
            `,
            errors: [
                {
                    messageId: 'missingReturnType',
                },
            ],
        },
        // @mion:headersHook JSDoc tag missing parameter type
        {
            code: `
                /**
                 * @mion:headersHook
                 */
                function authHandler(ctx, token): void {
                    console.log(token);
                }
            `,
            errors: [
                {
                    messageId: 'missingParamTypes',
                },
            ],
        },
    ],
});
