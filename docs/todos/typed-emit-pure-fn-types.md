---
type: feature
spec: guidelines
status: ready
created: 2026-10-11
---

# Typed emit: keep pure-fn types, printed per node

## Intent

In emitMode 'ts', a pure fn loses every type its author wrote: `(s: string): string => …` ships as
`(s?: any) => …`. The annotations were dropped because they can name the author's own types, which
would need imports from user modules. Instead, every type inside a pure fn should be reprinted as the
type resolved at that node, so a reference to an outside type becomes an inline type and the module
stays self-contained.

## Direction

- Today `createPureFnTS` (`ts-go-runtypes/internal/cachegen/purefunctions/typedcode.go`) runs
  `tsannotate.Function` over the stripped JS body; the original source node is available where the
  body is extracted (`internal/cachegen/purefunctions`).
- Walk the original function's syntax, ask the checker for the type at each annotated node
  (parameters, return, locals, generics, casts), and print it inline with the type printer
  (`internal/convert`, the data-only / reference flags `NewTypeModulePrinter` uses).
- A type the printer cannot express inline (a recursive type) needs a rule: a local alias inside the
  module, or `any` with a warning. The implementer decides.
- The code string and the pure-fn id hash (built from the stripped body) must not change; the
  `mion-pure-fns/` artifact stays JS.
- The tsannotate walk rules apply (`ts-go-runtypes/AGENTS.md`, every-kind coverage test).
- The implementer plans the details.

## Docs

Existing section "Typed Output" in
`container/website/content/02.runtypes/01.introduction/04.configuration.md`: say pure fns keep their types.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A typed pure fn ships with the same types it was written with, outside references inlined, and
  type-checks under the strictest tsconfig with no import from user modules.
- Strip parity with emitMode 'both' still holds; code strings and ids are unchanged.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
