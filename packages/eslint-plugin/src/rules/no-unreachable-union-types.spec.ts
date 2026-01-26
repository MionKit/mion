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
        // Parameters with proper union order (route)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, data: {a: string; b: number} | {a: string}) => ({result: 'ok'}));
            `,
        },
        // Parameters with proper union order (linkedFn)
        {
            code: `
                import { linkedFn } from '@mionkit/router';
                linkedFn((ctx, data: {a: string; b: number} | {a: string}) => ({result: 'ok'}));
            `,
        },
        // Parameters with proper union order (headersLinkedFn)
        {
            code: `
                import { headersLinkedFn } from '@mionkit/router';
                headersLinkedFn((ctx, [token]: [string], data: {a: string; b: number} | {a: string}) => ({result: 'ok'}));
            `,
        },
        // Context parameter should NOT be checked (route)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
        },
        // Headers parameter should NOT be checked (headersLinkedFn)
        {
            code: `
                import { headersLinkedFn } from '@mionkit/router';
                headersLinkedFn((ctx, headers: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
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
        // Subset type before superset type in linkedFn return
        {
            code: `
                import { linkedFn } from '@mionkit/router';
                linkedFn((ctx): {name: string} | {name: string; age: number} => ({name: 'John'}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Subset type before superset type in headersLinkedFn return
        {
            code: `
                import { headersLinkedFn } from '@mionkit/router';
                headersLinkedFn((ctx, [token]: [string]): {valid: boolean} | {valid: boolean; userId: string} => ({valid: true}));
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
        // Parameter with unreachable union type (route)
        {
            code: `
                import { route } from '@mionkit/router';
                route((ctx, data: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Parameter with unreachable union type (linkedFn)
        {
            code: `
                import { linkedFn } from '@mionkit/router';
                linkedFn((ctx, data: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Parameter with unreachable union type (headersLinkedFn) - third parameter
        {
            code: `
                import { headersLinkedFn } from '@mionkit/router';
                headersLinkedFn((ctx, [token]: [string], data: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Type alias with unreachable union in return type
        {
            code: `
                import { route } from '@mionkit/router';
                type UnreachableReturn = {a: string} | {a: string; b: number};
                route((ctx): UnreachableReturn => ({a: 'hello'}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Type alias with unreachable union in parameter
        {
            code: `
                import { route } from '@mionkit/router';
                type UnreachableParam = {id: string} | {id: string; name: string};
                route((ctx, data: UnreachableParam): string => data.id);
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Type alias with optional properties blocking more specific types
        {
            code: `
                import { route } from '@mionkit/router';
                type OptionalBlocking = {a?: string} | {a: string; b: number};
                route((ctx): OptionalBlocking => ({a: 'hello', b: 1}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Type alias with mixed optional/required blocking
        {
            code: `
                import { route } from '@mionkit/router';
                type MixedBlocking = {a: string; b?: number} | {a: string; b: number};
                route((ctx): MixedBlocking => ({a: 'hello', b: 1}));
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
        // Type alias with multiple unreachable types
        {
            code: `
                import { route } from '@mionkit/router';
                type MultipleUnreachable = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
                route((ctx): MultipleUnreachable => ({a: 'hello'}));
            `,
            errors: [
                {messageId: 'unreachableUnionType'},
                {messageId: 'unreachableUnionType'},
                {messageId: 'unreachableUnionType'},
            ],
        },
        // Type alias in headersLinkedFn parameter (third parameter)
        {
            code: `
                import { headersLinkedFn } from '@mionkit/router';
                type UnreachableHeaderParam = {x: number} | {x: number; y: number};
                headersLinkedFn((ctx, [token]: [string], data: UnreachableHeaderParam): void => {
                    console.log(data.x);
                });
            `,
            errors: [{messageId: 'unreachableUnionType'}],
        },
    ],
});
