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
        // serverMapFrom name lane: the 2nd arg references a server-registered pure fn by name
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom(sub, 'extractId');
            `,
        },
        // Aliased serverMapFrom import with a string-literal name
        {
            code: `
                import { serverMapFrom as smf } from '@mionjs/client';
                smf(sub, 'extractId');
            `,
        },
        // serverMapFrom not imported from a mion package - should be ignored
        {
            code: `
                import { serverMapFrom } from 'other-package';
                serverMapFrom(sub, (x: any) => x.id);
            `,
        },
    ],
    invalid: [
        // serverMapFrom with an INLINE arrow mapper — needs the vite build-time transport
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom(sub, (x: any) => x.id);
            `,
            errors: [{messageId: 'missingMapFromName'}],
        },
        // serverMapFrom with an INLINE function-expression mapper
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom(sub, function(x: any) { return x.id; });
            `,
            errors: [{messageId: 'missingMapFromName'}],
        },
        // serverMapFrom with a missing second argument
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom(sub);
            `,
            errors: [{messageId: 'missingMapFromName'}],
        },
        // serverMapFrom with a non-string-literal name (variable)
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                const name = 'extractId';
                serverMapFrom(sub, name);
            `,
            errors: [{messageId: 'nameNotStringLiteral'}],
        },
        // serverMapFrom with a numeric literal (not a string)
        {
            code: `
                import { serverMapFrom } from '@mionjs/client';
                serverMapFrom(sub, 42);
            `,
            errors: [{messageId: 'nameNotStringLiteral'}],
        },
        // Aliased serverMapFrom import with an inline mapper
        {
            code: `
                import { serverMapFrom as smf } from '@mionjs/client';
                smf(sub, (x: any) => x.id);
            `,
            errors: [{messageId: 'missingMapFromName'}],
        },
    ],
});
