import { mionBuildAot } from "../../index.js";
import { join } from "path";
const templateDir = join(__dirname, "..", "..", "mion-aot-template");
mionBuildAot(templateDir).catch((error) => {
  console.error("Error: Could not load mion-build-aot CLI.");
  console.error("Make sure the codegen package has been built with: npm run build");
  console.error("Details:", error.message);
  process.exit(1);
});
//# sourceMappingURL=run-build-aot.js.map
