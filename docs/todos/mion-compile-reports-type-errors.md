---
type: fix
spec: guidelines
status: ready
created: 2026-10-02
---

# mion compile reports TypeScript type errors

## Intent

`mion compile` emits and exits 0 when the program has TypeScript type errors. Plain `tsc -p` on the
same sources fails. The CLI docs say it works "the way `tsc` does", so a user reads that as "it
typechecks", and a broken package can ship from a green build.

Repro: a strict project with
`overrideValidate<Note>((value) => typeof value === 'string' && value.length <= 20)` (the callback must
be a type guard, `value is Note`). `tsc` reports TS2345; `mion compile` reports nothing.

## Direction

- Decide between: `mion compile` reports TypeScript's own errors and exits non-zero like `tsc`
  (the program is already built in `ts-go-runtypes/internal/compiler/batchcompile/compile.go`, which
  today only gathers mion diagnostics), or the docs say plainly that it does not typecheck and to run
  `tsc --noEmit`. Matching `tsc` is the likely answer, given the docs' promise.
- If it reports them: check what `noEmitOnError` should do, and that the Vite and Next presets are
  not affected (bundlers do not typecheck, and that is fine).
- The implementer plans the details.

## Docs

`container/website/content/01.rpc/07.devtools/04.cli.md`, existing opening section: one sentence on
whether `mion compile` reports type errors.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A Go test in `batchcompile` pins the chosen behaviour with a program holding one type error.
- The CLI page says what `mion compile` does with type errors.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
