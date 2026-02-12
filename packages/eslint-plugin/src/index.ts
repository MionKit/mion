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

const plugin = {
    rules: {
        'no-typeof-runtype': noTypeofRunType,
        'strong-typed-routes': strongTypedRoutes,
        'no-unreachable-union-types': noUnreachableUnionTypes,
        'no-mixed-union-properties': noMixedUnionProperties,
        'no-type-imports': noTypeImports,
    },
    configs: {
        recommended: {
            extends: [],
            rules: {
                '@mionkit/no-typeof-runtype': 'error',
                '@mionkit/strong-typed-routes': 'error',
                '@mionkit/no-unreachable-union-types': 'error',
                '@mionkit/no-type-imports': 'error',
                // disabled as seems is not too useful and overlaps with some ts rules
                // '@mionkit/no-mixed-union-properties': 'warn',
            },
        },
    },
};

export default plugin;
