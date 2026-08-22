# The committed `packages/test-server/build/*` bundles are stale, and a fresh build of them fails

**Status:** done — fixed in this commit. The bundles are no longer committed; both suites build their
own in a vitest globalSetup.
**Created:** 2026-08-21

## What it actually was

**Not** what the original spec concluded. It claimed the `route()` call sites in
`src/test-server-edge.ts` were "not injected", and pointed at `@ts-runtypes/devtools` declining to
rewrite them. That was wrong for the tree it was filed against — or was fixed between filing and now
(most likely by `4273156 fix(devtools)!: retire virtual:mion/server-mappers`, which repaired the
generated-module lane). Instrumenting `unplugin.js` and watching a full edge build shows the opposite
at every step:

- `siteFiles` contains `src/test-server-edge.ts` → `inSiteSet: true`
- the resolver returns 12 sites and 3 edits for the file
- `applyEdits` applies all 3, and the bundle really does contain
  `route((ctx, user) => {…}, void 0, [__rt_nPZ_qy4g6UQ, …], [__rt_nPZ_tvDFvZt, …], __rt_qy4g6UQ, __rt_tvDFvZt)`

Injection was never the problem. The original evidence (`grep 'const changeUserName = route('`) only
ever looked at the line the call _opens_ on — the injected arguments land on the line that closes it.

### The real root cause: edge runtimes forbid `new Function`

Running the freshly built bundle under miniflare and printing the whole error, rather than the
truncated response body the spec quoted:

```
MissingRtFnsError: Route/middleFn "mion@methodsMetadata" has no build-time type information.
Cause: Code generation from strings disallowed for this context
```

mion's default `emitMode: 'code'` ships each compiled fn as a **source string**;
`@ts-runtypes/core` turns it into a real function with `new Function` on first use
(`rtUtils.js:187,193` — `materializeRTFn` / `initPureFunction`). workerd and Vercel's EdgeVM refuse
that, so `initMionRouter` dies on the first route it registers.

`emitMode: 'both'` emits the live factory alongside the code string — verified: generated modules gain
a `function g_nPZ_qy4g6UQ(utl){…}` slot and the `pf/` modules gain theirs, so nothing is compiled at
runtime (a faster cold start too). The code string stays in the bundle because the methods-metadata
route serializes it to mion clients, which is also why `emitMode: 'functions'` remains unsupported.
Cost: 311 → 409 KB raw, 62.8 → 72.8 KB gzipped.

The committed bundles passed only because they were deepkit-era artifacts (`__assignType`,
`grep -c __rt_` → 0), whose fns came from a mechanism that no longer exists.

**This was a product bug, not a fixture bug.** No mion app could run on Cloudflare Workers or Vercel
Edge, and `website/content/6.platforms/5.cloudflare.md` asserted the opposite: _"mion never generates
code at runtime on the edge … no special AOT step is required."_

## What shipped

1. **`emitMode: 'both'`** on `vite.edge.config.ts` and `vite.cloudflare.config.ts`.
2. **A separate `genDir` per bundle** (`__runtypes-edge`, `__runtypes-cloudflare`). The package's three
   builds shared one `__runtypes/` and now disagree on `emitMode`; under the vitest workspace they run
   concurrently and the last writer won, so a bundle could be rolled up against another build's
   generated modules. The dirs are siblings, not children, of `__runtypes/`: that dir is the node
   build's own genDir and RunTypes refuses to generate into a genDir holding entries it did not write.
3. **`RuntimeCodeGenBlockedError`** (`packages/router/src/lib/reflection.ts`). Every failure used to
   funnel into `MissingRtFnsError` → _"make sure mionVitePlugin is active"_, which is actively
   misleading when the plugin **was** active and the fns **were** injected. The cause is now
   classified (`/code generation from strings|unsafe-eval/i`) and the message names `emitMode: 'both'`.
   Covered by `packages/router/src/lib/reflection.spec.ts`. This is the "`failOnError`-style
   diagnostic" the original spec asked for, on the runtime side where the evidence is.
