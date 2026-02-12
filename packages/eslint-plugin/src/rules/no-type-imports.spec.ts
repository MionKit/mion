/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from 'eslint';
import rule from './no-type-imports.ts';

const ruleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
});

ruleTester.run('no-type-imports', rule, {
    valid: [
        // Valid: regular import used in route return type
        {
            code: `
                import { User } from './types';
                import { route } from '@mionkit/router';
                route((ctx, id: number): User => ({ id, name: 'John' }));
            `,
        },
        // Valid: regular import used in route parameter
        {
            code: `
                import { UserInput } from './types';
                import { route } from '@mionkit/router';
                route((ctx, user: UserInput): string => user.name);
            `,
        },
        // Valid: regular import used in linkedFn
        {
            code: `
                import { LogData } from './types';
                import { linkedFn } from '@mionkit/router';
                linkedFn((ctx, data: LogData): void => { console.log(data); });
            `,
        },
        // Valid: type-only import NOT used in route/linkedFn (should be ignored)
        {
            code: `
                import type { InternalType } from './types';
                import { route } from '@mionkit/router';
                route((ctx, name: string): string => name);
            `,
        },
        // Valid: inline type definition (no import)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, user: { id: number; name: string }): string => user.name);
            `,
        },
        // Valid: primitive types (no import needed)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, name: string, age: number): boolean => age > 18);
            `,
        },
        // Valid: functions from different packages should be ignored
        {
            code: `
                import type { User } from './types';
                import { route } from 'some-other-package';
                route((ctx, id: number): User => ({ id, name: 'John' }));
            `,
        },
        // Valid: regular import with multiple types
        {
            code: `
                import { User, Product } from './types';
                import { route } from '@mionkit/router';
                route((ctx, user: User, product: Product): string => user.name + product.name);
            `,
        },
        // Valid: mixed import (type-only for internal, regular for route types)
        {
            code: `
                import type { InternalType } from './internal';
                import { User } from './types';
                import { route } from '@mionkit/router';
                route((ctx, user: User): string => user.name);
            `,
        },
    ],
    invalid: [
        // Invalid: type-only import used in route return type
        {
            code: `
                import type { User } from './types';
                import { route } from '@mionkit/router';
                route((ctx, id: number): User => ({ id, name: 'John' }));
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
        // Invalid: type-only import used in route parameter
        {
            code: `
                import type { UserInput } from './types';
                import { route } from '@mionkit/router';
                route((ctx, user: UserInput): string => user.name);
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'UserInput'}}],
        },
        // Invalid: type-only import used in linkedFn
        {
            code: `
                import type { LogData } from './types';
                import { linkedFn } from '@mionkit/router';
                linkedFn((ctx, data: LogData): void => { console.log(data); });
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'LogData'}}],
        },
        // Invalid: type-only import used in headersFn
        {
            code: `
                import type { AuthData } from './types';
                import { headersFn } from '@mionkit/router';
                headersFn((ctx, headers: { auth: string }, data: AuthData): void => { console.log(data); });
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'AuthData'}}],
        },
        // Invalid: inline type-only specifier (import { type X } from '...')
        {
            code: `
                import { type User } from './types';
                import { route } from '@mionkit/router';
                route((ctx, id: number): User => ({ id, name: 'John' }));
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
        // Invalid: type-only import used in both param and return
        {
            code: `
                import type { User } from './types';
                import { route } from '@mionkit/router';
                route((ctx, user: User): User => user);
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
        // Invalid: type-only import used in array type
        {
            code: `
                import type { User } from './types';
                import { route } from '@mionkit/router';
                route((ctx): User[] => []);
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
        // Invalid: type-only import used in union type
        {
            code: `
                import type { User } from './types';
                import { route } from '@mionkit/router';
                route((ctx): User | null => null);
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
        // Invalid: type-only import used in generic type
        {
            code: `
                import type { User } from './types';
                import { route } from '@mionkit/router';
                route((ctx): Promise<User> => Promise.resolve({ id: 1, name: 'John' }));
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
        // Invalid: multiple type-only imports used
        {
            code: `
                import type { User, Product } from './types';
                import { route } from '@mionkit/router';
                route((ctx, user: User): Product => ({ id: 1, name: 'Product' }));
            `,
            errors: [
                {messageId: 'noTypeImports', data: {typeName: 'User'}},
                {messageId: 'noTypeImports', data: {typeName: 'Product'}},
            ],
        },
        // Invalid: type-only import with Handler type annotation
        {
            code: `
                import type { User } from './types';
                import { Handler } from '@mionkit/router';
                const getUser: Handler = (ctx, id: number): User => ({ id, name: 'John' });
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
        // Invalid: type-only import with satisfies expression
        {
            code: `
                import type { User } from './types';
                import { Handler } from '@mionkit/router';
                const getUser = ((ctx, id: number): User => ({ id, name: 'John' })) satisfies Handler;
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
        // Invalid: type-only import with JSDoc tag
        {
            code: `
                import type { User } from './types';
                import { route } from '@mionkit/router';
                /**
                 * @mion:route
                 */
                function getUser(ctx, id: number): User {
                    return { id, name: 'John' };
                }
            `,
            errors: [{messageId: 'noTypeImports', data: {typeName: 'User'}}],
        },
    ],
});
