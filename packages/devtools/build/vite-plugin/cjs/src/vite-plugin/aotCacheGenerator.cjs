"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const child_process = require("child_process");
const path = require("path");
const src_vitePlugin_resolveModule = require("./resolveModule.cjs");
const DEFAULT_TIMEOUT = 3e4;
async function generateAOTCaches(serverConfig, startScriptOverride) {
  const persist = serverConfig.mode === "IPC";
  const startScript = path.resolve(startScriptOverride ?? serverConfig.startServerScript);
  const scriptDir = path.dirname(startScript);
  const viteConfigArgs = serverConfig.serverViteConfig ? ["--config", path.resolve(serverConfig.serverViteConfig)] : [];
  let viteNodePath;
  try {
    viteNodePath = await src_vitePlugin_resolveModule.resolveModule("vite-node/cli", scriptDir);
  } catch (err) {
    throw new Error(
      `Failed to resolve vite-node. Make sure vite-node is installed.
You can install it with: npm install -D vite-node
Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return new Promise((resolvePromise, reject) => {
    let child;
    let resolved = false;
    let stderr = "";
    try {
      child = child_process.fork(viteNodePath, [...viteConfigArgs, startScript], {
        env: { ...process.env, MION_COMPILE: persist ? "serve" : "onlyAOT" },
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
    const cleanup = () => {
      clearTimeout(timeoutId);
      if (child.connected) child.disconnect();
      if (!persist) child.kill();
    };
    child.on("message", (msg) => {
      const message = msg;
      if (message?.type === "mion-aot-caches") {
        resolved = true;
        cleanup();
        resolvePromise({
          data: {
            jitFnsCode: message.jitFnsCode,
            pureFnsCode: message.pureFnsCode,
            routerCacheCode: message.routerCacheCode
          },
          childProcess: persist ? child : void 0
        });
      }
    });
    child.stderr?.on("data", (data) => {
      const msg = data.toString().trim();
      if (!resolved) stderr += msg + "\n";
      if (persist && msg) console.error(`[mion-server] ${msg}`);
    });
    child.stdout?.on("data", (data) => {
      const msg = data.toString().trim();
      if (persist && msg) {
        console.log(`[mion-server] ${msg}`);
      } else if (process.env.DEBUG_AOT && msg) {
        console.log("[mion-aot] stdout:", msg);
      }
    });
    child.on("error", (err) => {
      if (!resolved) {
        cleanup();
        reject(new Error(`vite-node failed to start: ${err.message}`));
      }
    });
    child.on("exit", (code) => {
      if (!resolved) {
        cleanup();
        reject(
          new Error(
            `vite-node exited with code ${code} before emitting AOT caches.
Make sure the startServerScript calls initMionRouter() and the router is fully initialized.
` + (stderr ? `stderr: ${stderr}` : "")
          )
        );
      }
    });
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        cleanup();
        if (persist) child.kill();
        reject(
          new Error(
            `AOT cache generation timed out (${DEFAULT_TIMEOUT / 1e3}s). Make sure the server start script completes initialization.`
          )
        );
      }
    }, DEFAULT_TIMEOUT);
  });
}
async function loadSSRRouterAndGenerateAOTCaches(loadModule, startServerScript) {
  const prevCompile = process.env.MION_COMPILE;
  process.env.MION_COMPILE = "viteSSR";
  try {
    const mod = await loadModule(startServerScript);
    const promises = Object.values(mod).filter((v) => v instanceof Promise);
    if (promises.length > 0) await Promise.all(promises);
    const aotModule = await loadModule("@mionjs/router/aot");
    const caches = await aotModule.getSerializedCaches();
    return caches;
  } finally {
    if (prevCompile === void 0) delete process.env.MION_COMPILE;
    else process.env.MION_COMPILE = prevCompile;
  }
}
async function killPersistentChild(child) {
  if (!child || child.killed) return;
  const pid = child.pid;
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  } else {
    child.kill("SIGTERM");
  }
  await new Promise((resolve2) => {
    const timeout = setTimeout(() => {
      if (child && !child.killed) {
        if (pid) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        } else {
          child.kill("SIGKILL");
        }
      }
      resolve2();
    }, 5e3);
    child.on("exit", () => {
      clearTimeout(timeout);
      resolve2();
    });
  });
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
function logAOTCaches(data) {
  const jitSize = formatBytes(Buffer.byteLength(data.jitFnsCode, "utf-8"));
  const pureSize = formatBytes(Buffer.byteLength(data.pureFnsCode, "utf-8"));
  const routerSize = formatBytes(Buffer.byteLength(data.routerCacheCode, "utf-8"));
  console.log(`[mion]   jitFns: ${jitSize}, pureFns: ${pureSize}, routerCache: ${routerSize}`);
  if (process.env.DEBUG_AOT) {
    console.log("[mion] AOT jitFns cache:\n", data.jitFnsCode);
    console.log("[mion] AOT pureFns cache:\n", data.pureFnsCode);
    console.log("[mion] AOT routerCache:\n", data.routerCacheCode);
  }
}
function generateJitFnsModule(jitFnsCode) {
  return `/* Auto-generated AOT JIT functions cache - do not edit */
export const jitFnsCache = ${jitFnsCode};
`;
}
function generatePureFnsModule(pureFnsCode) {
  return `/* Auto-generated AOT pure functions cache - do not edit */
export const pureFnsCache = ${pureFnsCode};
`;
}
function generateRouterCacheModule(routerCacheCode) {
  return `/* Auto-generated AOT router cache - do not edit */
export const routerCache = ${routerCacheCode};
`;
}
function generateCombinedCachesModule() {
  return `/* Auto-generated combined AOT caches - do not edit */
import { addAOTCaches, addRoutesToCache } from '@mionjs/core';
import { pureFnsCache } from 'virtual:mion-aot/pure-fns';
import { jitFnsCache } from 'virtual:mion-aot/jit-fns';
import { routerCache } from 'virtual:mion-aot/router-cache';

addAOTCaches(jitFnsCache, pureFnsCache);
addRoutesToCache(routerCache);

export { jitFnsCache, pureFnsCache, routerCache };
`;
}
function generateNoopModule(comment) {
  return `/* ${comment} */
`;
}
async function waitForServer(port, timeoutMs = 3e4) {
  const startTime = Date.now();
  const checkInterval = 100;
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok || response.status === 404) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, checkInterval));
  }
  throw new Error(`[mion] Server failed to become ready on port ${port} within ${timeoutMs}ms`);
}
function generateNoopCombinedModule() {
  return `/* No-op: AOT caches not generated */
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
`;
}
exports.generateAOTCaches = generateAOTCaches;
exports.generateCombinedCachesModule = generateCombinedCachesModule;
exports.generateJitFnsModule = generateJitFnsModule;
exports.generateNoopCombinedModule = generateNoopCombinedModule;
exports.generateNoopModule = generateNoopModule;
exports.generatePureFnsModule = generatePureFnsModule;
exports.generateRouterCacheModule = generateRouterCacheModule;
exports.killPersistentChild = killPersistentChild;
exports.loadSSRRouterAndGenerateAOTCaches = loadSSRRouterAndGenerateAOTCaches;
exports.logAOTCaches = logAOTCaches;
exports.waitForServer = waitForServer;
//# sourceMappingURL=aotCacheGenerator.cjs.map
