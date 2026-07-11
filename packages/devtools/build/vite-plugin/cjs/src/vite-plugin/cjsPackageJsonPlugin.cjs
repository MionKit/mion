"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const fs = require("fs");
function cjsPackageJsonPlugin(...cjsDirs) {
  return {
    name: "cjs-package-json",
    closeBundle() {
      for (const dir of cjsDirs) {
        fs.writeFileSync(`${dir}/package.json`, '{"type":"commonjs"}\n');
      }
    }
  };
}
exports.cjsPackageJsonPlugin = cjsPackageJsonPlugin;
//# sourceMappingURL=cjsPackageJsonPlugin.cjs.map
