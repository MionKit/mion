/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './no-unreachable-union-types.ts';

const ruleTester = new RuleTester();

ruleTester.run('no-unreachable-union-types', rule, {
  valid: [
    // A same-named method on something that is not a router: the handler is not its first argument
    {
      code: `
                import { app } from './app.ts';
                app.route('/x', (req: {a: string} | {a: string; b: number}) => req);
            `,
    },
    // Union with distinct types (no overlap)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {b: number} => ({a: 'hello'}));
            `,
    },
    // Union with types that have same number of properties
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string; b: number} | {c: string; d: number} => ({a: 'hello', b: 1}));
            `,
    },
    // Superset type comes BEFORE subset type (correct order)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string; b: number} | {a: string} => ({a: 'hello', b: 1}));
            `,
    },
    // Non-router function (should not be checked)
    {
      code: `
                const fn = (): {a: string} | {a: string; b: number} => ({a: 'hello'});
            `,
    },
    // Import from different package (should not be checked - only @mionjs/router is checked)
    {
      code: `
                import { route } from 'other-package';
                route((ctx): {a: string} | {a: string; b: number} => ({a: 'hello'}));
            `,
    },
    // Union with atomic types only
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): string | number | boolean => 'hello');
            `,
    },
    // Different properties - no blocking
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a?: string} | {b: number; c: string} => ({b: 1, c: 'hello'}));
            `,
    },
    // Handler type annotation with proper order
    {
      code: `
                import { Handler } from '@mionjs/router';
                const fn: Handler = (ctx): {a: string; b: number} | {a: string} => ({a: 'hello', b: 1});
            `,
    },
    // Parameters with proper union order (route)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx, data: {a: string; b: number} | {a: string}) => ({result: 'ok'}));
            `,
    },
    // Parameters with proper union order (middleFn)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.middleFn((ctx, data: {a: string; b: number} | {a: string}) => ({result: 'ok'}));
            `,
    },
    // Parameters with proper union order (headersFn)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.headersFn((ctx, [token]: [string], data: {a: string; b: number} | {a: string}) => ({result: 'ok'}));
            `,
    },
    // Context parameter should NOT be checked (route)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
    },
    // Headers parameter should NOT be checked (headersFn)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.headersFn((ctx, headers: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
    },
  ],
  invalid: [
    // The router imported from the app's own module, a query route
    {
      code: `
                import { mion } from './mion.ts';
                mion.query((ctx): {a: string} | {a: string; b: number} => ({a: 'hello'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // A helper destructured from the factory call
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const {route} = createMionRouter();
                route((ctx): {a: string} | {a: string; b: number} => ({a: 'hello'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Subset type before superset type in route return
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {a: string; b: number} => ({a: 'hello'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Subset type before superset type in middleFn return
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.middleFn((ctx): {name: string} | {name: string; age: number} => ({name: 'John'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Subset type before superset type in headersFn return
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.headersFn((ctx, [token]: [string]): {valid: boolean} | {valid: boolean; userId: string} => ({valid: true}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Multiple unreachable types - {a,b} blocked by {a}, {a,b,c} blocked by both {a} and {a,b}
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean} => ({a: 'hello'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}, {messageId: 'unreachableUnionType'}, {messageId: 'unreachableUnionType'}],
    },
    // Optional properties block more specific types
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a?: string} | {a: string; b: number} => ({a: 'hello', b: 1}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Optional property with required property blocks more specific type
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string; b?: number} | {a: string; b: number} => ({a: 'hello', b: 1}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Parameter with unreachable union type (route)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx, data: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Parameter with unreachable union type (middleFn)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.middleFn((ctx, data: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Parameter with unreachable union type (headersFn) - third parameter
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.headersFn((ctx, [token]: [string], data: {a: string} | {a: string; b: number}) => ({result: 'ok'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Type alias with unreachable union in return type
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type UnreachableReturn = {a: string} | {a: string; b: number};
                mion.route((ctx): UnreachableReturn => ({a: 'hello'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Type alias with unreachable union in parameter
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type UnreachableParam = {id: string} | {id: string; name: string};
                mion.route((ctx, data: UnreachableParam): string => data.id);
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Type alias with optional properties blocking more specific types
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type OptionalBlocking = {a?: string} | {a: string; b: number};
                mion.route((ctx): OptionalBlocking => ({a: 'hello', b: 1}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Type alias with mixed optional/required blocking
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type MixedBlocking = {a: string; b?: number} | {a: string; b: number};
                mion.route((ctx): MixedBlocking => ({a: 'hello', b: 1}));
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
    // Type alias with multiple unreachable types
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type MultipleUnreachable = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
                mion.route((ctx): MultipleUnreachable => ({a: 'hello'}));
            `,
      errors: [{messageId: 'unreachableUnionType'}, {messageId: 'unreachableUnionType'}, {messageId: 'unreachableUnionType'}],
    },
    // Type alias in headersFn parameter (third parameter)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type UnreachableHeaderParam = {x: number} | {x: number; y: number};
                mion.headersFn((ctx, [token]: [string], data: UnreachableHeaderParam): void => {
                    console.log(data.x);
                });
            `,
      errors: [{messageId: 'unreachableUnionType'}],
    },
  ],
});
