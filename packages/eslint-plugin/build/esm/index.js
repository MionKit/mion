import noTypeofRunType from './rules/no-typeof-runtype';
import strongTypedRoutes from './rules/strong-typed-routes';
const plugin = {
    rules: {
        'no-typeof-runtype': noTypeofRunType,
        'strong-typed-routes': strongTypedRoutes,
    },
    configs: {
        recommended: {
            extends: [],
            rules: {
                '@mionkit/no-typeof-runtype': 'error',
                '@mionkit/strong-typed-routes': 'error',
            },
        },
    },
};
module.exports = plugin;
export default plugin;
//# sourceMappingURL=index.js.map