---
type: fix
spec: guidelines
status: ready
created: 2026-09-23
---

# mion convert warns when it finds nothing to convert because imports do not resolve

## Intent

`mion convert --to type` (and `--to builders`) changed nothing, wrote an empty `--report`, and exited 0 in a project where the `@mionjs/*` imports did not resolve (no built dist, and a tsconfig without the `source` condition). The user sees a clean run and believes the file is already in the target form.
A run that skips declarations because their imports resolve to nothing should say so, so the user fixes the setup instead of trusting an empty result.

## Direction

The command lives in `ts-go-runtypes/cmd/mion/convert_cli.go` and the conversion in `ts-go-runtypes/internal/convert/`. Reproduce first: a scratch project importing `@mionjs/run-types` (or a drizzle dialect package) that cannot resolve it, then `mion convert <file> --to type --report out.json`.
Likely shape: when a file imports a known marker or builder package and that import resolves to nothing (or to an error type), report a warning diagnostic naming the package, and keep the exit code rule the CLI already documents. The implementer decides the code number, the level, and where the check sits; `mion drizzle-migrate` may share the same blind spot, check it too.
The implementer plans the details.

## Docs

`container/website/content/02.runtypes/02.guide/13.source-conversion.md`, existing section on what the command reports: add the new warning only if it is user visible there. The diagnostics catalog page is generated, so a new code shows up there on its own.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A convert run whose marker imports do not resolve prints a warning that names the package, and a test pins it.
- A normal run in a working project prints nothing new.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