4. **The bundles are generated, not committed** (original fix-plan steps 2 & 3). They inline the whole
   framework, so a committed copy can only ever freeze whatever the engine emitted that day — exactly
   how these suites ended up validating a pre-migration artifact. `buildTestBundle.ts` +
   a `globalSetup` in each of `platform-cloudflare` / `platform-vercel` rebuilds them per run;
   `packages/test-server/build/` is untracked and gitignored. A "rebuild produces no diff" CI check
   was rejected as the guard: the ts-runtypes binary version is folded into every typeId, so a version
   bump would redden unrelated PRs.
5. **Docs corrected** — the Cloudflare caution rewritten, a matching one added to the Vercel page, the
   `emitMode` line annotated in the devtools reference, and the plugin's own `emitMode` JSDoc expanded.
6. **Resolution pinned to the `source` condition**, replacing the `resolve.alias` maps — see below.

## A second, bigger bug the emitMode fix exposed: the bundles inlined `.dist`

Both configs aliased each `@mionjs/*` to its package **directory**. An alias to a directory resolves
through that package's `package.json`, so the moment a sibling `.dist` existed — i.e. for anyone who
had run `pnpm run build` — the bundle silently inlined **built** output instead of source. That output
is compiled with the default `emitMode: 'code'`, so its fns need `new Function`, and the whole
emitMode fix above applied only to test-server's own three routes. Everything else in the bundle —
all of `@mionjs/core` and `@mionjs/router` — went back to being un-runnable on the edge.

It surfaced the first time the full suite ran _after_ a `pnpm run build` in the same tree: 174 modules
in the edge bundle came from `core/.dist/esm/**`, and the edge specs failed with the very
`RuntimeCodeGenBlockedError` added in point 3. Every green run before that was green only because
`.dist` did not exist yet.

Worth noting against the original spec, which listed _"`resolve.alias` vs the `source` condition —
replacing the alias map with `resolve.conditions: ['source']` changes nothing"_ under **Ruled out**.
That was true when it was measured, and wrong as a conclusion: it was measured in a tree with no
`.dist`, which is the only state where the two are equivalent.

Fixed by using `resolve: {conditions: ['source']}` + the matching `ssr` block, exactly like every
other config in the repo — resolution no longer depends on whether anyone has built. Guarded by
`assertBuiltFromSource` in `buildTestBundle.ts`, which reads the emitted sourcemap and fails the run
if any `/.dist/` module was inlined. The specs alone were not enough of a guard: they only catch it for
whoever happens to build first, which is the same ordering trap as everything else here. Verified by
restoring the alias map — the guard fires with the offending module named.

## Verification

Both orderings, because order-independence is the actual property at stake:

- clean tree (`rm -rf packages/*/.dist packages/test-server/build packages/test-server/__runtypes*
packages/client/.mion`) → `pnpm run test` 57 files / 785 tests, no skips (the 6 previously-skipped
  edge tests now run), and `pnpm run build` exits 0.
- after a full `pnpm run build`, so every sibling `.dist` exists → `pnpm run test` green again. This is
  the ordering that was red before point 6.

Negative checks, both confirmed to fail as intended: dropping `emitMode: 'both'` makes
`--project platform-vercel` fail with `RuntimeCodeGenBlockedError` naming the fix rather than
`MissingRtFnsError`; restoring the alias map trips `assertBuiltFromSource`.

## Found on the way, NOT fixed here

`pnpm run build` failed on a clean tree — unrelated in cause, but its fix landed on the
`serverMappers` build lane that
[server-mappers-from-generated-pure-fn-cache.md](server-mappers-from-generated-pure-fn-cache.md) was
rewriting at the time, so it waited for that to merge. Fixed in this same PR once it did — see
[pnpm-build-fails-on-clean-tree.md](pnpm-build-fails-on-clean-tree.md).
