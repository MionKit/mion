import path from "node:path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import tsRuntypes from "@ts-runtypes/devtools/vite";
let legacyBinEnvNoticeShown = false;
const REMOVED_PLUGIN_OPTIONS = {
  aotCaches: "AOT caches are obsolete — the ts-runtypes generated modules ARE the compiled artifact. Delete this option.",
  serverPureFunctions: "pure-fn extraction moved to the serverMapFrom transport. Use `serverMappers: {emit}` on the client build and `serverMappers: {consume}` on the server build."
};
const REMOVED_RUNTYPES_OPTIONS = {
  compilerOptions: "the deepkit type-compiler is gone; there is nothing to configure. Delete this option.",
  include: "scan scope comes from the tsconfig program — narrow `include` in the tsconfig instead.",
  exclude: "scan scope comes from the tsconfig program — narrow `exclude` in the tsconfig instead.",
  reflectionMode: "deepkit reflection is gone; types are resolved at build time and always compiled. Delete this option.",
  reflection: "deepkit reflection is gone; types are resolved at build time and always compiled. Delete this option."
};
function assertNoRemovedOptions(options) {
  const found = [];
  const root = options;
  for (const [key, hint] of Object.entries(REMOVED_PLUGIN_OPTIONS)) {
    if (root[key] !== void 0) found.push(`  - ${key}: ${hint}`);
  }
  const rt = options.runTypes ?? {};
  for (const [key, hint] of Object.entries(REMOVED_RUNTYPES_OPTIONS)) {
    if (rt[key] !== void 0) found.push(`  - runTypes.${key}: ${hint}`);
  }
  if (found.length === 0) return;
  throw new Error(
    `[mionVitePlugin] removed option${found.length > 1 ? "s" : ""} in your config (they stopped doing anything at the ts-runtypes migration and are now gone):
${found.join("\n")}`
  );
}
function resolveRtBinary(explicit) {
  if (explicit) return explicit;
  if (process.env.TS_RUNTYPES_BIN && !process.env.RT_BIN && !legacyBinEnvNoticeShown) {
    legacyBinEnvNoticeShown = true;
    console.warn(
      "[mion] TS_RUNTYPES_BIN is no longer read and is being IGNORED. Use RT_BIN instead — it is honoured by @ts-runtypes/bin for both the vite transform and the ESLint lane, so they cannot end up on different binaries (whose typeIds would diverge)."
    );
  }
  return void 0;
}
function mionVitePlugin(options = {}) {
  const rt = options.runTypes ?? {};
  assertNoRemovedOptions(options);
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
  if (rt.emitMode === "functions") {
    throw new Error(
      `[mion] emitMode: 'functions' is not supported. mion serializes compiled fns to the client as code strings, and 'functions' omits the code, so every client would fail on first validate. Use 'code' (default) or 'both'.`
    );
  }
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
    patternSampleCount: rt.patternSampleCount,
    patternSampleRetries: rt.patternSampleRetries,
    jsRuntime: rt.jsRuntime,
    // Pure-fn build report feeds the serverMapFrom transport; in-process only (the
    // mion manifest is the artifact, no need for ts-runtypes' own JSON file).
    ...manifestPath ? { pureFnReport: "callback", onPureFnReport: harvestReport } : {}
  });
  const extraPlugins = [];
  if (options.serverMappers?.consume) extraPlugins.push(serverMappersConsumePlugin(options.serverMappers.consume));
  if (options.server) {
    const server = options.server;
    extraPlugins.unshift({
      name: "mion-server-orchestrator",
      buildStart() {
        startManagedServer(server);
      }
    });
  }
  return [...extraPlugins, plugins];
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
const GENERATED_MAPPERS_FILE = "server-mappers.generated.js";
const ROUTER_INIT_IMPORT = /import\s*\{[^}]*\binitMionRouter\b[^}]*\}\s*from\s*['"]@mionjs\/router['"]/;
function serverMappersConsumePlugin(consume) {
  const manifests = (Array.isArray(consume) ? consume : [consume]).map((manifest) => path.resolve(manifest));
  let isBuildCommand = false;
  let generatedFile = "";
  return {
    name: "mion-server-mappers",
    configResolved(config) {
      isBuildCommand = config.command === "build";
      generatedFile = path.resolve(config.root, ".mion", GENERATED_MAPPERS_FILE);
    },
    buildStart() {
      mkdirSync(path.dirname(generatedFile), { recursive: true });
      writeFileSync(generatedFile, renderMappersModule(manifests, isBuildCommand));
    },
    transform(code, id) {
      if (id === generatedFile || id.includes("node_modules")) return;
      if (!ROUTER_INIT_IMPORT.test(code)) return;
      const from = path.relative(path.dirname(id), generatedFile).split(path.sep).join("/");
      const specifier = from.startsWith(".") ? from : `./${from}`;
      return { code: `import '${specifier}';
${code}`, map: null };
    }
  };
}
function renderMappersModule(manifests, isBuildCommand) {
  const header = "// GENERATED by @mionjs/devtools — serverMapFrom transport. Do not edit.\n";
  if (isBuildCommand) {
    const entries = readMapperManifests(manifests);
    return header + [
      `import {registerServerMappers} from '@mionjs/core';`,
      `registerServerMappers(${JSON.stringify(entries)});`,
      ""
    ].join("\n");
  }
  return header + [
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
    `});`,
    ""
  ].join("\n");
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
function resolveViteNodeCli() {
  const manifestPath = createRequire(import.meta.url).resolve("vite-node/package.json");
  const bin = JSON.parse(readFileSync(manifestPath, "utf8")).bin;
  const relative = typeof bin === "string" ? bin : bin?.["vite-node"];
  if (!relative) throw new Error("[mionVitePlugin] vite-node is installed but declares no `vite-node` bin.");
  return path.resolve(path.dirname(manifestPath), relative);
}
function startManagedServer(server) {
  if (serverStarted) return;
  serverStarted = true;
  const port = parseInt(server.env?.MION_TEST_PORT ?? process.env.MION_TEST_PORT ?? "8076", 10);
  const waitTimeout = server.waitTimeout ?? 3e4;
  const args = [resolveViteNodeCli()];
  if (server.viteConfig) args.push("--config", server.viteConfig);
  args.push(server.startScript);
  const child = spawn(process.execPath, args, {
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
