---
type: fix
spec: guidelines
status: done
created: 2026-09-23
---

# Next.js puts enrichment files where the enrich CLI does

## Intent

The Next.js broker always passes `genDir: options.genDir ?? '.mion'` to the resolver (`packages/devtools/src/runtypes/next/broker.ts`, near the stamp path). That explicit value beats both the inferred `<srcDir>/.mion` and a tsconfig `genDir`.
The `mion enrich` CLI and every other bundler plugin default to `<inferred source folder>/.mion`, and honour a tsconfig `genDir`.
So with the enrich options on, Next writes and checks mirror files under `<root>/.mion/enriched`, while the CLI writes them under `src/.mion/enriched` (or the tsconfig genDir). The production drift check then reads files the CLI never wrote.
It usually works by luck: a typical Next project includes `next-env.d.ts` at the root, so the common source folder is the root. It breaks when the sources share a sub-folder, or when tsconfig sets `genDir`.

Repro: a Next app whose tsconfig sets `genDir` (mion plugin entry), run `mion enrich <file> <Type>`, then `next build` with enrich on: the build looks in `<root>/.mion`.
Workaround today: set `genDir` in `withMion` options and pass the same `--gen-dir` to the CLI.

## Direction

Stop forcing `.mion` in the broker. Take genDir from the resolver's generate output, the way `packages/devtools/src/core/unplugin.ts` already does, before building the stamp path. The broker needs the path early (the invalidation stamp lives inside it), so the implementer decides how to get the resolved genDir first.
Read `packages/devtools/src/runtypes/next/CLAUDE.md` before touching anything: it records invariants that look like cleanups but are not, and it requires a `next-broker.test.ts` test plus a change to the smoke-next e2e app for broker changes.
The implementer plans the details.

## Docs

`container/website/content/02.runtypes/01.introduction/04.configuration.md`, existing genDir row in the option table: it says Next.js uses the working directory. Update it to match what ships.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- With no `genDir` set, Next and the enrich CLI read and write the same mirror folder; a tsconfig `genDir` is honoured by Next.
- `next-broker.test.ts` and the smoke-next app cover it.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Plan (approved 2026-09-23, delegated session, built as below)

- `packages/devtools/src/core/unplugin.ts`: the plugin exposes `rtGenDir()`, returning the output root the resolver echoed from generate (explicit option > tsconfig `genDir` > inferred `<srcDir>/.mion`).
- `packages/devtools/src/runtypes/next/broker.ts`: no more `genDir ?? '.mion'`. An explicit `genDir` still rides through the plugin options; otherwise the broker adopts `rtGenDir()` right after `buildStart`, then derives the stamp path. Every reader of that path (stamp, generated listing, watcher filter, reply) already runs after the readiness promise, so nothing needs the path earlier. A resolver that reports no root fails startup loudly instead of guessing.
- Tests: `next-broker.test.ts` gains two cases (no genDir → `src/.mion`, no `<root>/.mion`; tsconfig `genDir: 'gen'` → `gen/`). Both fail on the old broker.
- smoke-next e2e: its `genDir: '.rt'` moved from `withRunTypes` into the app's tsconfig plugin entry, and `build-outputs.test.mjs` checks the stamp lands under `.rt/` and no `.mion/` appears.

## What shipped vs the spec

- Docs: on `main`, the configuration page's genDir row already says the default is `.mion` in your source folder with no Next exception, which is now true, so no page changed. The "Next.js uses the working directory" wording lives only on the branch that also moves the enrich CLI default; that branch must drop Next from its parenthetical when it rebases on this fix.
- The no-genDir half of "Next and the CLI agree" also needs that branch's CLI change (the CLI default rooted at the inferred source folder). This fix makes Next agree with the resolver and every other bundler host; the tsconfig-genDir half agrees with the CLI already.
