---
type: fix
spec: guidelines
status: ready
created: 2026-08-31
---

# `pnpm run test:ci` silently skips all 5 runtypes vitest projects

## Intent

`CLAUDE.md` tells contributors that `test:ci` is the safe substitute for a full
run:

> All JS: `pnpm test` (all 21 vitest projects). […] If one full run OOMs,
> `pnpm run test:ci` batches the projects (resolver processes are ~200 MB each).

It does not batch all of them. `test:ci` names 16 projects, every one of them on
the mion side, and never names the five runtypes ones:

```
packages/ts-runtypes/vitest.config.ts
packages/ts-runtypes-devtools/vitest.config.ts
packages/ts-runtypes/test/playground/vitest.config.ts
packages/ts-runtypes-go-be-sidecar/vitest.config.ts
packages/ts-runtypes/test/mock-format-isolation/vitest.config.ts
```

So `test:ci` passes without ever compiling a type function, exercising the Go
resolver through the plugin, or running the playground engine. A contributor who
follows CLAUDE.md on an OOM-prone host gets a green run that proves nothing about
the half of the repo most likely to break.

## Evidence

Found while fixing `docs/todos/unknownkeyerrors-no-object-guard.md`, whose whole
change lives in the `runtypes` project. `pnpm run test:ci` came back green:

```
Test Files  26 passed (26)
Test Files  36 passed (36)
Test Files  11 passed (11)
Test Files  15 passed (15)      # 88 files
```

`pnpm test` on the same tree ran 397 files. The 309 files `test:ci` never
touched include every test of the code that change edits.

Compare the two lists:

```
node -e "const p=require('./package.json');console.log(p.scripts['test:ci'].match(/--project [a-z0-9-]+/g).length)"
# 16, against the 21 projects listed in vitest.config.ts
```

Pre-existing, not introduced by that work: the `test:ci` line has read this way
since it was added.

Note CI itself is not exposed. `release-gate.yml` runs the full `pnpm test`;
`test:ci` is a local/OOM helper only. The damage is to contributors trusting it.

## Direction

The implementer plans it. Worth settling first:

- **Is the omission deliberate?** Check whether the runtypes projects were left
  out because they are the memory-hungry ones and were meant to be run some other
  way. If so the doc is what is wrong, not the script. If not, the batches need
  to cover all 21.
- **Batch sizing.** The resolver processes are ~200 MB each, which is the reason
  batching exists at all, so the runtypes projects probably want a batch of their
  own rather than being appended to an existing one.
- **Stop it drifting again.** 21 projects live in `vitest.config.ts` and the
  batch list is hand-maintained in `package.json`; nothing ties them together.
  A check that every project appears in some batch (a small script, or generating
  the batches from the config) is what keeps this fixed. `pnpm run check:env` is
  the existing shape for "the list is the single source of truth".
- Whatever lands, `CLAUDE.md`'s testing section must end up telling the truth
  about what `test:ci` covers.

## Done when

`pnpm run test:ci` runs every project `pnpm test` runs (or CLAUDE.md accurately
documents a deliberate, named exclusion); something fails when a new project is
added to `vitest.config.ts` without being added to a batch; `pnpm test` and
`go -C ts-go-runtypes test ./internal/...` green.
