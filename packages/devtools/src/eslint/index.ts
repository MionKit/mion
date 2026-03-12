/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ESLint, Linter} from 'eslint';
import noTypeofRunType from './rules/no-typeof-runtype.ts';
import strongTypedRoutes from './rules/strong-typed-routes.ts';
import noUnreachableUnionTypes from './rules/no-unreachable-union-types.ts';
import noMixedUnionProperties from './rules/no-mixed-union-properties.ts';
import noTypeImports from './rules/no-type-imports.ts';
import pureFunctions from './rules/pure-functions.ts';
import noViteClient from './rules/no-vite-client.ts';
import typeFormatsImports from './rules/type-formats-imports.ts';
import enforceTypeImports from './rules/enforce-type-imports.ts';

// configs is set outside the initial object due to circular reference: recommended config references the plugin itself.
const plugin: ESLint.Plugin = {
    rules: {
        'no-typeof-runtype': noTypeofRunType,
        'strong-typed-routes': strongTypedRoutes,
        'no-unreachable-union-types': noUnreachableUnionTypes,
        'no-mixed-union-properties': noMixedUnionProperties,
        'no-type-imports': noTypeImports,
        'pure-functions': pureFunctions,
        'no-vite-client': noViteClient,
        'type-formats-imports': typeFormatsImports,
        'enforce-type-imports': enforceTypeImports,
    } as unknown as ESLint.Plugin['rules'],
    configs: {},
};

// Flat config preset: self-contained with plugin registration and recommended rules.
// Usage: import mionPlugin from '@mionjs/devtools/eslint'; ... mionPlugin.configs.recommended
plugin.configs!.recommended = {
    plugins: {
        '@mionjs': plugin,
    },
    rules: {
        '@mionjs/no-typeof-runtype': 'error',
        '@mionjs/strong-typed-routes': 'error',
        '@mionjs/no-unreachable-union-types': 'error',
        '@mionjs/no-type-imports': 'error',
        '@mionjs/pure-functions': 'error',
        '@mionjs/type-formats-imports': 'error',
        // disabled as seems is not too useful and overlaps with some ts rules
        // '@mionjs/no-mixed-union-properties': 'warn',
    },
} satisfies Linter.Config;

export default plugin;
