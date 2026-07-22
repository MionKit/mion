import path from "node:path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
  const legacyRt = rt;
  if (!legacyOptionsNoticeShown && (options.serverPureFunctions || options.aotCaches || rt.compilerOptions || rt.include || rt.exclude || rt.reflectionMode || legacyRt.reflection)) {
    legacyOptionsNoticeShown = true;
    console.warn(
      "[mionVitePlugin] legacy options (serverPureFunctions/aotCaches/runTypes.compilerOptions/include/exclude/reflectionMode) are ignored since the ts-runtypes migration. See docs/ at the repo root."
    );
  }
  if (options.server && options.server.runMode && options.server.runMode !== "childProcess") {
    console.warn(
      `[mionVitePlugin] server.runMode '${options.server.runMode}' is not supported since the ts-runtypes migration — only 'childProcess' exists; the managed server will be spawned as a child process.`
    );
  }
  const manifestPath = resolveManifestPath(options.serverMappers?.emit);
  const harvestedMappers = /* @__PURE__ */ new Map();
  const harvestReport = (sites, phase) => {
    if (phase === "build") harvestedMappers.clear();
    for (const site of sites) {
      if (site.calleeName !== "serverMapFrom" || site.calleeModule !== "@mionjs/client") continue;
      harvestedMappers.set(site.key, {
        key: site.key,
        paramNames: site.paramNames,
        code: site.code,
        pureFnDependencies: site.pureFnDependencies
      });
    }
    writeMapperManifest(manifestPath, harvestedMappers);
  };
  const plugins = tsRuntypes({
    binary: resolveRtBinary(rt.binary),
    tsconfig: rt.tsConfig,
    genDir: rt.genDir ?? rt.outDir,
    emitMode: rt.emitMode,
    moduleMode: rt.moduleMode,
    inlineMode: rt.inlineMode,
    transformMode: rt.transformMode,
    // Strict by default: Error-severity ts-runtypes diagnostics halt the build. The
    // mion run-types adapter no longer trips the scanner (its runtime-key wrappers ride
    // the untracked *ByKey APIs / the raw cache), so consumers get the documented
    // "Error = build must fail" contract. Opt out per package with `failOnError: false`.
    failOnError: rt.failOnError ?? true,
    allowUncheckedPatterns: rt.allowUncheckedPatterns,
    // Pure-fn build report feeds the serverMapFrom transport; in-process only (the
    // mion manifest is the artifact, no need for ts-runtypes' own JSON file).
    ...manifestPath ? { pureFnReport: "callback", onPureFnReport: harvestReport } : {}
  });
  const extraPlugins = [serverMappersConsumePlugin(options.serverMappers?.consume)];
  if (options.server) {
    const server = options.server;
    extraPlugins.unshift({
      name: "mion-server-orchestrator",
      buildStart() {
        startManagedServer(server);
      }
    });
  }
  return extraPlugins.length > 0 ? [...extraPlugins, plugins] : plugins;
}
function resolveManifestPath(emit) {
  if (!emit) return void 0;
  return path.resolve(emit === true ? ".mion/server-mappers.json" : emit);
}
function writeMapperManifest(manifestPath, mappers) {
  const entries = [...mappers.values()].sort((a, b) => a.key < b.key ? -1 : 1);
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(entries, null, 2) + "\n");
}
const SERVER_MAPPERS_ID = "virtual:mion/server-mappers";
const RESOLVED_SERVER_MAPPERS_ID = "\0" + SERVER_MAPPERS_ID;
function serverMappersConsumePlugin(consume) {
  const manifests = (Array.isArray(consume) ? consume : consume ? [consume] : []).map((manifest) => path.resolve(manifest));
  let isBuildCommand = false;
  return {
    name: "mion-server-mappers",
    configResolved(config) {
      isBuildCommand = config?.command === "build";
    },
    resolveId(id) {
      if (id === SERVER_MAPPERS_ID) return RESOLVED_SERVER_MAPPERS_ID;
    },
    load(id) {
      if (id !== RESOLVED_SERVER_MAPPERS_ID) return;
      if (manifests.length === 0) return "export {};";
      if (isBuildCommand) {
        const entries = readMapperManifests(manifests);
        return [
          `import {registerServerMappers} from '@mionjs/core';`,
          `registerServerMappers(${JSON.stringify(entries)});`
        ].join("\n");
      }
      return [
        `import {installServerMapperReader} from '@mionjs/core';`,
        `import {existsSync, readFileSync} from 'node:fs';`,
        `const MANIFESTS = ${JSON.stringify(manifests)};`,
        `installServerMapperReader(() => {`,
        `    const entries = [];`,
        `    for (const manifestPath of MANIFESTS) {`,
        `        if (!existsSync(manifestPath)) continue;`,
        `        try {`,
        `            entries.push(...JSON.parse(readFileSync(manifestPath, 'utf8')));`,
        `        } catch {`,
        `            // partial write: the lazy on-miss re-read retries`,
        `        }`,
        `    }`,
        `    return entries;`,
        `});`
      ].join("\n");
    }
  };
}
function readMapperManifests(manifests) {
  const entries = [];
  for (const manifestPath of manifests) {
    if (!existsSync(manifestPath)) {
      throw new Error(
        `[mionVitePlugin] serverMappers manifest not found at build time: ${manifestPath}. Run the client build (serverMappers.emit) before the server build, or fix the configured path.`
      );
    }
    entries.push(...JSON.parse(readFileSync(manifestPath, "utf8")));
  }
  return entries;
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
