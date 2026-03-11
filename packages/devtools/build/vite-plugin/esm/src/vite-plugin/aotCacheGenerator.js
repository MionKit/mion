import { fork } from "child_process";
import { resolve, dirname } from "path";
import { resolveModule } from "./resolveModule.js";
const DEFAULT_TIMEOUT = 3e4;
async function generateAOTCaches(options, startScriptOverride) {
  const startScript = resolve(startScriptOverride ?? options.startServerScript);
  const scriptDir = dirname(startScript);
  const viteConfigArgs = options.serverViteConfig ? ["--config", resolve(options.serverViteConfig)] : [];
  let viteNodePath;
  try {
    viteNodePath = await resolveModule("vite-node/cli", scriptDir);
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
      child = fork(viteNodePath, [...viteConfigArgs, startScript], {
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
    const cleanup = () => {
      clearTimeout(timeoutId);
      if (child.connected) child.disconnect();
      child.kill();
    };
    child.on("message", (msg) => {
      const message = msg;
      if (message?.type === "mion-aot-caches") {
        resolved = true;
        cleanup();
        resolvePromise({
          jitFnsCode: message.jitFnsCode,
          pureFnsCode: message.pureFnsCode,
          routerCacheCode: message.routerCacheCode
        });
      }
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.stdout?.on("data", (data) => {
      if (process.env.DEBUG_AOT) {
        console.log("[mion-aot] stdout:", data.toString());
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
        reject(
          new Error(
            `AOT cache generation timed out (${DEFAULT_TIMEOUT / 1e3}s). Make sure the server start script completes initialization.`
          )
        );
      }
    }, DEFAULT_TIMEOUT);
  });
}
async function generateSSRAOTCaches(loadModule, startServerScript) {
  const prevCompile = process.env.MION_COMPILE;
  process.env.MION_COMPILE = "true";
  const originalSend = process.send;
  let resolveCapture;
  const capturePromise = new Promise((resolve2) => {
    resolveCapture = resolve2;
  });
  process.send = (msg) => {
    if (msg?.type === "mion-aot-caches") {
      resolveCapture({
        jitFnsCode: msg.jitFnsCode,
        pureFnsCode: msg.pureFnsCode,
        routerCacheCode: msg.routerCacheCode
      });
    }
  };
  let timeoutId;
  try {
    await loadModule(startServerScript);
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(
          new Error(
            `SSR AOT cache generation timed out (${DEFAULT_TIMEOUT / 1e3}s). Make sure the startServerScript calls initMionRouter() and awaits it.`
          )
        ),
        DEFAULT_TIMEOUT
      );
    });
    return await Promise.race([capturePromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
    if (originalSend) process.send = originalSend;
    else delete process.send;
    if (prevCompile === void 0) delete process.env.MION_COMPILE;
    else process.env.MION_COMPILE = prevCompile;
  }
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
function generateNoopCombinedModule() {
  return `/* No-op: AOT caches not generated */
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
`;
}
export {
  generateAOTCaches,
  generateCombinedCachesModule,
  generateJitFnsModule,
  generateNoopCombinedModule,
  generateNoopModule,
  generatePureFnsModule,
  generateRouterCacheModule,
  generateSSRAOTCaches,
  logAOTCaches
};
//# sourceMappingURL=aotCacheGenerator.js.map
