/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './no-typeof-runtype.ts';

const ruleTester = new RuleTester();

ruleTester.run('no-typeof-runtype', rule, {
    valid: [
        // Valid usage with explicit types
        {
            code: `
                import { runType } from '@mionjs/run-types';
                type User = { name: string; age: number };
                const rtUser = runType<User>();
            `,
        },
        {
            code: `
                import { runType } from '@mionjs/run-types';
                const rtString = runType<string>();
            `,
        },
        {
            code: `
                import { runType } from '@mionjs/run-types';
                const rtNumber = runType<number>();
            `,
        },
        // runType from different package should be allowed
        {
            code: `
                import { runType } from 'some-other-package';
                const user = { name: 'John', age: 34 };
                const rtUser = runType<typeof user>();
            `,
        },
        // Different function name should be allowed
        {
            code: `
                import { runType } from '@mionjs/run-types';
                const user = { name: 'John', age: 34 };
                const otherFunction = <T>() => {};
                const result = otherFunction<typeof user>();
            `,
        },
        // No import from @mionjs/run-types
        {
            code: `
                const runType = <T>() => {};
                const user = { name: 'John', age: 34 };
                const rtUser = runType<typeof user>();
            `,
        },
        // Valid usage with relative import
        {
            code: `
                import { runType } from '../../src/runType';
                type User = { name: string; age: number };
                const rtUser = runType<User>();
            `,
        },
        // Valid usage with other run-type functions
        {
            code: `
                import { isTypeFn, typeErrorsFn } from '@mionjs/run-types';
                type User = { name: string; age: number };
                const isUserType = isTypeFn<User>();
                const getUserErrors = typeErrorsFn<User>();
            `,
        },
    ],
    invalid: [
        // Invalid usage with typeof
        {
            code: `
                import { runType } from '@mionjs/run-types';
                const user = { name: 'John', age: 34 };
                const rtUser = runType<typeof user>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
        {
            code: `
                import { runType } from '@mionjs/run-types';
                const reg = /abc/i;
                const rtReg = runType<typeof reg>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
        {
            code: `
                import { runType } from '@mionjs/run-types';
                const sym = Symbol('hello');
                const rtSym = runType<typeof sym>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
        // Multiple typeof usages
        {
            code: `
                import { runType } from '@mionjs/run-types';
                const user = { name: 'John', age: 34 };
                const reg = /abc/i;
                const rtUser = runType<typeof user>();
                const rtReg = runType<typeof reg>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
                {
                    messageId: 'noTypeof',
                },
            ],
        },
        // typeof in union types
        {
            code: `
                import { runType } from '@mionjs/run-types';
                const user = { name: 'John', age: 34 };
                const rtUnion = runType<string | typeof user>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
        // Invalid usage with relative import
        {
            code: `
                import { runType } from '../../src/runType';
                const user = { name: 'John', age: 34 };
                const rtUser = runType<typeof user>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
        // Invalid usage with isTypeFn
        {
            code: `
                import { isTypeFn } from '@mionjs/run-types';
                const user = { name: 'John', age: 34 };
                const isUserType = isTypeFn<typeof user>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
        // Invalid usage with typeErrorsFn
        {
            code: `
                import { typeErrorsFn } from '@mionjs/run-types';
                const user = { name: 'John', age: 34 };
                const getUserErrors = typeErrorsFn<typeof user>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
        // Invalid usage with mockTypeFn
        {
            code: `
                import { mockTypeFn } from '@mionjs/run-types';
                const user = { name: 'John', age: 34 };
                const mockUser = mockTypeFn<typeof user>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
    ],
});
