import { join } from "path";
import { mionInitAot } from "./cli-init-aot.js";
const templateDir = join(__dirname, "..", "mion-aot-template");
try {
  mionInitAot(templateDir);
} catch (error) {
  console.error("Error: Could not load mion-init-aot CLI.");
  console.error("Make sure the codegen package has been built with: npm run build");
  console.error("Details:", error == null ? void 0 : error.message);
  process.exit(1);
}
//# sourceMappingURL=run-init-aot.js.map
