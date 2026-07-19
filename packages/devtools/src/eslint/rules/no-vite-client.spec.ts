/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './no-vite-client.ts';

const ruleTester = new RuleTester();

ruleTester.run('no-vite-client', rule, {
    valid: [
        // pureServerFn with name
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: number) => x + 1, 'addOne');
            `,
        },
        // serverMapFrom name lane: the 2nd arg references a server-registered pure fn
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom(sub, 'extractId');
            `,
        },
        // pureServerFn with PureFnDef object + name
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn({ pureFn: (x: number) => x + 1 }, 'addOne');
            `,
        },
        // Not imported from mion packages - should be ignored
        {
            code: `
                import { pureServerFn } from 'other-package';
                pureServerFn((x: number) => x + 1);
            `,
        },
        // registerPureFnFactory from non-mion package - should be ignored
        {
            code: `
                import { registerPureFnFactory } from 'other-package';
                registerPureFnFactory('ns', 'id', (jitUtils: any) => (v: any) => v);
            `,
        },
        // Aliased import with name provided
        {
            code: `
                import { pureServerFn as psf } from '@mionjs/core';
                psf((x: number) => x + 1, 'addOne');
            `,
        },
    ],
    invalid: [
        // pureServerFn without name
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: number) => x + 1);
            `,
            errors: [{messageId: 'missingPureFnName'}],
        },
        // serverMapFrom with an INLINE mapper — needs the vite build-time transport
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom(sub, (x: any) => x.id);
            `,
            errors: [{messageId: 'missingMapFromName'}],
        },
        // pureServerFn with non-string-literal name
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                const name = 'addOne';
                pureServerFn((x: number) => x + 1, name);
            `,
            errors: [{messageId: 'nameNotStringLiteral'}],
        },
        // serverMapFrom with non-string-literal name
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const name = 'extractId';
                serverMapFrom(sub, name);
            `,
            errors: [{messageId: 'nameNotStringLiteral'}],
        },
        // Aliased import without name
        {
            code: `
                import { pureServerFn as psf } from '@mionjs/core';
                psf((x: number) => x + 1);
            `,
            errors: [{messageId: 'missingPureFnName'}],
        },
        // pureServerFn with numeric literal (not string)
        {
            code: `
                import { pureServerFn } from '@mionjs/core';
                pureServerFn((x: number) => x + 1, 42);
            `,
            errors: [{messageId: 'nameNotStringLiteral'}],
        },
        // registerPureFnFactory from @mionjs/core is not allowed
        {
            code: `
                import { registerPureFnFactory } from '@mionjs/core';
                registerPureFnFactory('ns', 'id', (jitUtils: any) => (v: any) => v);
            `,
            errors: [{messageId: 'registerPureFnFactoryNotAllowed'}],
        },
        // registerPureFnFactory aliased is also not allowed
        {
            code: `
                import { registerPureFnFactory as rpf } from '@mionjs/core';
                rpf('ns', 'id', (jitUtils: any) => (v: any) => v);
            `,
            errors: [{messageId: 'registerPureFnFactoryNotAllowed'}],
        },
    ],
});
