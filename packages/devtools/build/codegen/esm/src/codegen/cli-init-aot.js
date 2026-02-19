import { join, resolve, basename } from "path";
import { existsSync, cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";
import { isTest } from "./constants.js";
const DEFAULT_TEMPLATE_DIR = join(__dirname, "..", "..", "mion-aot-template");
function initAOT(options) {
  const { dir, packageName, templateDir = DEFAULT_TEMPLATE_DIR } = options;
  const targetDir = resolve(dir);
  const finalPackageName = packageName || basename(targetDir);
  if (!isTest) {
    console.log(`
Initializing AOT package:
  Target directory: ${targetDir}
  Package name: ${finalPackageName}
`);
  }
  if (!existsSync(templateDir)) {
    throw new Error(`Template directory not found at ${templateDir}`);
  }
  copyTemplate(templateDir, targetDir);
  updatePackageJson(targetDir, finalPackageName);
  if (!isTest) {
    console.log(`AOT package initialized successfully!`);
  }
}
function copyTemplate(templateDir, targetDir) {
  if (existsSync(targetDir)) {
    if (isExistingMionAOTTemplate(targetDir)) {
      if (!isTest) console.log("Existing mion AOT template detected. Updating template files...");
      try {
        cpSync(templateDir, targetDir, { recursive: true, force: true });
        const srcDir = join(targetDir, "src");
        if (existsSync(srcDir)) rmSync(srcDir, { recursive: true, force: true });
        return;
      } catch (error) {
        throw new Error(`Error updating template: ${error.message}`);
      }
    } else {
      throw new Error(`Target directory ${targetDir} already exists and is not a mion AOT template`);
    }
  }
  try {
    mkdirSync(targetDir, { recursive: true });
    cpSync(templateDir, targetDir, { recursive: true });
    const srcDir = join(targetDir, "src");
    if (existsSync(srcDir)) {
      rmSync(srcDir, { recursive: true, force: true });
    }
  } catch (error) {
    throw new Error(`Error copying template: ${error.message}`);
  }
}
function isExistingMionAOTTemplate(targetDir) {
  const packageJsonPath = join(targetDir, "package.json");
  if (!existsSync(packageJsonPath)) return false;
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    return packageJson.isMionAOT === true;
  } catch (error) {
    return false;
  }
}
function updatePackageJson(targetDir, packageName) {
  const packageJsonPath = join(targetDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`);
  }
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    packageJson.name = packageName;
    delete packageJson.scripts;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
  } catch (error) {
    throw new Error(`Error updating package.json: ${error.message}`);
  }
}
function showHelp() {
  console.log(`
mion-init-aot - Initialize AOT package from template

Usage:
  npx mion-init-aot --dir <directory> [--package-name <name>]

Options:
  -d, --dir <directory>        Target directory for AOT package (required)
  -n, --package-name <name>    Package name (optional, derived from dir if not provided)
  -h, --help                   Show this help message

Examples:
  npx mion-init-aot --dir ./packages/my-api-aot
  npx mion-init-aot --dir ./packages/my-api-aot --package-name my-custom-aot
`);
}
function mionInitAot(templateDir) {
  const { values: args } = parseArgs({
    args: process.argv.slice(2),
    options: {
      dir: {
        type: "string",
        short: "d"
      },
      "package-name": {
        type: "string",
        short: "n"
      },
      help: {
        type: "boolean",
        short: "h"
      }
    },
    allowPositionals: true
  });
  if (args.help) {
    showHelp();
    process.exit(0);
  }
  if (!args.dir) {
    console.error("Error: --dir argument is required");
    showHelp();
    process.exit(1);
  }
  try {
    initAOT({
      dir: args.dir,
      packageName: args["package-name"],
      templateDir
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
export {
  initAOT,
  mionInitAot
};
//# sourceMappingURL=cli-init-aot.js.map
