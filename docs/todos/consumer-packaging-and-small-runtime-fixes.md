---
type: fix
spec: guidelines
status: ready
created: 2026-11-02
---

# Consumer-side packaging and small runtime fixes found porting the starters

## Intent

A set of small problems every consumer of the published packages hits. None blocks a port alone, but together they
make a fresh 0.13 app look broken (warnings, hangs, 25 MB production installs). Found while porting the
mion-starters to 0.13.2; investigation in the mion-starters repo, `docs/investigations/mion-0.13-migration/`
(README rows 18-24, repros `repros/thenable-routes.mjs`, `repros/pkgname-path`).

1. **The routes proxy is a thenable.** `await`ing `routes` (returning it from an async function) hangs forever:
   the proxy returns a callable for `then`. A Server Component hung 4.7 minutes with no error.
2. **`package.json` `name` used raw as a path.** It becomes a path segment of generated pure-function modules, so
   an absolute or odd name breaks the build (`UNRESOLVED_IMPORT …/pf//abs/path/…`).
3. **`@mionjs/platform-bun` runtime deps** on `@mionjs/devtools` + `@mionjs/bin-compiler` (25 MB native binary,
   TypeScript and Vite peers in production installs), used only by its preload loader; its `.d.ts` also needs bun
   types without declaring them.
4. **`@mionjs/run-types` sourcemaps** point at unshipped `../src/*.ts` (23 warnings on every dev or vitest start).
5. **Only `.mion/types/` is gitignored**; `.mion/api/` and `.mion/rpc/` would be committed.
6. **`typescript >=6` peer admits TS 7**, whose package no longer exports the JS API `@mionjs/devtools/vite`
   imports.
7. **Dev noise:** the full router options object is logged on every init (dev, build workers, production), and "resolver process died unexpectedly, respawned" prints before the real
   config error (and the final error loses it).

Rechecked on 2026-11-03 against `main` (`85f3488af`): every item is still open. The dev 503 body's ANSI codes moved
to the ESM-only packages todo.

## Direction

The implementer plans the fixes. Verified pointers:

- `packages/rpc-client/src/client.ts:123` (`MethodProxy.handler.get`): `then` (and symbols) should not resolve to a
  route.
- `ts-go-runtypes/internal/compiler/marker/marker.go:822-840` (`lookupPackageUpward`): validate or sanitize.
- `packages/platform-bun/package.json:63-69`, `packages/platform-bun/loader/runtypes-loader.ts`: optional peers or
  a separate subpath; dependency rules in `packages/AGENTS.md`.
- `packages/run-types/package.json` `files` and its `mion compile` build: inline `sourcesContent` or ship no maps.
- `ts-go-runtypes/internal/compiler/resolver/generate.go:172-185` (gitignore written for `types/` only).
- `packages/devtools/package.json` peer range, `packages/devtools/src/vite/buildEntries.ts`.
- `packages/rpc-router/src/router.ts` (`mion router initialized` log), the resolver
  client respawn path.

## Docs

None, because each fix removes a surprise rather than changing documented behaviour; check
`container/website/content/01.rpc/06.platforms/02.bun.md` if the Bun loader moves to its own subpath.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Each item is fixed with its own test where it has behaviour (thenable, package name, gitignore), and a fresh
  Vite app on the packed packages starts with no sourcemap warnings and installs `@mionjs/platform-bun` without the
  compiler.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: approved 2026-11-03

### Changes

1. **Routes proxy is a thenable** — `packages/rpc-client/src/client.ts` `MethodProxy.handler.get`.
   `then` and any symbol key return `undefined`, at every level, so `await routes` / `await routes.users` settle.
   Test: vitest in rpc-client (`typeof routes.then === 'undefined'`, `await routes` resolves to the proxy,
   nested too, middleware proxy too). A route named `then` was already unusable (awaiting it hangs); the router
   gets `then` added to its reserved names check (`packages/rpc-router/src/router.ts` ~357) so it fails loudly. Test there.

2. **Bad package name used as a path** — `ts-go-runtypes/internal/compiler/marker/marker.go` `lookupPackageUpward`.
   A `name` that is not a valid npm name (regex like validate-npm-package-name, uppercase allowed for legacy)
   counts as no name: root still returned, name `""`. Ids then use the hash only, like a nameless package.
   Test: Go unit test in marker (`/abs/path/my-app`, `../x`, `@scope/ok`, `ok`), plus `ModuleName` no longer
   producing `pf//...` for that case.

