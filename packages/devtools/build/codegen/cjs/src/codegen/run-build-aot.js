"use strict";
const index = require("../../index.js");
const path = require("path");
const templateDir = path.join(__dirname, "..", "..", "mion-aot-template");
index.mionBuildAot(templateDir).catch((error) => {
  console.error("Error: Could not load mion-build-aot CLI.");
  console.error("Make sure the codegen package has been built with: npm run build");
  console.error("Details:", error.message);
  process.exit(1);
});
//# sourceMappingURL=run-build-aot.js.map
