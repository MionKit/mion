---
type: feature
spec: full-plan
status: done
created: 2026-09-05
---

# Zero-config batch transport: one generated module, checksum inside, no manifest

## Problem

A batch is written in client code, but the server must know its id, its routes and its mappings before it will run one. That table used to cross the two builds through a JSON manifest and a plugin option with two halves: `batches: {emit}` on the client build wrote `.mion/batches.json`, `batches: {consume}` on the server build turned it into `<viteRoot>/.mion/batches.generated.js` and appended an import of it to the module that calls `createMionRouter`.

Everything but the path was already automatic: the resolver reports every `batch()` call site, the harvest in `packages/devtools/src/options.ts` folds it into a table, and the server-side plugin finds the server entry by itself. The inline `inputFrom` mappers were already ordinary RunTypes cache modules under `.mion/types/pf/rt/<hash>.js`; the JSON only pointed at them. So the option, the JSON and the generated module carried one piece of data three times, and a user had to wire two configs to get a batch to run.

The fullstack setup was broken by this: the middleware example set only `emit`, nothing consumed it, and an in-process API answered every batch with `batch-unknown-id`.

## What shipped

One file, written by the client build, imported by the server build, no option:

```
<serverRoot>/.mion/rpc/batches.generated.js
```

- **Client half, automatic.** When the batch report carries call sites, the harvest renders the module (mapper imports by absolute path into the client's `.mion/types/pf/` tree, `registerInputMapperTuple` per referenced mapper, `replaceBatches(table)`) plus two exports, `checksum` and `clientRoot`, and writes it atomically (temp name, rename) into `<serverRoot>/.mion/rpc/`. A byte-identical rewrite is skipped so Vite sees no spurious change. An empty table removes the file, but only a file the same client root wrote (see the ownership note below).
- **Server root.** In middleware mode the API rides the client's own pipeline, so the root is the client's. Otherwise `dirname(server.viteConfig)` when set, else the nearest `package.json` above `server.startScript`, else the client's own root. `resolveServerRoot` in `options.ts` is shared by both presets; the Next preset gained the same `server` pointer, never spawned.
- **Stable file name, checksum inside.** Decided during implementation against the first draft's checksum-in-the-name: once the server entry imports the module it is a node in Vite's graph, so a client rewrite is an ordinary `change` Vite invalidates itself, and the middleware's existing reload (router reset, re-evaluation) registers the new table. A checksum-named file would be a never-imported path nothing reloads. The checksum (sha256 of the sorted unique ids, 16 hex chars) is verified by the server side against the ids in the file before the import is injected: a mismatch fails `vite build` and is logged without registering in serve.
- **Whole-table replace.** The module calls the new `replaceBatches(table)` in `@mionjs/router` (clear, then register), so any evaluation, first or reloaded, leaves exactly the file's table registered.
- **Ownership.** Found while running the client suite: the server project's own build runs the harvest too, sees no `batch()` in its program, and deleted the client's module. The module now records the writing `clientRoot`, and an empty harvest removes only a file its own root wrote.
- **Spawn order.** Found the same way: Vite runs `buildStart` hooks in parallel, so the managed child server could transform its entry before the harvest had written the module. The orchestrator now awaits the first ('build' phase) batch report before spawning, with the server's own wait budget as a fallback so a failed scan cannot hang the build.
- **Server half, automatic.** The `mion-batches` plugin is always registered. At `transform` of the module that imports `@mionjs/router` and names `createMionRouter` it looks for the file, verifies the checksum and appends the import (`./`-prefixed, `map: null`). No file: nothing injected, the server has no batches. A file that exists but was injected nowhere fails `vite build`. `injectInto` is gone; the message says to import `@mionjs/router` directly in the module that calls `createMionRouter`.
- **Dev refresh.** A rewrite is handled by Vite. The one case the graph cannot see is the file's first appearance after the entry was loaded without it: both the import plugin (module invalidation) and the middleware plugin (stale mark) listen to `add` of the stable path. Child-process mode gets the table at spawn; a later batch edit needs a new run, which is what that mode is for (client tests and e2e).
- **Inline mappers** ride the same file exactly as before, through their generated tuple modules. The code-payload fallback (`registerInputMappers`, `InputMapperEntry`) and both lazy readers (`installBatchReader`, `installInputMapperReader`) are gone.
- **Option removal.** `batches` joined the removed-options guard with a hint pointing at `server.startScript` / `server.viteConfig`. `MionBatchesOptions`, `BatchManifest` and the JSON writer are deleted.
- **Go allowlist.** `outputDirAllowedMembers` accepts `rpc` and refuses `batches.json` and `batches.generated.js` at the top level, so a leftover manifest from the old layout fails the build with the folder message and the fix is to delete it.
- **Teardowns keep `rpc/`.** The shared sweep and the client project's teardown remove the RunTypes halves only, so `packages/test-server`'s standalone `build:lib` can import the module a client run wrote. Its README now states the real precondition: that build also imports the client's generated mapper modules, which the teardown does remove, so it only succeeds while the client tree is present (unchanged from before).

## Tests

- `packages/devtools/src/vite/batchesModule.spec.ts`: rendering (checksum, clientRoot, tuple by key slot, `replaceBatches`, no `node:fs`), atomic write, identical-rewrite skip, in-place rewrite, empty-table removal only for the owning root, checksum verification, import injection, `./` prefix, append-not-prepend, the three import shapes, no-file and injected-nowhere cases, corrupted module in build and serve, always wired.
- `packages/devtools/src/vite/batchesBuild.spec.ts`: a real rollup build with no option inlines the tuple, stays self-contained, fails on a pruned mapper module and on a checksum mismatch, builds without batches when no module exists.
- `packages/devtools/src/vite/middlewareMode.spec.ts`: the in-process API registers the module, re-registers on a rewrite with the old ids gone, and picks up a module that appears after the first load.
- `packages/devtools/test/mion-presets.test.ts`: harvest writes the module into the server root, ownership on removal, mapper rows must name a module, collision check, `resolveServerRoot` rules.
- `packages/devtools/test/batch-checksum.test.ts`: seeded property test, order and duplicate invariance, sensitivity to one id, 16 lowercase hex chars, one pinned value.
- `packages/devtools/src/vite/removedOptions.spec.ts`, `packages/router/src/batches.spec.ts` (`replaceBatches`), `packages/core/src/runtypes/inputMappers.spec.ts` (tuple lane only), `packages/devtools/test/vitest-clean-gendir.test.ts` (`rpc/` kept), Go `generate_test.go` (allowlist).
- End to end: the client project runs its whole batch suite against the managed test server with no `batches` option anywhere.

## Docs

`container/website/content/01.rpc/03.client/03.batch.md` (Build Configuration), `01.rpc/06.devtools/02.vite.md` (options listing, Batch Transport, Server Only, fullstack), `01.rpc/06.devtools/03.nextjs.md` (Sharing Batches With Your API). Examples: the two `batches-*.vite.config.ts` files are gone; `vite-client.config.ts`, `vite-server.config.ts`, `vite-middleware.config.ts` and `next-config-batches.ts` show the option-free shape. The pre-publish e2e consumer app dropped the option from its three configs. No hand edit of `CHANGELOG.md`: it is generated from the commits, which carry the breaking marker.

## Out of scope

- Any change to how batch ids themselves are hashed (Go side stays as is).
- Copying mapper bodies into the generated module; the absolute imports into the client's `.mion/types/pf/` tree stay the one source of truth.
- A hand-import escape hatch for entries the detection cannot see.
- A child-process dev server that follows batch edits without a restart.

## Done when

- No `batches` option exists; passing one fails with the hint. Done.
- Client and test-server run the whole batch suite with only the `server` pointer in the client config. Done.
- The fullstack example registers batches in process. Done, pinned by the middleware spec.
- `.mion/rpc/batches.generated.js` is the only artifact; no `batches.json` is written anywhere; Go accepts `rpc/` and refuses `batches.json`. Done.
- Docs, examples and the e2e consumer updated; `pnpm test`, Go tests, lint and format green. Done.
