---
type: chore
spec: guidelines
status: done
created: 2026-09-01
---

# Rename the default RunTypes output folder from `__runtypes` to `.mion`

## Intent (as filed)

`__runtypes/` was the last consumer-facing piece of the old name, and it holds
two unrelated things under one directory: the machine-generated cache
(`types/`) and the hand-authored, committed enrichment maps (`enriched/`). The
todo asked to move the cache half out of the user's tree, under
`node_modules/.cache/…` or similar, still importable from generated code, and to
give the committed half a name that says what it is.

## What shipped

Only the DEFAULT folder name changed: `__runtypes` became `.mion`. Nothing else
moved. The single `genDir` knob (tsconfig `genDir`, plugin `genDir`, CLI
`--gen-dir`), the `types/` + `enriched/` layout underneath it, the anchor rules
(tsconfig `rootDir`, else the common ancestor of the program's files, else
`baseUrl`, else the working dir) and the `Response.OutDir` echo are as before.

- Go: `outputDirName` (`internal/compiler/resolver/generate.go`) and
  `DefaultGenDirName` (`internal/enrichment/enrichgen/config.go`) are both
  `.mion`; the compile CLI defaults (`cmd/mion/buildconfig.go`,
  `internal/compiler/batchcompile/compile.go`) follow. The output-dir guard now
  also accepts `server-mappers.json` and `server-mappers.generated.js`, because a
  project whose source root is the project root shares `.mion/` with the Vite
  preset's mapper artifacts. Tested in `generate_test.go`.
- JS: `resolveGenDir` (`packages/devtools/src/options.ts`) and the Next broker
  default (`src/runtypes/next/broker.ts`) say `.mion`; the vitest teardown
  sweeper (`scripts/lib/vitest-clean-gendir.ts`) removes only the RunTypes
  halves inside a `.mion/` and keeps the mapper manifests.
- This repo: the per-target genDirs of test-server are `.mion-<target>`, the
  root `.gitignore` ignores `.mion/` and `.mion-*/` repo-wide, the e2e fixtures
  and every clean script use the new name.
- Docs, skills and examples name `.mion`; the configuration page says why a
  dot-folder: tsconfig `include` globs skip it, so the cache never enters the
  program by accident while the enrichment files are still reached through the
  user's own committed imports (the only way they were ever consumed).

Breaking, deliberately without a migration path (decided in the session): an
existing project renames `src/__runtypes` to `src/.mion` (one `git mv`) and drops
its old `__runtypes` ignore line; `types/` regenerates on the next build.

## Why the cache did NOT move to `node_modules/.cache`

The road was spiked on 2026-09-03 with a scratch project (Vite 8.2, Vitest,
Next 16.3 in Turbopack and webpack modes, plain Node 22, `vite build`,
`next build`). Generated code imports the cache through ONE Go helper
(`relUserToType` in `internal/compiler/resolver/relimports.go`) that turns the
virtual `rtmod:/<name>.js` specifier into a relative path, so pointing it at
`node_modules/.cache/mion/types/` is a small change and every host resolved such
a relative import. Freshness after an in-place rewrite of a module (same file
name, new content) is where it fails:

| Host | `node_modules/.cache/mion/types/` | project dot-dir `.mion/types/` |
|---|---|---|
| Vite dev, hot reload | stale, even for a fresh browser | fresh |
| Vite dev + the documented `!**/node_modules/…` ignore glob | stale (no effect on Vite 8) | n/a |
| Vite dev + plugin call `invalidateModule(mod, seen, ts, true)` | fresh | n/a |
| Next dev, Turbopack | fresh | fresh |
| Next dev, webpack | stale (`**/node_modules/**` hard-coded in `watchOptions.ignored`) | fresh |
| `vite build`, `next build`, Vitest, plain Node | fine | fine |

Details that closed the other spellings:

- Vite serves a file under `node_modules` with a `?v=<hash>` query and
  `Cache-Control: max-age=31536000,immutable`, and its watcher ignores
  `**/node_modules/**`; only a timestamped module-graph invalidation from the
  plugin busts both caches. Next's webpack mode has no such hook.
- Node rejects a `node_modules` segment in package.json `imports` targets and a
  bare package name starting with `.`, so a `#mion/*` alias or a `.mion` package
  cannot reach into `node_modules/.cache`. A real `node_modules/@mionjs/gen`
  directory is pruned by installs (yarn removed unlinked entries in the scratch
  app; `node_modules/.cache` survived).
- A plain-Node consumer with a CommonJS-typed package.json needs a
  `{"type":"module"}` stamp in the cache root (Node 22 guessed the syntax, older
  Node will not).
- Module names are `<fnHash>_<typeId>`, so a type edit already renames the file;
  the same-name rewrites that go stale are pure-fn modules, option or enrichment
  changes, and the `types/.rt-stamp` file the Next loader declares as a
  dependency.

So `node_modules/.cache` would have cost new invalidation code in the Vite
adapter, a module-type stamp, and an accepted stale case under Next's webpack
mode, for a folder the user never sees. A project dot-folder gives the same
"nothing to gitignore by hand" result (the generator writes `types/.gitignore`)
with no new machinery, and `.mion/` at the project root was already mion's
folder for the serverMapFrom mapper artifacts.

The split itself (two roots, a renamed and flattened enrichment folder, an
`enrichDir` option) was dropped by decision in the session: keep the behaviour
as it was, one `genDir`, and only make the folder `.mion`.

## Done when (as reconciled)

- The generated cache lives in a self-gitignored dot-folder and nothing asks the
  user to gitignore it. It is still next to the source, not outside the tree.
- The enrichment half keeps its `enriched/` name under `genDir`; the enrich
  CLI, the lint rules and the docs all use the new default root.
- No migration tooling: the docs and the release note tell an existing project
  to rename `__runtypes` to `.mion`.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/...` pass;
  `pnpm miondevx release e2e` is the lane that proves a real consumer install
  still finds its generated modules.

## Plan (approved 2026-09-03)

Rename, anchors unchanged: the two Go constants plus the compile-CLI defaults;
the guard allow-list for the mapper artifacts with a Go test; the JS defaults
(`resolveGenDir`, the Next broker); the teardown sweeper contract and its test;
test-server's per-target genDirs and every clean script; the root and e2e
gitignores; the Go and JS tests pinning the literal; website prose and fence
text (MDC structure untouched, counts verified), examples, skills,
`docs/AI_ENRICHMENT.md`; this spec moved to `docs/done/` and rewritten to what
shipped, with the spike table above recording why `node_modules/.cache` was
rejected. Commit subjects carry `!` so the release changelog marks the break.
