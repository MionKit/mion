/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import noTypeofRunType from './rules/no-typeof-runtype.ts';
import strongTypedRoutes from './rules/strong-typed-routes.ts';
import noUnreachableUnionTypes from './rules/no-unreachable-union-types.ts';
import noMixedUnionProperties from './rules/no-mixed-union-properties.ts';
import noTypeImports from './rules/no-type-imports.ts';
import pureFunctions from './rules/pure-functions.ts';

const plugin = {
    rules: {
        'no-typeof-runtype': noTypeofRunType,
        'strong-typed-routes': strongTypedRoutes,
        'no-unreachable-union-types': noUnreachableUnionTypes,
        'no-mixed-union-properties': noMixedUnionProperties,
        'no-type-imports': noTypeImports,
        'pure-functions': pureFunctions,
    },
    configs: {} as Record<string, unknown>,
};

// Flat config preset: self-contained with plugin registration and recommended rules.
// Usage: import mionPlugin from '@mionkit/devtools/eslint'; ... mionPlugin.configs.recommended
plugin.configs.recommended = {
    plugins: {
        '@mionkit': plugin,
    },
    rules: {
        '@mionkit/no-typeof-runtype': 'error',
        '@mionkit/strong-typed-routes': 'error',
        '@mionkit/no-unreachable-union-types': 'error',
        '@mionkit/no-type-imports': 'error',
        '@mionkit/pure-functions': 'error',
        // disabled as seems is not too useful and overlaps with some ts rules
        // '@mionkit/no-mixed-union-properties': 'warn',
    },
};

export default plugin;
