"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const path = require("path");
const fs = require("fs");
const util = require("util");
const src_codegen_aotCompile = require("./src/codegen/aot-compile.js");
const src_codegen_constants = require("./src/codegen/constants.js");
const DEFAULT_TEMPLATE_DIR = path.join(__dirname, "..", "..", "mion-aot-template");
async function buildAOT(options) {
  const { aotDir, startScript, templateDir = DEFAULT_TEMPLATE_DIR } = options;
  if (!src_codegen_constants.isTest) {
    console.log(`
Building AOT caches:
  AOT directory: ${aotDir}
  Start script: ${startScript}
`);
  }
  if (!fs.existsSync(aotDir)) {
    throw new Error(`AOT directory does not exist: ${aotDir}`);
  }
  if (!fs.existsSync(startScript)) {
    throw new Error(`Start script does not exist: ${startScript}`);
  }
  const hasCjsBuild = fs.existsSync(path.resolve(aotDir, "build", "cjs"));
  const hasEsmBuild = fs.existsSync(path.resolve(aotDir, "build", "esm"));
  if (!hasCjsBuild && !hasEsmBuild) {
    throw new Error(
      `AOT package has not been built. Expected build/cjs or build/esm directory in ${aotDir}. Run 'npm run build' in the AOT package first.`
    );
  }
  try {
    await src_codegen_aotCompile.compileAOT({
      startScriptPath: startScript,
      aotDir,
      templateDir
    });
    if (!src_codegen_constants.isTest) {
      console.log("AOT build completed successfully!");
    }
  } catch (error) {
    throw new Error(`AOT build failed: ${error.message}`);
  }
}
function showHelp() {
  console.log(`
mion-build-aot - Build AOT caches by running start script and compiling

Usage:
  npx mion-build-aot --dir <aot-directory> --start-server-script <script-path>

Options:
  -d, --dir <directory>              AOT package directory (required)
  -s, --start-server-script <path>   Path to start server script (required)
  -h, --help                         Show this help message

Examples:
  npx mion-build-aot --dir ./packages/my-api-aot --start-server-script ./dist/cjs/my-api/init.js
  npx mion-build-aot --dir ./packages/my-api-aot --start-server-script ./dist/esm/server.mjs
`);
}
async function mionBuildAot(templateDir) {
  const { values: args } = util.parseArgs({
    args: process.argv.slice(2),
    options: {
      dir: {
        type: "string",
        short: "d"
      },
      "start-server-script": {
        type: "string",
        short: "s"
      },
      help: {
        type: "boolean",
        short: "h"
      }
    }
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
  if (!args["start-server-script"]) {
    console.error("Error: --start-server-script argument is required");
    showHelp();
    process.exit(1);
  }
  try {
    await buildAOT({
      aotDir: path.resolve(args.dir),
      startScript: path.resolve(args["start-server-script"]),
      templateDir
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
exports.buildAOT = buildAOT;
exports.mionBuildAot = mionBuildAot;
//# sourceMappingURL=index.js.map
