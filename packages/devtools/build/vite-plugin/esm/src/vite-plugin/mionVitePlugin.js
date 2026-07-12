import path from "node:path";
import { spawn } from "node:child_process";
import tsRuntypes from "@ts-runtypes/devtools/vite";
let legacyOptionsNoticeShown = false;
function resolveRtBinary(explicit) {
  if (explicit) return explicit;
  if (process.env.TS_RUNTYPES_BIN) return process.env.TS_RUNTYPES_BIN;
  return void 0;
}
function mionVitePlugin(options = {}) {
  const rt = options.runTypes ?? {};
  if (!legacyOptionsNoticeShown && (options.serverPureFunctions || options.aotCaches || rt.compilerOptions)) {
    legacyOptionsNoticeShown = true;
    console.warn(
      "[mionVitePlugin] legacy options (serverPureFunctions/aotCaches/runTypes.compilerOptions) are ignored since the ts-runtypes migration. See migration-docs/ at the repo root."
    );
  }
  const plugins = tsRuntypes({
    binary: resolveRtBinary(rt.binary),
    tsconfig: rt.tsConfig,
    outDir: rt.outDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode
  });
  if (!options.server) return plugins;
  const server = options.server;
  const orchestrator = {
    name: "mion-server-orchestrator",
    buildStart() {
      startManagedServer(server);
    }
  };
  return [orchestrator, plugins];
}
let serverReadyResolve;
let serverReadyReject;
let serverStarted = false;
let serverChild;
const serverReady = new Promise((resolve, reject) => {
  serverReadyResolve = resolve;
  serverReadyReject = reject;
});
function startManagedServer(server) {
  if (serverStarted) return;
  serverStarted = true;
  const port = parseInt(server.env?.MION_TEST_PORT ?? process.env.MION_TEST_PORT ?? "8076", 10);
  const waitTimeout = server.waitTimeout ?? 3e4;
  const args = ["exec", "vite-node"];
  if (server.viteConfig) args.push("--config", server.viteConfig);
  args.push(server.startScript);
  const child = spawn("pnpm", args, {
    cwd: server.viteConfig ? path.dirname(server.viteConfig) : path.dirname(server.startScript),
    env: { ...process.env, ...server.env, MION_TEST_SERVER_AUTO_START: "true" },
    stdio: ["ignore", "inherit", "inherit"]
  });
  child.unref();
  serverChild = child;
  const killChild = () => {
    if (serverChild && !serverChild.killed) serverChild.kill("SIGTERM");
  };
  process.once("exit", killChild);
  child.once("error", (err) => {
    serverChild = void 0;
    serverReadyReject?.(new Error(`[mionVitePlugin] failed to spawn managed server: ${err.message}`));
  });
  child.once("exit", (code) => {
    serverChild = void 0;
    if (code && code !== 0) serverReadyReject?.(new Error(`[mionVitePlugin] managed server exited with code ${code}`));
  });
  void waitForPort(port, waitTimeout).then(
    () => serverReadyResolve?.(),
    (err) => {
      killChild();
      serverReadyReject?.(err);
    }
  );
}
async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { method: "GET" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`[mionVitePlugin] managed server did not accept connections on port ${port} within ${timeoutMs}ms`);
}
export {
  mionVitePlugin,
  resolveRtBinary,
  serverReady
};
//# sourceMappingURL=mionVitePlugin.js.map
