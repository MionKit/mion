"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const child_process = require("child_process");
const path = require("path");
const src_vitePlugin_resolveModule = require("./resolveModule.cjs");
const DEFAULT_TIMEOUT = 3e4;
async function generateAOTCaches(serverConfig, startScriptOverride) {
  const persist = serverConfig.runMode === "childProcess";
  const startScript = path.resolve(startScriptOverride ?? serverConfig.startScript);
  const scriptDir = path.dirname(startScript);
  const viteConfigArgs = serverConfig.viteConfig ? ["--config", path.resolve(serverConfig.viteConfig)] : [];
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
      child = child_process.fork(viteNodePath, [...viteConfigArgs, startScript, ...serverConfig.args || []], {
        env: { ...process.env, ...serverConfig.env, MION_COMPILE: serverConfig.runMode },
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
      if (!persist && child.connected) child.disconnect();
      if (!persist) child.kill();
    };
    let platformReadyResolve;
    const platformReady = persist ? new Promise((res) => {
      platformReadyResolve = res;
    }) : void 0;
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
          childProcess: persist ? child : void 0,
          platformReady
        });
      } else if (message?.type === "mion-platform-ready" && platformReadyResolve) {
        platformReadyResolve({ routerConfig: message.routerConfig, platformConfig: message.platformConfig });
        platformReadyResolve = void 0;
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
Make sure the startScript calls initMionRouter() and the router is fully initialized.
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
async function loadSSRRouterAndGenerateAOTCaches(loadModule, startScript) {
  const prevCompile = process.env.MION_COMPILE;
  process.env.MION_COMPILE = "middleware";
  try {
    const mod = await loadModule(startScript);
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
import { pureFnsCache } from 'virtual:mion-aot/pure-fns';
import { jitFnsCache } from 'virtual:mion-aot/jit-fns';
import { routerCache } from 'virtual:mion-aot/router-cache';
import { addAOTCaches, addRoutesToCache } from '@mionjs/core';

// Auto-register AOT caches as a side effect so they survive tree-shaking
addAOTCaches(jitFnsCache, pureFnsCache);
addRoutesToCache(routerCache);

export { jitFnsCache, pureFnsCache, routerCache };

/** Loads pre-compiled AOT caches (no-op: caches are auto-registered on import). */
export function loadAOTCaches() {}

/** Returns the raw AOT caches. */
export function getRawAOTCaches() {
    return { jitFnsCache, pureFnsCache, routerCache };
}
`;
}
function generateNoopModule(comment) {
  return `/* ${comment} */
`;
}
function waitForPlatformReady(child, timeoutMs = 3e4) {
  return new Promise((resolve2, reject) => {
    const onMessage = (msg) => {
      const message = msg;
      if (message?.type === "mion-platform-ready") {
        clearTimeout(timeoutId);
        child.removeListener("message", onMessage);
        resolve2({ routerConfig: message.routerConfig, platformConfig: message.platformConfig });
      }
    };
    child.on("message", onMessage);
    const timeoutId = setTimeout(() => {
      child.removeListener("message", onMessage);
      reject(
        new Error(
          `Server did not call setPlatformConfig() within ${timeoutMs / 1e3}s. Ensure your platform adapter (startNodeServer, startBunServer, etc.) is called after initMionRouter().`
        )
      );
    }, timeoutMs);
  });
}
function generateNoopCombinedModule() {
  return `/* No-op: AOT caches not generated */
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
export function loadAOTCaches() {}
export function getRawAOTCaches() { return { jitFnsCache, pureFnsCache, routerCache }; }
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
exports.waitForPlatformReady = waitForPlatformReady;
//# sourceMappingURL=aotCacheGenerator.cjs.map
