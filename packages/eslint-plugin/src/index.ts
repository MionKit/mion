/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import noTypeofRunType from './rules/no-typeof-runtype';
import strongTypedRoutes from './rules/strong-typed-routes';
import noUnreachableUnionTypes from './rules/no-unreachable-union-types';

const plugin = {
    rules: {
        'no-typeof-runtype': noTypeofRunType,
        'strong-typed-routes': strongTypedRoutes,
        'no-unreachable-union-types': noUnreachableUnionTypes,
    },
    configs: {
        recommended: {
            extends: [],
            rules: {
                '@mionkit/no-typeof-runtype': 'error',
                '@mionkit/strong-typed-routes': 'error',
                '@mionkit/no-unreachable-union-types': 'warn',
            },
        },
    },
};

// CommonJS export
module.exports = plugin;

// ESM export
export default plugin;
