import noTypeofRunType from './rules/no-typeof-runtype';
const plugin = {
    rules: {
        'no-typeof-runtype': noTypeofRunType,
    },
    configs: {
        recommended: {
            plugins: ['@mionkit/eslint-plugin'],
            rules: {
                '@mionkit/no-typeof-runtype': 'error',
            },
        },
    },
};
module.exports = plugin;
export default plugin;
