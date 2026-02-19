"use strict";
const path = require("path");
const src_codegen_cliInitAot = require("./cli-init-aot.js");
const templateDir = path.join(__dirname, "..", "mion-aot-template");
try {
  src_codegen_cliInitAot.mionInitAot(templateDir);
} catch (error) {
  console.error("Error: Could not load mion-init-aot CLI.");
  console.error("Make sure the codegen package has been built with: npm run build");
  console.error("Details:", error == null ? void 0 : error.message);
  process.exit(1);
}
//# sourceMappingURL=run-init-aot.js.map
