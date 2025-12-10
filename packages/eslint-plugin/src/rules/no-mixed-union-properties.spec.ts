/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from 'eslint';
import rule from './no-mixed-union-properties';

const ruleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
});

ruleTester.run('no-mixed-union-properties', rule, {
    valid: [
        // Return object matching single union type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {b: number} => ({a: 'hello'}));
            `,
        },
        // Return object matching single union type (second type)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {b: number} => ({b: 123}));
            `,
        },
        // Non-router function (should not be checked)
        {
            code: `
                const fn = (): {a: string} | {b: number} => ({a: 'hello', b: 123});
            `,
        },
        // Import from different package (should not be checked)
        {
            code: `
                import { route } from 'other-package';
                route((ctx): {a: string} | {b: number} => ({a: 'hello', b: 123}));
            `,
        },
        // Union with atomic types only
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): string | number | boolean => 'hello');
            `,
        },
        // Object with shared properties only (no unique properties from multiple types)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string; b: number} | {a: string; c: boolean} => ({a: 'hello'}));
            `,
        },
        // Block statement with single-type returns
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {b: number} => {
                    if (Math.random() > 0.5) {
                        return {a: 'hello'};
                    }
                    return {b: 123};
                });
            `,
        },
    ],
    invalid: [
        // Return object with properties from multiple union types
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {b: number} => ({a: 'hello', b: 123}));
            `,
            errors: [{messageId: 'mixedUnionProperties'}],
        },
        // Hook with mixed properties
        {
            code: `
                import { hook } from '@mionkit/router';
                hook((ctx): {name: string} | {age: number} => ({name: 'John', age: 25}));
            `,
            errors: [{messageId: 'mixedUnionProperties'}],
        },
        // headersHook with mixed properties
        {
            code: `
                import { headersHook } from '@mionkit/router';
                headersHook((ctx, [t]: [string]): {valid: boolean} | {userId: string} => ({valid: true, userId: '123'}));
            `,
            errors: [{messageId: 'mixedUnionProperties'}],
        },
        // Block statement with mixed return
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {b: number} => {
                    return {a: 'hello', b: 123};
                });
            `,
            errors: [{messageId: 'mixedUnionProperties'}],
        },
        // Multiple mixed returns in block statement
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {b: number} => {
                    if (Math.random() > 0.5) {
                        return {a: 'hello', b: 123};
                    }
                    return {a: 'world', b: 456};
                });
            `,
            errors: [{messageId: 'mixedUnionProperties'}, {messageId: 'mixedUnionProperties'}],
        },
    ],
});
