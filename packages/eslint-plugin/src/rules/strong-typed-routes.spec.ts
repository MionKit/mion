/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from 'eslint';
import rule from './strong-typed-routes.ts';

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
        // Valid linkedFn with explicit types
        {
            code: `
                import { linkedFn } from '@mionkit/router';
                linkedFn((ctx, data: number): void => { console.log(data); });
            `,
        },
        // Valid headersFn with explicit types
        {
            code: `
                import { headersFn } from '@mionkit/router';
                headersFn((ctx, [token]: [string]): boolean => true);
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
                import { linkedFn } from '@mionkit/router';
                linkedFn((ctx): void => { console.log('linkedFn'); });
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
        // rawLinkedFn should be ignored (not in the list)
        {
            code: `
                import { rawLinkedFn } from '@mionkit/router';
                rawLinkedFn((ctx, req, resp) => undefined);
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
        // Valid with headersFn function reference
        {
            code: `
                import { headersFn } from '@mionkit/router';
                const authHandler = (ctx, [token]: [string]): void => { console.log(token); };
                headersFn(authHandler);
            `,
        },
        // Valid with linkedFn function reference
        {
            code: `
                import { linkedFn } from '@mionkit/router';
                function logHandler(ctx, data: number): void { console.log(data); }
                linkedFn(logHandler);
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
                const authHandler: HeaderHandler = (ctx, [token]: [string]): void => { console.log(token); };
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
                const authHandler = ((ctx, [token]: [string]): void => { console.log(token); }) satisfies HeaderHandler;
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
        // Valid with @mion:linkedFn JSDoc tag
        {
            code: `
                /**
                 * @mion:linkedFn
                 */
                const logHandler = (ctx, data: number): void => { console.log(data); };
            `,
        },
        // Valid with @mion:headersFn JSDoc tag
        {
            code: `
                /**
                 * @mion:headersFn
                 */
                function authHandler(ctx, [token]: [string]): void {
                    console.log(token);
                }
            `,
        },
        // Valid with default boolean parameter (primitive - type can be inferred)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, enabled = true): string => enabled ? 'yes' : 'no');
            `,
        },
        // Valid with default string parameter (primitive - type can be inferred)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name = 'default'): string => \`hello \${name}\`);
            `,
        },
        // Valid with default number parameter (primitive - type can be inferred)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, count = 0): number => count + 1);
            `,
        },
        // Valid with default null parameter (primitive - type can be inferred)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, value = null): string => value ?? 'default');
            `,
        },
        // Valid with default negative number parameter
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, offset = -1): number => offset);
            `,
        },
        // Valid with default parameter and explicit type (still valid)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, enabled: boolean = true): string => enabled ? 'yes' : 'no');
            `,
        },
        // Valid headersFn with default boolean parameter
        {
            code: `
                import { headersFn } from '@mionkit/router';
                headersFn((ctx, h: {headers: {token: string}}, returnSession = false): void => { console.log(returnSession); });
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
                {messageId: 'missingReturnTypeRouter'}, // return type on function
                {messageId: 'missingParamTypesRouter'}, // param 'name'
            ],
        },
        // Missing types in linkedFn
        {
            code: `
                import { linkedFn } from '@mionkit/router';
                linkedFn((ctx, data) => { console.log(data); });
            `,
            errors: [
                {messageId: 'missingReturnTypeRouter'}, // return type on function
                {messageId: 'missingParamTypesRouter'}, // param 'data'
            ],
        },
        // Missing types in headersFn
        {
            code: `
                import { headersFn } from '@mionkit/router';
                headersFn((ctx, [token]) => true);
            `,
            errors: [
                {messageId: 'missingReturnTypeRouter'}, // return type on function
                {messageId: 'missingParamTypesRouter'}, // param '[token]'
            ],
        },
        // Function expression missing types
        {
            code: `
                import { route } from '@mionkit/router';
                route(function(ctx, name) { return \`hello \${name}\`; });
            `,
            errors: [
                {messageId: 'missingReturnTypeRouter'}, // return type on function
                {messageId: 'missingParamTypesRouter'}, // param 'name'
            ],
        },
        // Multiple parameters missing types
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name, age) => \`hello \${name}, age \${age}\`);
            `,
            errors: [
                {messageId: 'missingReturnTypeRouter'}, // return type on function
                {messageId: 'missingParamTypesRouter'}, // param 'name'
                {messageId: 'missingParamTypesRouter'}, // param 'age'
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
                {messageId: 'missingReturnTypeRouter'}, // return type on function id
                {messageId: 'missingParamTypesRouter'}, // param 'name'
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
                {messageId: 'missingReturnTypeRouter'}, // return type on function
                {messageId: 'missingParamTypesRouter'}, // param 'name'
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
        // headersFn function reference missing types
        {
            code: `
                import { headersFn } from '@mionkit/router';
                const authHandler = (ctx, [token]) => { console.log(token); };
                headersFn(authHandler);
            `,
            errors: [
                {messageId: 'missingReturnTypeRouter'}, // return type on function
                {messageId: 'missingParamTypesRouter'}, // param '[token]'
            ],
        },
        // Handler type annotation missing types
        {
            code: `
                import { Handler } from '@mionkit/router';
                const sayHello: Handler = (ctx, name) => \`hello \${name}\`;
            `,
            errors: [
                {messageId: 'missingReturnType'}, // return type on function
                {messageId: 'missingParamTypes'}, // param 'name'
            ],
        },
        // HeaderHandler type annotation missing return type
        {
            code: `
                import { HeaderHandler } from '@mionkit/router';
                const authHandler: HeaderHandler = (ctx, [token]: [string]) => { console.log(token); };
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
                const authHandler = ((ctx, [token]) => { console.log(token); }) satisfies HeaderHandler;
            `,
            errors: [
                {messageId: 'missingReturnType'}, // return type on function
                {messageId: 'missingParamTypes'}, // param '[token]'
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
                {messageId: 'missingReturnType'}, // return type on function id
                {messageId: 'missingParamTypes'}, // param 'name'
            ],
        },
        // @mion:linkedFn JSDoc tag missing return type
        {
            code: `
                /**
                 * @mion:linkedFn
                 */
                const logHandler = (ctx, data: number) => { console.log(data); };
            `,
            errors: [
                {
                    messageId: 'missingReturnType',
                },
            ],
        },
        // @mion:headersFn JSDoc tag missing parameter type
        {
            code: `
                /**
                 * @mion:headersFn
                 */
                function authHandler(ctx, [token]): void {
                    console.log(token);
                }
            `,
            errors: [
                {
                    messageId: 'missingParamTypes',
                },
            ],
        },
        // Default parameter with non-primitive value (object) requires explicit type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, options = {}): string => 'result');
            `,
            errors: [
                {
                    messageId: 'missingParamTypesRouter',
                },
            ],
        },
        // Default parameter with non-primitive value (array) requires explicit type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, items = []): string => 'result');
            `,
            errors: [
                {
                    messageId: 'missingParamTypesRouter',
                },
            ],
        },
        // Default parameter with non-primitive value (function call) requires explicit type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, date = new Date()): string => 'result');
            `,
            errors: [
                {
                    messageId: 'missingParamTypesRouter',
                },
            ],
        },
        // Default parameter with non-primitive value (identifier/variable) requires explicit type
        {
            code: `
                import { route } from '@mionkit/router';
                const defaultValue = {foo: 'bar'};
                route((ctx, options = defaultValue): string => 'result');
            `,
            errors: [
                {
                    messageId: 'missingParamTypesRouter',
                },
            ],
        },
        // Mix of valid primitive default and invalid non-primitive default
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, enabled = true, options = {}): string => 'result');
            `,
            errors: [
                {
                    messageId: 'missingParamTypesRouter',
                },
            ],
        },
    ],
});
