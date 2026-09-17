// Shared identity of the static files the playground fetches from /playground-app/.
//
// Three places have to agree on these names, and once did not: the staging loop in
// container/website/scripts/build-playground.mjs shipped `mion.wasm.gz` while both
// browser consumers asked for `ts-runtypes.wasm.gz` (left over from the ts-runtypes
// to mion rename), so the page rendered and then 404'd on its own engine with
// nothing failing the build. Two consumers share this one list instead:
//   - container/website/scripts/build-playground.mjs stages exactly these files.
//   - scripts/website/check-static.mjs fetches every required one out of the built
//     artifact, so a name that drifts fails the build rather than the page.
// The browser-side literals cannot import it (they are bundled inside the Nuxt
// project root), so a repo-contracts test asserts they match this list.

// The public directory the staged assets are served from, under the site base.
export const PLAYGROUND_DIR = 'playground-app';

// The sidecar hook is the ONE optional asset: without it the playground still
// validates and runs, only pattern mockSample generation degrades to a diagnostic.
export const PLAYGROUND_ASSETS = [
  {file: 'mion.wasm.gz', required: true, what: 'the resolver compiled to wasm (gzipped)'},
  {file: 'wasm_exec.js', required: true, what: "Go's wasm runtime shim"},
  {file: 'runtypes-sources.json', required: true, what: 'the mion source overlay snippets are type-checked against'},
  {file: 'sidecar-hook.js', required: false, what: "the playground's JS engine for pattern generation"},
];

// The absolute public URL the browser fetches one asset from, under a site base.
export const playgroundAssetUrl = (file, base = '/') => `${base.endsWith('/') ? base : `${base}/`}${PLAYGROUND_DIR}/${file}`;
