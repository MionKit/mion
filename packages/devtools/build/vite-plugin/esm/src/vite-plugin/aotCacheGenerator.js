import { fork } from "child_process";
import { resolve, dirname } from "path";
import { resolveModule } from "./resolveModule.js";
const IS_TEST_ENV = process.env.VITEST !== void 0 || process.env.NODE_ENV === "test";
const log = IS_TEST_ENV ? () => void 0 : console.log.bind(console);
const DEFAULT_TIMEOUT = 3e4;
async function generateAOTCaches(serverConfig, startScriptOverride, isClient) {
  const persist = serverConfig.runMode === "childProcess";
  const startScript = resolve(startScriptOverride ?? serverConfig.startScript);
  const scriptDir = dirname(startScript);
  const viteConfigArgs = serverConfig.viteConfig ? ["--config", resolve(serverConfig.viteConfig)] : [];
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
      child = fork(viteNodePath, [...viteConfigArgs, startScript, ...serverConfig.args || []], {
        env: {
          ...process.env,
          ...serverConfig.env,
          MION_COMPILE: serverConfig.runMode,
          ...isClient ? { MION_AOT_IS_CLIENT: "true" } : {}
        },
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
        log(`[mion-server] ${msg}`);
      } else if (process.env.DEBUG_AOT && msg) {
        log("[mion-aot] stdout:", msg);
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
async function loadSSRRouterAndGenerateAOTCaches(loadModule, startScript, isClient) {
  const prevCompile = process.env.MION_COMPILE;
  const prevIsClient = process.env.MION_AOT_IS_CLIENT;
  process.env.MION_COMPILE = "middleware";
  if (isClient) process.env.MION_AOT_IS_CLIENT = "true";
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
    if (prevIsClient === void 0) delete process.env.MION_AOT_IS_CLIENT;
    else process.env.MION_AOT_IS_CLIENT = prevIsClient;
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
  log(`[mion]   jitFns: ${jitSize}, pureFns: ${pureSize}, routerCache: ${routerSize}`);
  if (process.env.DEBUG_AOT) {
    log("[mion] AOT jitFns cache:\n", data.jitFnsCode);
    log("[mion] AOT pureFns cache:\n", data.pureFnsCode);
    log("[mion] AOT routerCache:\n", data.routerCacheCode);
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

export const aotCaches = { jitFnsCache, pureFnsCache, routerCache };
export { jitFnsCache, pureFnsCache, routerCache };
`;
}
function generateNoopModule(comment) {
  return `/* ${comment} */
`;
}
function generateDevJitFnsModule() {
  return `/* Dev shim: AOT JIT functions cache backed by globalThis */
const KEY = Symbol.for('mion.jit-fns/v1');
export const jitFnsCache = (globalThis[KEY] ??= {});
`;
}
function generateDevPureFnsModule() {
  return `/* Dev shim: AOT pure functions cache backed by globalThis */
const KEY = Symbol.for('mion.pure-fns/v1');
export const pureFnsCache = (globalThis[KEY] ??= {});
`;
}
function generateDevRouterCacheModule() {
  return `/* Dev shim: AOT router cache backed by globalThis */
const KEY = Symbol.for('mion.persisted-methods/v1');
export const routerCache = (globalThis[KEY] ??= {});
`;
}
function generateDevCombinedCachesModule() {
  return `/* Dev shim: combined AOT caches backed by globalThis */
const JIT_KEY = Symbol.for('mion.jit-fns/v1');
const PURE_KEY = Symbol.for('mion.pure-fns/v1');
const ROUTER_KEY = Symbol.for('mion.persisted-methods/v1');
export const jitFnsCache = (globalThis[JIT_KEY] ??= {});
export const pureFnsCache = (globalThis[PURE_KEY] ??= {});
export const routerCache = (globalThis[ROUTER_KEY] ??= {});
export const aotCaches = { jitFnsCache, pureFnsCache, routerCache };
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
  return `/* No-op AOT caches - AOT not yet generated */
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
export const aotCaches = { jitFnsCache, pureFnsCache, routerCache };
`;
}
export {
  generateAOTCaches,
  generateCombinedCachesModule,
  generateDevCombinedCachesModule,
  generateDevJitFnsModule,
  generateDevPureFnsModule,
  generateDevRouterCacheModule,
  generateJitFnsModule,
  generateNoopCombinedModule,
  generateNoopModule,
  generatePureFnsModule,
  generateRouterCacheModule,
  killPersistentChild,
  loadSSRRouterAndGenerateAOTCaches,
  logAOTCaches,
  waitForPlatformReady
};
//# sourceMappingURL=aotCacheGenerator.js.map
