import rule from "./src/eslint/rules/strong-typed-routes.js";
import rule$1 from "./src/eslint/rules/no-unreachable-union-types.js";
import rule$2 from "./src/eslint/rules/no-mixed-union-properties.js";
import rule$3 from "./src/eslint/rules/no-vite-client.js";
import rule$4 from "./src/eslint/rules/enforce-type-imports.js";
//#region src/eslint/index.ts
var plugin = {
	rules: {
		"strong-typed-routes": rule,
		"no-unreachable-union-types": rule$1,
		"no-mixed-union-properties": rule$2,
		"no-vite-client": rule$3,
		"enforce-type-imports": rule$4
	},
	configs: {}
};
plugin.configs.recommended = {
	plugins: { "@mionjs": plugin },
	rules: {
		"@mionjs/strong-typed-routes": "error",
		"@mionjs/no-unreachable-union-types": "error"
	}
};
//#endregion
export { plugin as default };

//# sourceMappingURL=index.js.map