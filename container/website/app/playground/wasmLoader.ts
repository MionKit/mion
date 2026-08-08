// Browser loader for the ts-runtypes resolver compiled to WebAssembly.
//
// The .wasm + Go's wasm_exec.js shim are package assets (built by
// scripts/build-wasm.sh). A bundler resolves their URLs via `new URL(…,
// import.meta.url)`; consumers can override both through ResolverOptions (e.g.
// when serving the assets from a CDN). wasm_exec.js is a classic script that
// defines `globalThis.Go`, so it is injected by URL rather than imported.

export interface ResolverVersions {
  version: string;
  tsgo: string;
}

export interface Resolver {
  versions: ResolverVersions;
  dispatch: (request: Record<string, unknown>) => Record<string, unknown>;
}

export interface ResolverOptions {
  wasmUrl?: string | URL;
  wasmExecUrl?: string | URL;
  sidecarHookUrl?: string | URL;
}

interface GoRuntime {
  run: (instance: WebAssembly.Instance) => Promise<void>;
  importObject: WebAssembly.Imports;
}

type GoConstructor = new () => GoRuntime;

interface ResolverGlobals {
  Go?: GoConstructor;
  __tsRunTypesDispatch?: (requestJSON: string) => string;
  __tsRunTypesOnReady?: (version: string, tsgo: string) => void;
  __tsRunTypesJsEngine?: (requestLineJSON: string) => string;
}

function globals(): ResolverGlobals {
  return globalThis as unknown as ResolverGlobals;
}

// The resolver ships gzip-compressed: Go wasm is ~37 MiB raw but ~8 MiB gzipped,
// which keeps the deployed file under static-host per-file caps (e.g. Cloudflare
// Pages' 25 MiB limit) and cuts the download ~4.5x. The browser inflates it (see
// fetchWasmBytes). The site's host-side build (container/website/scripts/build-playground.mjs)
// produces both the raw .wasm (used by the Node test resolver) and this .gz.
//
// The defaults are ABSOLUTE public URLs, never `new URL(..., import.meta.url)`:
// the assets are host-staged into public/playground-app/ and fetched at runtime,
// so the bundler must NOT treat them as module assets (it would try to bundle the
// ~37 MiB file). A host mounted under a non-root base overrides these via
// ResolverOptions (the Vue component joins them onto the app baseURL).
const DEFAULT_WASM_URL = '/playground-app/ts-runtypes.wasm.gz';
const DEFAULT_WASM_EXEC_URL = '/playground-app/wasm_exec.js';
const DEFAULT_SIDECAR_HOOK_URL = '/playground-app/sidecar-hook.js';

let loaderPromise: Promise<Resolver> | null = null;

// Fetch the wasm and inflate it when it is gzip-compressed. Detect by the gzip
// magic (0x1f 0x8b) rather than the URL, so it is robust to a host that
// transparently decodes a .gz response via Content-Encoding (the browser then
// hands us the already-inflated bytes) AND to a plain .wasm URL override, both
// pass through untouched.
async function fetchWasmBytes(url: string): Promise<BufferSource> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.length < 2 || raw[0] !== 0x1f || raw[1] !== 0x8b || typeof DecompressionStream === 'undefined') return raw;
  const inflated = new Response(raw).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Response(inflated).arrayBuffer();
}

// loadScriptOnce injects a classic script exactly once, keyed by a data
// attribute; `installed` short-circuits when the global the script defines
// is already present (an earlier loader run, or SSR hydration re-entry).
function loadScriptOnce(src: string, dataKey: string, installed: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (installed()) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[data-${dataKey}]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute(`data-${dataKey}`, 'true');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
    document.head.appendChild(script);
  });
}

// loadResolver returns { versions, dispatch }, instantiating the module on the
// first call and reusing it thereafter (shared promise).
export function loadResolver(options: ResolverOptions = {}): Promise<Resolver> {
  if (loaderPromise) return loaderPromise;

  const wasmUrl = String(options.wasmUrl ?? DEFAULT_WASM_URL);
  const wasmExecUrl = String(options.wasmExecUrl ?? DEFAULT_WASM_EXEC_URL);
  const sidecarHookUrl = String(options.sidecarHookUrl ?? DEFAULT_SIDECAR_HOOK_URL);

  loaderPromise = (async (): Promise<Resolver> => {
    await loadScriptOnce(wasmExecUrl, 'rt-wasm-exec', () => !!globals().Go);
    // The sidecar hook makes the playground the resolver's JS engine, so
    // pattern mockSample generation runs in the browser with native parity.
    // Best-effort BEFORE instantiation (the WASM checks the global per
    // call): without it the playground still validates patterns via the
    // host RegExp, and generation degrades to the declare-mockSamples
    // diagnostic.
    try {
      await loadScriptOnce(sidecarHookUrl, 'rt-sidecar-hook', () => typeof globals().__tsRunTypesJsEngine === 'function');
    } catch (hookError) {
      console.warn('ts-runtypes playground: sidecar hook failed to load; pattern sample generation is disabled.', hookError);
    }
    const Go = globals().Go;
    if (!Go) throw new Error('wasm_exec.js did not define globalThis.Go');

    const go = new Go();
    const ready = new Promise<ResolverVersions>((resolve) => {
      globals().__tsRunTypesOnReady = (version, tsgo) => resolve({version, tsgo});
    });

    const bytes = await fetchWasmBytes(wasmUrl);
    const {instance} = await WebAssembly.instantiate(bytes, go.importObject);

    // Do not await: go.run resolves only when the Go side exits, and ours
    // blocks forever to keep the callback alive.
    void go.run(instance);
    const versions = await ready;

    const rawDispatch = globals().__tsRunTypesDispatch;
    if (typeof rawDispatch !== 'function') throw new Error('WASM did not install __tsRunTypesDispatch');

    function dispatch(request: Record<string, unknown>): Record<string, unknown> {
      const parsed = JSON.parse(rawDispatch!(JSON.stringify(request))) as Record<string, unknown>;
      if (parsed.error) throw new Error(`ts-runtypes: ${String(parsed.error)}`);
      return parsed;
    }

    return {versions, dispatch};
  })();

  loaderPromise.catch(() => {
    loaderPromise = null;
  });
  return loaderPromise;
}
