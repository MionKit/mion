/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './type-formats-imports.ts';

const ruleTester = new RuleTester();

ruleTester.run('type-formats-imports', rule, {
    valid: [
        // Valid: regular import of format types from @mionkit/type-formats
        {
            code: `import { StrEmail } from '@mionkit/type-formats/FormatsString';`,
        },
        // Valid: regular import of TypeFormat from @mionkit/run-types
        {
            code: `import { TypeFormat } from '@mionkit/run-types';`,
        },
        // Valid: type-only import from unrelated package
        {
            code: `import type { User } from './types';`,
        },
        // Valid: type-only import of non-format types from @mionkit/run-types
        {
            code: `import type { BaseRunType, JitCode } from '@mionkit/run-types';`,
        },
        // Valid: type-only import of non-format types from @mionkit/type-formats
        {
            code: `import type { FormatParams_Email } from '@mionkit/type-formats/FormatsString';`,
        },
        // Valid: regular import from subpath
        {
            code: `import { NumFormat, NumInteger } from '@mionkit/type-formats/FormatsNumber';`,
        },
        // Valid: regular import of multiple string format types
        {
            code: `import { StrDate, StrTime, StrDateTime } from '@mionkit/type-formats/FormatsString';`,
        },
    ],
    invalid: [
        // Invalid: type-only import of TypeFormat from @mionkit/run-types
        {
            code: `import type { TypeFormat } from '@mionkit/run-types';`,
            errors: [{messageId: 'typeFormatsImports', data: {typeName: 'TypeFormat', source: '@mionkit/run-types'}}],
        },
        // Invalid: type-only import of StrEmail from subpath
        {
            code: `import type { StrEmail } from '@mionkit/type-formats/FormatsString';`,
            errors: [
                {messageId: 'typeFormatsImports', data: {typeName: 'StrEmail', source: '@mionkit/type-formats/FormatsString'}},
            ],
        },
        // Invalid: specifier-level type-only import
        {
            code: `import { type StrEmail } from '@mionkit/type-formats/FormatsString';`,
            errors: [
                {messageId: 'typeFormatsImports', data: {typeName: 'StrEmail', source: '@mionkit/type-formats/FormatsString'}},
            ],
        },
        // Invalid: multiple format types imported as type-only
        {
            code: `import type { NumFormat, NumInteger } from '@mionkit/type-formats/FormatsNumber';`,
            errors: [
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'NumFormat', source: '@mionkit/type-formats/FormatsNumber'},
                },
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'NumInteger', source: '@mionkit/type-formats/FormatsNumber'},
                },
            ],
        },
        // Invalid: bigint format type
        {
            code: `import type { BigNumFormat } from '@mionkit/type-formats/FormatsBigint';`,
            errors: [
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'BigNumFormat', source: '@mionkit/type-formats/FormatsBigint'},
                },
            ],
        },
        // Invalid: multiple string format types
        {
            code: `import type { StrDate, StrUrl, StrIP } from '@mionkit/type-formats/FormatsString';`,
            errors: [
                {messageId: 'typeFormatsImports', data: {typeName: 'StrDate', source: '@mionkit/type-formats/FormatsString'}},
                {messageId: 'typeFormatsImports', data: {typeName: 'StrUrl', source: '@mionkit/type-formats/FormatsString'}},
                {messageId: 'typeFormatsImports', data: {typeName: 'StrIP', source: '@mionkit/type-formats/FormatsString'}},
            ],
        },
        // Invalid: specifier-level type-only for run-types
        {
            code: `import { type TypeFormat } from '@mionkit/run-types';`,
            errors: [{messageId: 'typeFormatsImports', data: {typeName: 'TypeFormat', source: '@mionkit/run-types'}}],
        },
        // Invalid: base StrFormat type
        {
            code: `import type { StrFormat } from '@mionkit/type-formats/FormatsString';`,
            errors: [
                {messageId: 'typeFormatsImports', data: {typeName: 'StrFormat', source: '@mionkit/type-formats/FormatsString'}},
            ],
        },
        // Invalid: BigNUmUInt64 with exact casing
        {
            code: `import type { BigNUmUInt64 } from '@mionkit/type-formats/FormatsBigint';`,
            errors: [
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'BigNUmUInt64', source: '@mionkit/type-formats/FormatsBigint'},
                },
            ],
        },
        // Invalid: mixed import where only format types are flagged
        {
            code: `import type { StrEmail, FormatParams_Email } from '@mionkit/type-formats/FormatsString';`,
            errors: [
                {messageId: 'typeFormatsImports', data: {typeName: 'StrEmail', source: '@mionkit/type-formats/FormatsString'}},
            ],
        },
    ],
});
