// Node loader for the resolver WASM — for the playground engine test suite.
// The browser loader (container/website/app/playground/wasmLoader.ts) needs
// document/fetch; this one reads the host-built assets from the git-ignored
// .cache/rt-wasm/ dir, runs Go's wasm_exec.js as a classic script via
// vm.runInThisContext (it defines globalThis.Go), instantiates the module, and
// returns the engine's { versions, dispatch } Resolver shape. Inject it with
// setResolver().
//
// It ALSO injects the mion source overlay the resolver type-checks
// snippets against (the browser fetches runtypes-sources.json; here we build the
// same overlay from packages/run-types/src via the shared builder). Both are
// produced by container/website/scripts/build-playground.mjs on the host; without
// a built AND current WASM the suites skip (assetsBuilt() is false).
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {buildRuntypesOverlay} from '../../../../scripts/website/playground-overlay.mjs';
import {readWasmStamp, wasmInputsDigest} from '../../../../scripts/website/playground-wasm-inputs.mjs';
import {setRuntypesPackageSources, type Resolver} from '../../../../container/website/app/playground/index.ts';

// Host-built WASM assets live in the repo cache dir (build-playground.mjs output).
const CACHE = fileURLToPath(new URL('../../../../.cache/rt-wasm/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
// Named once: wasmAssetState() resolves them against an arbitrary dir so the
// three states can be tested against a fixture, and must not restate them.
const WASM_FILE = 'mion.wasm';
const WASM_EXEC_FILE = 'wasm_exec.js';
const WASM_STAMP_FILE = '.wasm-stamp';
export const WASM_PATH = `${CACHE}${WASM_FILE}`;
export const WASM_EXEC_PATH = `${CACHE}${WASM_EXEC_FILE}`;
export const WASM_STAMP_PATH = `${CACHE}${WASM_STAMP_FILE}`;
// The sidecar hook (the playground's JS engine for pattern sample
// generation). The vite build output is used directly when the staged
// cache copy is absent, so a host that built the sidecar but never ran
// build-playground still exercises the hook lane.
export const SIDECAR_HOOK_PATHS = [
  `${CACHE}sidecar-hook.js`,
  fileURLToPath(new URL('../../../ts-runtypes-go-be-sidecar/dist/sidecar-hook.js', import.meta.url)),
];

// The mion package source tree the overlay is built from.
const RUNTYPES_SRC = fileURLToPath(new URL('../../src/', import.meta.url));

// Three states, not two. Existence alone used to mean "run": a cache left over
// from before a Go change (or carried into a `git worktree add`) loaded fine and
// then failed every assertion about code it predates, which reads as a handful of
// unrelated broken tests rather than a stale artifact. `stale` is that case, and
// it has to behave like `missing` — skip, and say why.
export type WasmAssetState = 'ready' | 'missing' | 'stale';

// cacheDir is a parameter so the states can be tested against a fixture dir.
export function wasmAssetState(cacheDir: string = CACHE, repoRoot: string = REPO_ROOT): WasmAssetState {
  if (!existsSync(`${cacheDir}${WASM_FILE}`) || !existsSync(`${cacheDir}${WASM_EXEC_FILE}`)) return 'missing';
  const stamped = readWasmStamp(`${cacheDir}${WASM_STAMP_FILE}`);
  return stamped && stamped === wasmInputsDigest(repoRoot) ? 'ready' : 'stale';
}

let staleReported = false;

// assetsBuilt reports whether the host WASM build has produced assets that still
// match this tree. A stale cache warns once, naming the command that repairs it.
export function assetsBuilt(): boolean {
  const state = wasmAssetState();
  if (state === 'stale' && !staleReported) {
    staleReported = true;
    console.warn(
      '[playground] skipping: .cache/rt-wasm/ does not match the current Go tree.\n' +
        '[playground] rebuild it with: node container/website/scripts/build-playground.mjs'
    );
  }
  return state === 'ready';
}

// installNodePackageSources injects the mion source overlay from disk, so
// the engine resolves snippets against the real package API (see packageSources.ts).
export function installNodePackageSources(): void {
  setRuntypesPackageSources(buildRuntypesOverlay(RUNTYPES_SRC));
}

interface ResolverGlobals {
  Go?: new () => {run: (instance: WebAssembly.Instance) => Promise<void>; importObject: WebAssembly.Imports};
  __tsRunTypesDispatch?: (requestJSON: string) => string;
  __tsRunTypesOnReady?: (version: string, tsgo: string) => void;
  __tsRunTypesJsEngine?: (requestLineJSON: string) => string;
}

// installSidecarHook runs the sidecar hook (an IIFE classic script, same as
// wasm_exec.js) so the WASM engine routes pattern validation + sample
// generation through it — the exact contract the browser playground uses.
// No-op when already installed; false when no built hook exists on disk.
export function installSidecarHook(): boolean {
  const globals = globalThis as unknown as ResolverGlobals;
  if (typeof globals.__tsRunTypesJsEngine === 'function') return true;
  const built = SIDECAR_HOOK_PATHS.find((path) => existsSync(path));
  if (!built) return false;
  vm.runInThisContext(readFileSync(built, 'utf8'));
  return typeof globals.__tsRunTypesJsEngine === 'function';
}

export async function loadNodeResolver(): Promise<Resolver> {
  // Feed the resolver the real mion sources before the first scan.
  installNodePackageSources();
  // Install the playground's JS engine hook BEFORE the module runs, exactly
  // like the browser loader does (best-effort there; here the suites assert
  // on generation, so a missing hook surfaces in the test itself).
  installSidecarHook();

  const globals = globalThis as unknown as ResolverGlobals;
  if (!globals.Go) vm.runInThisContext(readFileSync(WASM_EXEC_PATH, 'utf8'));
  const Go = globals.Go;
  if (!Go) throw new Error('wasm_exec.js did not define globalThis.Go');

  const go = new Go();
  const ready = new Promise<{version: string; tsgo: string}>((resolve) => {
    globals.__tsRunTypesOnReady = (version, tsgo) => resolve({version, tsgo});
  });

  const {instance} = await WebAssembly.instantiate(readFileSync(WASM_PATH), go.importObject);
  // Do not await - go.run settles only when the Go side exits, and ours blocks
  // forever to keep the dispatch callback alive.
  void go.run(instance);
  const versions = await ready;

  const rawDispatch = globals.__tsRunTypesDispatch;
  if (typeof rawDispatch !== 'function') throw new Error('WASM did not install __tsRunTypesDispatch');

  function dispatch(request: Record<string, unknown>): Record<string, unknown> {
    const parsed = JSON.parse(rawDispatch!(JSON.stringify(request))) as Record<string, unknown>;
    if (parsed.error) throw new Error(`mion: ${String(parsed.error)}`);
    return parsed;
  }

  return {versions, dispatch};
}
