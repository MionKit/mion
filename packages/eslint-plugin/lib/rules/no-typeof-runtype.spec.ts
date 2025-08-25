/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from 'eslint';
import rule from './no-typeof-runtype';

const ruleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
});

ruleTester.run('no-typeof-runtype', rule, {
    valid: [
        // Valid usage with explicit types
        {
            code: `
                import { runType } from '@mionkit/run-types';
                type User = { name: string; age: number };
                const rtUser = runType<User>();
            `,
        },
        {
            code: `
                import { runType } from '@mionkit/run-types';
                const rtString = runType<string>();
            `,
        },
        {
            code: `
                import { runType } from '@mionkit/run-types';
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
                import { runType } from '@mionkit/run-types';
                const user = { name: 'John', age: 34 };
                const otherFunction = <T>() => {};
                const result = otherFunction<typeof user>();
            `,
        },
        // No import from @mionkit/run-types
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
                import { runType } from '../../lib/runType';
                type User = { name: string; age: number };
                const rtUser = runType<User>();
            `,
        },
    ],
    invalid: [
        // Invalid usage with typeof
        {
            code: `
                import { runType } from '@mionkit/run-types';
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
                import { runType } from '@mionkit/run-types';
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
                import { runType } from '@mionkit/run-types';
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
                import { runType } from '@mionkit/run-types';
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
                import { runType } from '@mionkit/run-types';
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
                import { runType } from '../../lib/runType';
                const user = { name: 'John', age: 34 };
                const rtUser = runType<typeof user>();
            `,
            errors: [
                {
                    messageId: 'noTypeof',
                },
            ],
        },
    ],
});
