---
type: fix
spec: guidelines
status: ready
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
