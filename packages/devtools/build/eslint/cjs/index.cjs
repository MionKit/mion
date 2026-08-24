//#region src/eslint/index.ts
var plugin = {
	rules: {
		"strong-typed-routes": require("./src/eslint/rules/strong-typed-routes.cjs"),
		"no-unreachable-union-types": require("./src/eslint/rules/no-unreachable-union-types.cjs"),
		"no-mixed-union-properties": require("./src/eslint/rules/no-mixed-union-properties.cjs"),
		"no-vite-client": require("./src/eslint/rules/no-vite-client.cjs"),
		"enforce-type-imports": require("./src/eslint/rules/enforce-type-imports.cjs")
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
module.exports = plugin;

//# sourceMappingURL=index.cjs.map