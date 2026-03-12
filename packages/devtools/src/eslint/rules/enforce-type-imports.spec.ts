/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RuleTester} from '@typescript-eslint/rule-tester';
import rule from './enforce-type-imports.ts';

const ruleTester = new RuleTester();

const options = [{backendSources: ['.*api/src/.*', '.*\\.routes\\.ts$']}] as const;

ruleTester.run('enforce-type-imports', rule, {
    valid: [
        // Valid: type-only import from backend path
        {
            code: `import type { MyApi } from '../../api/src/api';`,
            options,
        },
        // Valid: specifier-level type-only import from backend path
        {
            code: `import { type MyApi } from '../../api/src/api';`,
            options,
        },
        // Valid: multiple specifier-level type-only imports
        {
            code: `import { type MyApi, type OtherType } from '../../api/src/api';`,
            options,
        },
        // Valid: regular import from non-backend path
        {
            code: `import { useState } from 'react';`,
            options,
        },
        // Valid: regular import from local file that doesn't match backend pattern
        {
            code: `import { Foo } from './local-file';`,
            options,
        },
        // Valid: type-only re-export from backend path
        {
            code: `export type { MyApi } from '../../api/src/api';`,
            options,
        },
        // Valid: type-only namespace import from backend path
        {
            code: `import type * as Api from '../../api/src/api';`,
            options,
        },
        // Valid: type-only default import from backend path
        {
            code: `import type MyApi from '../../api/src/api';`,
            options,
        },
        // Valid: import from .routes.ts with type-only
        {
            code: `import type { UserRoutes } from './user.routes.ts';`,
            options,
        },
    ],
    invalid: [
        // Invalid: value import from backend path
        {
            code: `import { MyApi } from '../../api/src/api';`,
            output: `import type { MyApi } from '../../api/src/api';`,
            errors: [{messageId: 'enforceTypeImport', data: {source: '../../api/src/api'}}],
            options,
        },
        // Invalid: multiple value imports from backend path
        {
            code: `import { MyApi, OtherType } from '../../api/src/api';`,
            output: `import type { MyApi, OtherType } from '../../api/src/api';`,
            errors: [{messageId: 'enforceTypeImport', data: {source: '../../api/src/api'}}],
            options,
        },
        // Invalid: default import from backend path
        {
            code: `import MyApi from '../../api/src/api';`,
            output: `import type MyApi from '../../api/src/api';`,
            errors: [{messageId: 'enforceTypeImport', data: {source: '../../api/src/api'}}],
            options,
        },
        // Invalid: namespace import from backend path
        {
            code: `import * as Api from '../../api/src/api';`,
            output: `import type * as Api from '../../api/src/api';`,
            errors: [{messageId: 'enforceTypeImport', data: {source: '../../api/src/api'}}],
            options,
        },
        // Invalid: mixed specifiers (some type, some value)
        {
            code: `import { type MyApi, OtherType } from '../../api/src/api';`,
            output: `import { type MyApi, type OtherType } from '../../api/src/api';`,
            errors: [{messageId: 'enforceTypeImport', data: {source: '../../api/src/api'}}],
            options,
        },
        // Invalid: value re-export from backend path
        {
            code: `export { MyApi } from '../../api/src/api';`,
            output: `export type { MyApi } from '../../api/src/api';`,
            errors: [{messageId: 'enforceTypeExport', data: {source: '../../api/src/api'}}],
            options,
        },
        // Invalid: mixed re-export (some type, some value)
        {
            code: `export { type MyApi, OtherType } from '../../api/src/api';`,
            output: `export { type MyApi, type OtherType } from '../../api/src/api';`,
            errors: [{messageId: 'enforceTypeExport', data: {source: '../../api/src/api'}}],
            options,
        },
        // Invalid: import from .routes.ts path
        {
            code: `import { UserRoutes } from './user.routes.ts';`,
            output: `import type { UserRoutes } from './user.routes.ts';`,
            errors: [{messageId: 'enforceTypeImport', data: {source: './user.routes.ts'}}],
            options,
        },
        // Invalid: side-effect import from backend path (no fix)
        {
            code: `import '../../api/src/setup';`,
            errors: [{messageId: 'sideEffectImport', data: {source: '../../api/src/setup'}}],
            options,
        },
    ],
});
