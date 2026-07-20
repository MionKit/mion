# platform-bun: needs a ts-runtypes injection lane (still on the deepkit pipeline)

**Status:** todo — R2 of [migration-review-findings.md](migration-review-findings.md); interim
mitigation shipped (README warning, root deepkit deps removed), port pending.
**Created:** 2026-07-20

## Problem

`@mionjs/platform-bun` was never migrated: `loader/runtypes-loader.ts` still imports
`@deepkit/type-compiler` and is wired through `bun-preload.ts` + `bunfig.toml` preload.
Under the ts-runtypes system that transform injects metadata nothing consumes — route
registration throws `MissingRtFnsError` (router `lib/reflection.ts`). The package is
invisible to CI (its tests are `bun:test`, not part of any vitest project or `test:ci`
batch), so the green suite never exercised it.

There is currently NO ts-runtypes injection lane for `bun build`/`bun test`: the resolver
is driven through unplugin (vite/rollup/rolldown/esbuild/rspack/webpack); Bun's builder
has its own plugin API.

## Interim state (shipped 2026-07-20)

- README carries a prominent "temporarily unsupported — do not publish" warning.
- Root `package.json` deepkit devDeps + the `deepkit-install` script are deleted. The
  package's OWN `@deepkit/*` devDeps remain so the legacy code stays self-contained until
  the port (delete them with the loader).

## Fix plan

1. Decide the lane: (a) a Bun builder plugin in `@ts-runtypes/devtools` (Bun's plugin API
   supports `onLoad` transforms — the resolver's `transform` op with `transformMode: 'go'`
   fits, since Bun can't apply JS-side edit lists mid-pipeline), or (b) drive `bun build`
   through the ts-runtypes CLI `--compile` batch (overlay emit) and run the emitted output.
2. Port `bun-preload.ts` to spawn/talk to the resolver like the vite plugin's
   resolver-client (or reuse a published helper if upstream ships one).
3. Delete `loader/runtypes-loader.ts` + the deepkit devDeps in
   `packages/platform-bun/package.json`; rewrite `loader/runtypes-loader.test.ts` against
   the new lane.
4. Wire `bunHttp.test.ts` into CI (a dedicated workflow step running `bun test`, since it
   cannot join the vitest projects) so the package can never silently rot again.
5. Remove the README warning.

Upstream candidate: a first-party Bun adapter in ts-runtypes-devtools would serve every
consumer, not just mion — file it there if (a) is chosen.
