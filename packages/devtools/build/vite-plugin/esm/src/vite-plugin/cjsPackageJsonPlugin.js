import { writeFileSync } from "fs";
//#region src/vite-plugin/cjsPackageJsonPlugin.ts
/** Writes {"type": "commonjs"} package.json in CJS output dirs so Node.js doesn't treat .cjs files ambiguously */
function cjsPackageJsonPlugin(...cjsDirs) {
	return {
		name: "cjs-package-json",
		closeBundle() {
			for (const dir of cjsDirs) writeFileSync(`${dir}/package.json`, "{\"type\":\"commonjs\"}\n");
		}
	};
}
//#endregion
export { cjsPackageJsonPlugin };

//# sourceMappingURL=cjsPackageJsonPlugin.js.map