---
type: chore
spec: guidelines
status: ready
created: 2026-09-01
---

# Retire the RT_ env prefix, and drop it from the docs examples

## Intent

`RT_` is the last visible piece of the old ts-runtypes identity. 1,079 sites
across 150 files still carry it: `RT_SITE`, the whole `RT_WEBSITE_*` and
`RT_BENCH_*` families, `RT_BIN`, `RT_COMPILETIME_*`, `RT_FUZZ_*`.

Two separate things are wanted, and only the second is a rename:

1. **The examples should not mention the env vars at all.** The docs should show
   naked imports and the plain CLI, not knobs a reader has to understand. An env
   var that only a contributor would set does not belong in consumer-facing
   docs (the Website docs style rule in CLAUDE.md already says this).
2. **The prefix itself** should follow the package onto a mion-owned name.

Kept out of the namespace migration on purpose: it is internal-only, breaks
nothing, and blocks nothing, so it did not need to ride a breaking rename.

## Direction

Verified on 2026-09-01, after the namespace migration landed:

- **`scripts/lib/env.mjs` is the single source of truth.** Its `REGISTRY` array
  lists every env var the project consumes, and `pnpm run check:env` gates it
  against `.env.sample`. Start there, not from a grep.
- **`.env.sample` mirrors only the `secret` + `dev` rows.** An `internal` var
  must never appear in it; the check fails if one does.
- **A var that crosses the host→container or host→CI boundary must be renamed on
  BOTH ends in the same commit** (CLAUDE.md), or the protocol silently breaks
  with no error. `RT_WEBSITE_*` and `RT_BENCH_*` are exactly that shape: set by
  `scripts/container/image.mjs` and read inside the images.
- **`RT_BIN` is the one with a consumer-facing edge.** It is the documented way
  to point the plugin at a specific binary, and `TS_RUNTYPES_BIN` already exists
  as a RETIRED name that only survives to warn people who still set it
  (`packages/devtools/src/vite-plugin/mionVitePlugin.ts`). Any rename of `RT_BIN`
  needs the same courtesy: keep reading the old name, warn, do not silently
  ignore it.
- **`GENERATE_ROUTER_SPEC` is the standing exception** and stays unprefixed: it
  is a public `@mionjs/router` runtime knob.

Two decisions the implementer should settle with the maintainer before starting:
the target prefix (`MION_` would merge these into the existing `MION_*` family;
`MION_RT_` keeps them distinguishable), and whether the docs cleanup ships first
as its own smaller change.

## Done when

- The docs examples no longer teach any `RT_*` var; the consumer-facing pages
  show naked imports and the plain CLI.
- Every renamed var moved on both ends in one commit, with `pnpm run check:env`
  green and `.env.sample` still mirroring only the user-settable rows.
- `pnpm rtx release e2e`, the website build and the benchmark lanes all pass,
  since those are where a half-renamed boundary var shows up.
- Any consumer-facing var that moved still reads its old name and warns, the way
  `TS_RUNTYPES_BIN` does today.
