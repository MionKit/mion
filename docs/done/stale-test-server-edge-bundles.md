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

Verification: `rm -rf packages/test-server/build packages/test-server/__runtypes*` then `pnpm run test`
→ 54 files / 748 tests, no skips (the 6 previously-skipped edge tests now run). Negative check: drop
`emitMode: 'both'`, rebuild, `--project platform-vercel` fails with `RuntimeCodeGenBlockedError`
naming the fix, not `MissingRtFnsError`.

## Found on the way, NOT fixed here

`pnpm run build` fails on a clean tree — see
[pnpm-build-fails-on-clean-tree.md](../todos/pnpm-build-fails-on-clean-tree.md). Unrelated in cause, but its
fix lands on the `serverMappers` build lane that
[server-mappers-from-generated-pure-fn-cache.md](../todos/server-mappers-from-generated-pure-fn-cache.md) is
currently rewriting, so it waits for that.
