---
type: fix
spec: guidelines
status: done
created: 2026-09-17
---

# The Playground Never Loads Its WASM Engine

## Intent

The docs site playground page renders, but it cannot build or run anything: the
file it fetches for the compiled resolver does not exist under that name.

The build script stages the resolver as `mion.wasm.gz`:

```js
// container/website/scripts/build-playground.mjs:247
[RAW_GZ, join(OUT_DIR, 'mion.wasm.gz')],
```

Both consumers ask for `ts-runtypes.wasm.gz`:

```ts
// container/website/app/playground/wasmLoader.ts:54
const DEFAULT_WASM_URL = '/playground-app/ts-runtypes.wasm.gz';
// container/website/app/components/playground/PlaygroundStage.client.vue:276
wasmUrl: `${base}playground-app/ts-runtypes.wasm.gz`,
```

The script's own header comment at line 4 also says `ts-runtypes.wasm.gz`, so
the staging line is what drifted, left over from the ts-runtypes to mion package
rename.

Verified live in a real browser against the dev container
(`pnpm miondevx website dev --agent`, then `/runtypes/playground`): the page
renders and the operation picker works, but the console reports

```
failed to fetch /playground-app/ts-runtypes.wasm.gz: 404
wasm streaming compile failed: TypeError: WebAssembly compilation aborted
```

and the WASM never instantiates. Present on `main`, so it is not new.

## Direction

Pick ONE filename and use it in all three places. `mion.wasm.gz` matches the
current package naming and is what the script already produces, so renaming the
two consumers is probably the smaller change, but check first whether anything
else (a deploy step, a cache key, the Cloudflare Pages upload) names either
spelling before choosing. The implementer plans the details.

Worth checking while in there: the staging loop warns and continues when a
source file is missing, which is how this stayed quiet. A missing or
never-fetched playground asset should fail the website build rather than ship a
page that cannot work.

## Done when

- The playground page loads its WASM engine with no console error, and actually
  compiles and runs an operation end to end, confirmed in a browser against the
  dev container rather than by reading the code.
- One spelling of the filename across the build script, both consumers and the
  script's header comment.
- A check that would have caught it: either the website build fails on a missing
  or unfetchable playground asset, or a test asserts the staged filename matches
  the one the loader requests.

## Plan (approved 2026-09-17)

One spelling, and the names stop living in four unrelated literals.

`mion.wasm.gz` wins: the build cache, the Node test resolver
(`packages/run-types/test/playground/nodeResolver.ts`) and SETUP.md already use
it, and nothing else in the tree (deploy step, Cloudflare upload, the
`cache-playground-wasm` action's key) names either spelling. So the two
consumers and the script's header comment move.

1. **A shared manifest**, `scripts/website/playground-assets.mjs`, listing the
   files staged into `public/playground-app/` and which of them the page cannot
   work without (the sidecar hook is the one optional asset: without it pattern
   generation degrades, the page still runs). Same pattern as the existing
   `playground-wasm-inputs.mjs`.
2. **`build-playground.mjs` stages FROM the manifest** instead of its own
   literals, and its header comment names `mion.wasm.gz`.
3. **Both consumers fetch `mion.wasm.gz`** (`wasmLoader.ts`,
   `PlaygroundStage.client.vue`).
4. **The build gate:** `scripts/website/check-static.mjs`, which already serves
   the built artifact and proves every benchmark component's runtime data
   shipped, gains the same check for the playground: `/runtypes/playground`
   prerendered with its component shell, and every required asset answering
   over HTTP. That is the right place rather than `stage()`, which warns and
   continues on purpose so a host with no Go toolchain can still build the site.
5. **The test:** `packages/devtools/test/repo-contracts.test.ts` (which already
   pins check-static contracts) asserts every `playground-app/<file>` URL in
   both consumers is a file the manifest stages, and that every staged file is
   fetched by someone. A rename on either side fails it.

Also folded in, same drift, same files: three comments and one user-facing error
message still point at `build-playground.sh`, which became `.mjs`.

## What shipped

All of the above, as planned. `mion.wasm.gz` is now the one spelling.

Verified in a real browser (playwright-core against the dev container on port
3100): all four `/playground-app/` assets answer 200, no wasm error in the
console, and the playground compiled a validator for its seed type and ran it,
`validate` returning `true` and `errors` returning "valid, no errors" in 510 ms.

The contract test was checked against the original bug: pointing the loader back
at `ts-runtypes.wasm.gz` fails it with

```
container/website/app/playground/wasmLoader.ts fetches ts-runtypes.wasm.gz, which nothing stages
```
