// The ts-runtypes source overlay the WASM resolver type-checks user snippets
// against: an INJECTED input, not a self-resolving `import.meta.glob`.
//
// The overlay is a `{ virtualPath -> content }` map that stages the REAL
// ts-runtypes package sources onto the resolver's virtual disk as a
// `node_modules/ts-runtypes/` tree, so a snippet resolves against the ACTUAL
// public API (the markers, every `createX` overload, the builder
// machinery) instead of a hand-maintained approximation. Feeding the real types
// is what makes a builder snippet resolve to the SAME structural id
// as its type-first equivalent (e.g. `optional(boolean())` projects an OPTIONAL
// property, not a required `boolean | undefined`).
//
// Why injected rather than a glob: the engine runs in two hosts with different
// filesystem shapes. In the browser (bundled by the Nuxt site, possibly inside
// the Node-only container where `packages/` is a separate read-only mount) a
// relative glob into `packages/run-types/src` cannot resolve, so the site
// fetches a host-prebuilt `runtypes-sources.json` and calls
// `setRuntypesPackageSources` with it. In the Node test suite the resolver
// loader reads `packages/run-types/src` from disk and injects the same map.
// The single builder that produces this overlay from a source dir lives in
// scripts/website/playground-overlay.mjs (used by both the site build and the tests).

export type PackageSourcesOverlay = Record<string, string>;

let overlay: PackageSourcesOverlay | null = null;

// setRuntypesPackageSources installs the overlay the engine feeds to the
// resolver on every scan. Call it once before the first resolve.
export function setRuntypesPackageSources(next: PackageSourcesOverlay): void {
  overlay = next;
}

// runtypesPackageSources returns the installed overlay. Throws if the host never
// injected it: a loud failure beats silently type-checking against nothing (an
// empty overlay makes every snippet fail with unresolved `ts-runtypes` imports).
export function runtypesPackageSources(): PackageSourcesOverlay {
  if (!overlay) {
    throw new Error(
      'ts-runtypes package sources not provided — call setRuntypesPackageSources() ' +
        '(the site fetches /playground-app/runtypes-sources.json; tests read packages/run-types/src) before resolving.'
    );
  }
  return overlay;
}
