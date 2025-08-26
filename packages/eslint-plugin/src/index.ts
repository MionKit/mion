/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import noTypeofRunType from './rules/no-typeof-runtype';

const plugin = {
    rules: {
        'no-typeof-runtype': noTypeofRunType,
    },
    configs: {
        recommended: {
            extends: [],
            rules: {
                '@mionkit/no-typeof-runtype': 'error',
            },
        },
    },
};

// CommonJS export
module.exports = plugin;

// ESM export
export default plugin;
