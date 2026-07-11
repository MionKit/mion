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
        // Valid: regular import of format types from @mionjs/type-formats
        {
            code: `import { FormatEmail } from '@mionjs/type-formats/StringFormats';`,
        },
        // Valid: regular import of TypeFormat from @mionjs/run-types
        {
            code: `import { TypeFormat } from '@mionjs/run-types';`,
        },
        // Valid: type-only import from unrelated package
        {
            code: `import type { User } from './types';`,
        },
        // Valid: type-only import of non-format types from @mionjs/run-types
        {
            code: `import type { BaseRunType, JitCode } from '@mionjs/run-types';`,
        },
        // Valid: type-only import of non-format types from @mionjs/type-formats
        {
            code: `import type { FormatParams_Email } from '@mionjs/type-formats/StringFormats';`,
        },
        // Valid: regular import from subpath
        {
            code: `import { FormatNumber, FormatInteger } from '@mionjs/type-formats/NumberFormats';`,
        },
        // Valid: regular import of multiple string format types
        {
            code: `import { FormatStringDate, FormatStringTime, FormatStringDateTime } from '@mionjs/type-formats/StringFormats';`,
        },
    ],
    invalid: [
        // Invalid: type-only import of TypeFormat from @mionjs/run-types
        {
            code: `import type { TypeFormat } from '@mionjs/run-types';`,
            errors: [{messageId: 'typeFormatsImports', data: {typeName: 'TypeFormat', source: '@mionjs/run-types'}}],
        },
        // Invalid: type-only import of FormatEmail from subpath
        {
            code: `import type { FormatEmail } from '@mionjs/type-formats/StringFormats';`,
            errors: [
                {messageId: 'typeFormatsImports', data: {typeName: 'FormatEmail', source: '@mionjs/type-formats/StringFormats'}},
            ],
        },
        // Invalid: specifier-level type-only import
        {
            code: `import { type FormatEmail } from '@mionjs/type-formats/StringFormats';`,
            errors: [
                {messageId: 'typeFormatsImports', data: {typeName: 'FormatEmail', source: '@mionjs/type-formats/StringFormats'}},
            ],
        },
        // Invalid: multiple format types imported as type-only
        {
            code: `import type { FormatNumber, FormatInteger } from '@mionjs/type-formats/NumberFormats';`,
            errors: [
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'FormatNumber', source: '@mionjs/type-formats/NumberFormats'},
                },
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'FormatInteger', source: '@mionjs/type-formats/NumberFormats'},
                },
            ],
        },
        // Invalid: bigint format type
        {
            code: `import type { FormatBigInt } from '@mionjs/type-formats/BigintFormats';`,
            errors: [
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'FormatBigInt', source: '@mionjs/type-formats/BigintFormats'},
                },
            ],
        },
        // Invalid: multiple string format types
        {
            code: `import type { FormatStringDate, FormatUrl, FormatIP } from '@mionjs/type-formats/StringFormats';`,
            errors: [
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'FormatStringDate', source: '@mionjs/type-formats/StringFormats'},
                },
                {messageId: 'typeFormatsImports', data: {typeName: 'FormatUrl', source: '@mionjs/type-formats/StringFormats'}},
                {messageId: 'typeFormatsImports', data: {typeName: 'FormatIP', source: '@mionjs/type-formats/StringFormats'}},
            ],
        },
        // Invalid: specifier-level type-only for run-types
        {
            code: `import { type TypeFormat } from '@mionjs/run-types';`,
            errors: [{messageId: 'typeFormatsImports', data: {typeName: 'TypeFormat', source: '@mionjs/run-types'}}],
        },
        // Invalid: base FormatString type
        {
            code: `import type { FormatString } from '@mionjs/type-formats/StringFormats';`,
            errors: [
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'FormatString', source: '@mionjs/type-formats/StringFormats'},
                },
            ],
        },
        // Invalid: FormatBigUInt64 with exact casing
        {
            code: `import type { FormatBigUInt64 } from '@mionjs/type-formats/BigintFormats';`,
            errors: [
                {
                    messageId: 'typeFormatsImports',
                    data: {typeName: 'FormatBigUInt64', source: '@mionjs/type-formats/BigintFormats'},
                },
            ],
        },
        // Invalid: mixed import where only format types are flagged
        {
            code: `import type { FormatEmail, FormatParams_Email } from '@mionjs/type-formats/StringFormats';`,
            errors: [
                {messageId: 'typeFormatsImports', data: {typeName: 'FormatEmail', source: '@mionjs/type-formats/StringFormats'}},
            ],
        },
    ],
});
