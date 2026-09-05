/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './no-mixed-union-properties.ts';

const ruleTester = new RuleTester();

ruleTester.run('no-mixed-union-properties', rule, {
  valid: [
    // A same-named method on something that is not a router: the handler is not its first argument
    {
      code: `
                import { app } from './app.ts';
                app.route('/x', (): {a: string} | {b: number} => ({a: 'hello', b: 123}));
            `,
    },
    // Return object matching single union type
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {b: number} => ({a: 'hello'}));
            `,
    },
    // Return object matching single union type (second type)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {b: number} => ({b: 123}));
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
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): string | number | boolean => 'hello');
            `,
    },
    // Object with shared properties only (no unique properties from multiple types)
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string; b: number} | {a: string; c: boolean} => ({a: 'hello'}));
            `,
    },
    // Block statement with single-type returns
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {b: number} => {
                    if (Math.random() > 0.5) {
                        return {a: 'hello'};
                    }
                    return {b: 123};
                });
            `,
    },
  ],
  invalid: [
    // The router imported from the app's own module, a mutation route
    {
      code: `
                import { mion } from './mion.ts';
                mion.mutation((ctx): {a: string} | {b: number} => ({a: 'hello', b: 123}));
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
    // A helper destructured from the router object
    {
      code: `
                import { createMionRouter } from '@mionjs/router';
                const mion = createMionRouter();
                const {route} = mion;
                route((ctx): {a: string} | {b: number} => ({a: 'hello', b: 123}));
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
    // Return object with properties from multiple union types
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {b: number} => ({a: 'hello', b: 123}));
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
    // MiddleFn with mixed properties
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.middleFn((ctx): {name: string} | {age: number} => ({name: 'John', age: 25}));
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
    // headersFn with mixed properties
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.headersFn((ctx, [t]: [string]): {valid: boolean} | {userId: string} => ({valid: true, userId: '123'}));
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
    // Block statement with mixed return
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {b: number} => {
                    return {a: 'hello', b: 123};
                });
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
    // Multiple mixed returns in block statement
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                mion.route((ctx): {a: string} | {b: number} => {
                    if (Math.random() > 0.5) {
                        return {a: 'hello', b: 123};
                    }
                    return {a: 'world', b: 456};
                });
            `,
      errors: [{messageId: 'mixedUnionProperties'}, {messageId: 'mixedUnionProperties'}],
    },
    // Type alias with mixed properties in return
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type MixedResult = {success: true; data: string} | {success: false; error: string};
                mion.route((ctx): MixedResult => ({success: true, data: 'ok', error: 'also has error'}));
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
    // Type alias with unique properties from different union types
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type UserOrProduct = {userId: string; userName: string} | {productId: string; productName: string};
                mion.route((ctx): UserOrProduct => ({userId: '1', productId: '2'}));
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
    // Type alias with multiple mixed returns in conditional
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type Status = {active: boolean; lastSeen: Date} | {active: boolean; reason: string};
                mion.route((ctx): Status => {
                    if (Math.random() > 0.5) {
                        return {active: true, lastSeen: new Date(), reason: 'mixed'};
                    }
                    return {active: false, lastSeen: new Date(), reason: 'also mixed'};
                });
            `,
      errors: [{messageId: 'mixedUnionProperties'}, {messageId: 'mixedUnionProperties'}],
    },
    // Type alias with middleFn and mixed properties
    {
      code: `
                import { createMionRouter } from '@mionjs/router';

                const mion = createMionRouter();
                type MiddleFnData = {name: string} | {age: number};
                mion.middleFn((ctx): MiddleFnData => ({name: 'John', age: 25}));
            `,
      errors: [{messageId: 'mixedUnionProperties'}],
    },
  ],
});
