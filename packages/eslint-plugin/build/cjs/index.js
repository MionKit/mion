"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const no_typeof_runtype_1 = __importDefault(require("./rules/no-typeof-runtype"));
const strong_typed_routes_1 = __importDefault(require("./rules/strong-typed-routes"));
const plugin = {
    rules: {
        'no-typeof-runtype': no_typeof_runtype_1.default,
        'strong-typed-routes': strong_typed_routes_1.default,
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
exports.default = plugin;
//# sourceMappingURL=index.js.map