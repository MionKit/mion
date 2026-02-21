"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const child_process = require("child_process");
const path = require("path");
const module$1 = require("module");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const require$1 = module$1.createRequire(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("src/vite-plugin/aotCacheGenerator.js", document.baseURI).href);
const DEFAULT_TIMEOUT = 3e4;
function getDefaultRoutesScriptPath() {
  const routerPath = require$1.resolve("@mionkit/router");
  const routerDir = path.dirname(routerPath);
  return path.resolve(routerDir, "defaultRoutes.ts");
}
async function generateAOTCaches(options, startScriptOverride) {
  const startScript = path.resolve(startScriptOverride ?? options.startServerScript);
  const scriptDir = path.dirname(startScript);
  const viteConfigArgs = options.serverViteConfig ? ["--config", path.resolve(options.serverViteConfig)] : [];
  return new Promise((resolvePromise, reject) => {
    var _a, _b;
    let child;
    let resolved = false;
    let stderr = "";
    try {
      child = child_process.fork(require$1.resolve("vite-node/vite-node.mjs"), [...viteConfigArgs, startScript], {
        env: { ...process.env, MION_COMPILE: "true" },
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        cwd: scriptDir
      });
    } catch (err) {
      reject(
        new Error(
          `Failed to spawn vite-node. Make sure vite-node is installed.
You can install it with: npm install -D vite-node
Original error: ${err instanceof Error ? err.message : String(err)}`
        )
      );
      return;
    }
    child.on("message", (msg) => {
      const message = msg;
      if ((message == null ? void 0 : message.type) === "mion-aot-caches") {
        resolved = true;
        resolvePromise({
          jitFnsCode: message.jitFnsCode,
          pureFnsCode: message.pureFnsCode,
          routerCacheCode: message.routerCacheCode
        });
        child.kill();
      }
    });
    (_a = child.stderr) == null ? void 0 : _a.on("data", (data) => {
      stderr += data.toString();
    });
    (_b = child.stdout) == null ? void 0 : _b.on("data", (data) => {
      if (process.env.DEBUG_AOT) {
        console.log("[mion-aot] stdout:", data.toString());
      }
    });
    child.on("error", (err) => {
      if (!resolved) {
        reject(new Error(`vite-node failed to start: ${err.message}`));
      }
    });
    child.on("exit", (code) => {
      if (!resolved) {
        reject(
          new Error(
            `vite-node exited with code ${code} before emitting AOT caches.
Make sure the startServerScript calls initMionRouter() and the router is fully initialized.
` + (stderr ? `stderr: ${stderr}` : "")
          )
        );
      }
    });
    setTimeout(() => {
      if (!resolved) {
        child.kill();
        reject(
          new Error(
            `AOT cache generation timed out (${DEFAULT_TIMEOUT / 1e3}s). Make sure the server start script completes initialization.`
          )
        );
      }
    }, DEFAULT_TIMEOUT);
  });
}
function generateJitFnsModule(jitFnsCode) {
  return `/* Auto-generated AOT JIT functions cache - do not edit */
import { addAOTCaches } from '@mionkit/core';

const jitFnsCache = ${jitFnsCode};

addAOTCaches(jitFnsCache, {});
`;
}
function generatePureFnsModule(pureFnsCode) {
  return `/* Auto-generated AOT pure functions cache - do not edit */
import { addAOTCaches } from '@mionkit/core';

const pureFnsCache = ${pureFnsCode};

addAOTCaches({}, pureFnsCache);
`;
}
function generateRouterCacheModule(routerCacheCode) {
  return `/* Auto-generated AOT router cache - do not edit */
import { addRoutesToCache } from '@mionkit/core';

const routerCache = ${routerCacheCode};

addRoutesToCache(routerCache);
`;
}
function generateNoopModule(comment) {
  return `/* ${comment} */
`;
}
exports.generateAOTCaches = generateAOTCaches;
exports.generateJitFnsModule = generateJitFnsModule;
exports.generateNoopModule = generateNoopModule;
exports.generatePureFnsModule = generatePureFnsModule;
exports.generateRouterCacheModule = generateRouterCacheModule;
exports.getDefaultRoutesScriptPath = getDefaultRoutesScriptPath;
//# sourceMappingURL=aotCacheGenerator.js.map
