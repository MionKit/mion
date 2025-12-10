/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from 'eslint';
import rule from './no-unreachable-union-types';

const ruleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
});

ruleTester.run('no-unreachable-union-types', rule, {
    valid: [
        // Union with distinct types (no overlap)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {b: number} => ({a: 'hello'}));
            `,
        },
        // Union with types that have same number of properties
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string; b: number} | {c: string; d: number} => ({a: 'hello', b: 1}));
            `,
        },
        // Superset type comes BEFORE subset type (correct order)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string; b: number} | {a: string} => ({a: 'hello', b: 1}));
            `,
        },
        // Non-router function (should not be checked)
        {
            code: `
                const fn = (): {a: string} | {a: string; b: number} => ({a: 'hello'});
            `,
        },
        // Import from different package (should not be checked - only @mionkit/router is checked)
        {
            code: `
                import { route } from 'other-package';
                route((ctx): {a: string} | {a: string; b: number} => ({a: 'hello'}));
            `,
        },
        // Union with atomic types only
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): string | number | boolean => 'hello');
            `,
        },
        // Different properties - no blocking
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a?: string} | {b: number; c: string} => ({b: 1, c: 'hello'}));
            `,
        },
        // Handler type annotation with proper order
        {
            code: `
                import { Handler } from '@mionkit/router';
                const fn: Handler = (ctx): {a: string; b: number} | {a: string} => ({a: 'hello', b: 1});
            `,
        },
    ],
    invalid: [
        // Subset type before superset type in route return
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {a: string; b: number} => ({a: 'hello'}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Subset type before superset type in hook return
        {
            code: `
                import { hook } from '@mionkit/router';
                hook((ctx): {name: string} | {name: string; age: number} => ({name: 'John'}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Subset type before superset type in headersHook return
        {
            code: `
                import { headersHook } from '@mionkit/router';
                headersHook((ctx, [token]: [string]): {valid: boolean} | {valid: boolean; userId: string} => ({valid: true}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Multiple unreachable types - {a,b} blocked by {a}, {a,b,c} blocked by both {a} and {a,b}
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean} => ({a: 'hello'}));
            `,
            errors: [
                {messageId: 'unreachableUnionType'},
                {messageId: 'unreachableUnionType'},
                {messageId: 'unreachableUnionType'},
            ],
        },
        // Optional properties block more specific types
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a?: string} | {a: string; b: number} => ({a: 'hello', b: 1}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Optional property with required property blocks more specific type
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx): {a: string; b?: number} | {a: string; b: number} => ({a: 'hello', b: 1}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
    ],
});
