---
type: fix
spec: guidelines
status: done
created: 2026-10-04
---

# The compile-time benchmark script does not parse

## Intent

`container/benchmarks/compiletime/compiletime.mjs:42` reads:

    if (COMPETITOR !== 'mion's && COMPETITOR !== 'typia') {

`node --check` fails with `SyntaxError: Unexpected identifier 's'`, so the compile-time benchmark cannot run at all. It looks like damage from an old rename sweep that rewrote a word inside a string literal. Nothing in CI parses the bench scripts, so it went unnoticed.

## Direction

- Fix the line (the competitor name the script compares against, check how `--competitor` is passed by its callers).
- Look for the same sweep damage elsewhere: string literals or code broken by a possessive or a renamed word (`git grep "'mion's"`, and `node --check` over every tracked `.mjs` / `.js` outside `_deps/` and `third_party/`).
- Add a guard so a script that does not parse fails CI, for example a contract test that runs `node --check` over the tracked bench and script `.mjs` files. The implementer plans the details.

## Docs

None, because this is a contributor bench script with no page.

## Done when

- `node --check` passes on the file and the benchmark starts.
- A guard fails CI when a tracked `.mjs` script does not parse.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan, automatic run (approved 2026-10-04)

- `compiletime.mjs:42`: `'mion's` back to `'mion'`, the name `bench.mjs` passes as `--competitor`.
- Sweep: `node --check` over every tracked `.js` / `.mjs` / `.cjs` outside `_deps/`, `node_modules/`, `testdata/` and `third_party/`. Only this file failed, and no other `'mion's` literal exists.
- Guard: a new `check-tree.mjs` sweep (`unparsedScripts`), which runs in the always-on `lanes` job, plus a fixture test of `unparsedScriptOffenders` in `repo-contracts.test.ts`.

## Shipped

As planned. The sweep takes about 2 s over 133 files and fails on the old broken line.

Once it parsed, `pnpm miondevx bench compiletime` showed two more breaks in the same script, fixed here too:

- the mion lane loaded `@mionjs/devtools/vite`, whose default export is not the plugin; it now loads `./runtypes/vite`, as the competitor's own `vite.config.ts` does;
- the typia lane resolved TypeScript 7, which has no JavaScript parser API; `resolveTypescript` now skips a copy that fails `hasParserApi` (in `_lib/extract-cases.mjs`) and falls through to the next competitor's.

No CI lane runs this bench, so `repo-contracts.test.ts` pins both: the plugin subpath must match the mion lane's `vite.config.ts` and be a devtools export, and `hasParserApi` must reject a module with no `createSourceFile`.

Both lanes now write their results (mion 255 types, typia 195).
