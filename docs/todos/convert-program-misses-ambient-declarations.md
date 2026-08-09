---
type: fix
spec: guidelines
status: ready
created: 2026-08-09
---

# `convert` builds a program without the project's ambient declarations

## Problem

`convert` resolves types against a program whose ROOTS are only the files named
on the command line. Any declaration the project supplies through a `.d.ts` that
nothing imports is therefore invisible, the checker answers `any`, and the
converter writes that `any` into the user's source. Exit code 0, no diagnostic.

    // src/ambient.d.ts  (in the tsconfig's include, imported by nothing)
    declare interface Ambient {a: string; b: number}

    // src/main.ts
    export type UsesAmbient = {value: Ambient};

    $ ts-runtypes convert --to builders src/main.ts
    export const usesAmbientRT = RT.object({value: RT.any()});
    export type UsesAmbient = InferType<typeof usesAmbientRT>;

The same project resolves `Ambient` correctly under `ts-runtypes compile`, which
goes through `program.New` (config-driven, full include set), so this is not the
resolver disagreeing with tsc — it is convert building a smaller program than
the project.

That is the exact failure CNV007 exists to prevent for Temporal: "converting now
would replace the type with any". Temporal is guarded by name; everything else
is not.

## Cause

`cmd/ts-runtypes/convert_cli.go` calls `program.NewInferred(…, absFiles)`, whose
contract is explicit (`compiler/program/program.go`): "the roots are exactly the
caller-supplied fileNames, never the tsconfig's own include set". The parsed
config it threads through (`program.InferredConfig`) carries `CompilerOptions`
only — it does not carry the file list, so convert has nothing to widen the
roots with even if it wanted to.

`enrich` takes the same constructor, and so does the DAEMON path the Vite plugin
runs on (overlay buffers). Whether those two share the hole, and whether an
ambient-declaring project silently degrades in the plugin as well, has NOT been
checked and is the first thing to establish.

## Fix direction

Two independent pieces, both worth doing:

1. **Give the inferred program the project's files as extra roots.** Extend
   `InferredConfig` to carry the parsed file list and pass `fileNames ∪
   project files` as roots. The conversion SET stays the CLI's file list, so
   `BuildSet` / CNV004 semantics do not move — only what the checker can see.
   Measure the cost first: a one-file convert would start parsing the whole
   project, which is why the daemon chose narrow roots to begin with. Loading
   only the `.d.ts` members of the include set may be the right middle ground.
2. **Refuse instead of baking in `any`.** Generalise `temporalAnyDiags`
   (`internal/convert/set.go`) from "a `Temporal.*` reference that resolved to
   any" to "a written type reference that resolved to the ERROR type" — an
   unresolved name, which is what an invisible ambient produces. A genuine
   `type Any = any` alias resolves to the any type, not the error type, so the
   two are distinguishable and the guard does not fire on real `any`. This is
   the safety net that keeps a silent identity change impossible even if the
   program is incomplete for a reason nobody predicted.

## Done when

A project whose types come from an ambient `.d.ts` converts them faithfully, a
declaration whose type cannot be resolved refuses with a diagnostic instead of
converting to `any`, and there is a test for each. The daemon / enrich question
above is answered in writing — either "they share the hole, fixed here too" or
"they do not, because …".