3. **platform-bun pulls the compiler in production** — `packages/platform-bun/package.json`.
   `loader/` is not shipped (not in `files`, `exports`, or build), so `@mionjs/devtools` + `@mionjs/bin-compiler`
   deps and the `typescript` peer serve nothing published: remove them (root devDeps already supply devtools for
   the package's own preload/tests; add `@mionjs/bin-compiler` to root devDeps if the preload needs it).
   Bun does not bundle its TypeScript types (`bun init` adds `@types/bun`), and the shipped `.d.ts` imports
   `'bun'`: add `@types/bun` as optional peer `*`. Update `packages/AGENTS.md` range-peer list (three → four).
   Check: `pnpm pack` + install in a scratch dir shows no compiler.

4. **run-types sourcemaps point at unshipped src** — add `"inlineSources": true` to
   `packages/run-types/tsconfig.build.json` and `packages/devtools/tsconfig.build.json` (same tsc/`mion compile`
   build, same problem). Verify `mion compile` honours it; if not, fix that in the Go emit (same PR).
   Check: build, `sourcesContent` present in `dist/*.js.map`; fresh Vite app on packed packages logs no map warnings.

5. **Only `.mion/types/` gitignored** — `ts-go-runtypes/internal/compiler/resolver/generate.go`.
   Factor the `.gitignore` + `.npmignore` pair `EnsureOutputHygiene` writes for `types/` into a helper; call it
   for `api/` (`apigen.go` `generateApiBundle`) and `rpc/` (`rpcgen.go` `generateRpc`) after their `MkdirAll`.
   Update the root README text to name `api/` and `rpc/`. Go test: generate with a batch + bundled api,
   both dirs have the two files; prune keeps them (prune touches only `*.js`).

6. **TS 7 breaks `@mionjs/devtools/vite`** — the plugin itself never needs TypeScript's JS API (our Go binary
   compiles). The only user is `collectBuildEntries` (`src/vite/buildEntries.ts`), a helper used only by mion's
   own package `vite.config.ts` files, but `src/vite/index.ts` re-exports it, so `import ts from 'typescript'` runs
   the moment anyone imports the Vite plugin. With TS 7 (no JS API) or no TS installed (the peer is optional),
   the import fails. Fix: devtools stops using TypeScript's JS API; our binary answers instead.
   - Go: add `mion compile --list-files-only` (tsc's `--listFilesOnly` idea): parse the tsconfig with the existing
     `program.ParseInferredConfig(cwd, tsconfig).FileNames()`, print one absolute path per line, exit 0, no build.
     A tsconfig error exits 1 with the same message as today. Go test in `cmd/mion`.
   - TS: `collectBuildEntries` runs it with `execFileSync(getExePath(), ['compile', '--list-files-only',
     '--tsconfig', path, '--cwd', packageDir])` (`@mionjs/bin-compiler`, already a devtools peer) and keeps its
     filtering. Its existing tests (and every package build that uses it) pin the same entry lists.
   - `import ts from 'typescript'` was the ONLY TypeScript use in devtools: drop the `typescript` peer and its
     `peerDependenciesMeta` entry from `packages/devtools/package.json`. Users then pick any TS version.

7. **Dev noise**
   - Router log: no flag or dev check exists to gate it (core has only `isTestEnv()`: `VITEST` or
     `NODE_ENV=test`). Safe to remove: nothing reads the output. Remove
     `console.log('mion router initialized', {routerOptions})` in `router.ts` `initRouter`. Only other mention:
     `packages/rpc-client/test/bundleSplit.spec.ts` uses the string as one of two "router code leaked into the
     client bundle" markers; drop it there, the other marker (`createMionRouter has already been called`) stays.
   - Resolver respawn (`packages/devtools/src/core/resolver-client.ts`): a bad tsconfig makes the child exit
     with code 1 at startup (`program: tsconfig parse failed: ...`, verified). Pipe child stderr, forward it live to
     `process.stderr`, keep a small tail. Respawn only when the child died by a signal (external kill / host race),
     not on a non-zero exit code. The error then reads `resolver exited (code 1): <stderr tail>` (matcher keeps
     treating it as transport loss by prefix). Test: vitest spawning the real binary against a broken tsconfig:
     no "respawned" line, error carries the config message; existing respawn test (kill by signal) still passes.

### Docs

None needed: each fix removes a surprise. `container/website/content/01.rpc/06.platforms/02.bun.md` checked:
it never mentions the loader; add one line that Bun type checking needs `@types/bun` only if the page
has an install step that lacks it (it shows `bun add @mionjs/platform-bun @mionjs/router`).

### Fuzzing

Not a candidate: fix todo.

### Finish

`pnpm run lint`, `pnpm run format`, relevant package tests + `go -C ts-go-runtypes test ./internal/...`,
packed-package smoke (Vite app, bun install). Reconcile spec, `git mv` to `docs/done/`. Review (pr-reviewer),
docs-simplifier + comments-simplifier in parallel, each committed. Rebase on `origin/main`, push, open PR linking
parent session https://claude.ai/code/session_019XsAKr19ziKfbrAuyEiaRT, drive CI green. No merge.
