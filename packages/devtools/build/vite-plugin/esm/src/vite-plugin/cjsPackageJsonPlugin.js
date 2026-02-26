import { writeFileSync } from "fs";
function cjsPackageJsonPlugin(...cjsDirs) {
  return {
    name: "cjs-package-json",
    closeBundle() {
      for (const dir of cjsDirs) {
        writeFileSync(`${dir}/package.json`, '{"type":"commonjs"}\n');
      }
    }
  };
}
export {
  cjsPackageJsonPlugin
};
//# sourceMappingURL=cjsPackageJsonPlugin.js.map
