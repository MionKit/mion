---
type: fix
spec: guidelines
status: ready
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
