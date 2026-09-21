---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# The storage workers spec cannot boot from its own package dir

## Intent

`pnpm --filter @mionjs/platform-cloudflare test` fails. The same spec passes when vitest runs from
the repo root, so CI never sees it, but CLAUDE.md documents the per-package command as a supported
way to run one package.

The failing file is
[packages/platform-cloudflare/src/cloudflareStorage.workers.spec.ts](../../packages/platform-cloudflare/src/cloudflareStorage.workers.spec.ts).
It builds an ABSOLUTE bundle path and hands it to miniflare as `scriptPath`:

```ts
const STORAGE_BUNDLE_PATH = resolve(__dirname, '../../test-server/build/test-server-cloudflare-storage.js');

mf = new Miniflare({
  modules: true,
  scriptPath: STORAGE_BUNDLE_PATH,
  durableObjects: {NOTES_DO: {className: 'NotesDurableObject', useSQLite: true}},
  d1Databases: {DB: 'mion-notes'},
  ...
});
await mf.ready;
```

Miniflare makes `scriptPath` relative to `process.cwd()` before handing it to workerd:

- cwd = repo root (`vitest run` from the root config) gives `packages/test-server/build/...`, accepted.
- cwd = `packages/platform-cloudflare` (what `pnpm --filter <name> test` uses) gives
  `../test-server/build/...`, and workerd refuses any `..`.

## Repro

```bash
pnpm --filter @mionjs/platform-cloudflare test
```

```
workerd/jsg/util.c++:320: error: e = kj/filesystem.c++:319: failed: expected parts.size() > 0 [0 > 0];
can't use ".." to break out of starting directory

MiniflareCoreError [ERR_RUNTIME_FAILURE]: The Workers runtime failed to start.
 ❯ src/cloudflareStorage.workers.spec.ts:47:3   // await mf.ready
```

The same command from the repo root passes:

```bash
pnpm exec vitest run --project platform-cloudflare   # 31 passed
```

## What to settle

1. The sibling spec, `cloudflareHandler.workers.spec.ts`, never hits this: it reads the bundle with
   `readFileSync` and passes `script` (the source text), not a path. Work out whether the storage
   spec can do the same. It is a MODULES worker, not a service worker, so a `script` string needs
   `modulesRoot` set for the module specifiers to resolve. Check that before assuming the swap is
   free.
2. The alternative is leaving `scriptPath` and giving miniflare a root that keeps the relative path
   free of `..`. Weigh both and pick the one that does not depend on where vitest was started.
3. Whichever lands must work from BOTH the repo root and the package directory.

## Evidence to produce

- Both commands green, quoted:
  - `pnpm --filter @mionjs/platform-cloudflare test`
  - `pnpm exec vitest run --project platform-cloudflare` (from the repo root)
- A check that keeps the package-directory path covered, so the next change cannot quietly break it
  again while CI stays green.

## Watch out

- Check whether any other spec in the repo passes an absolute `scriptPath` (or any cwd-relative path)
  to miniflare or to a similar runner. The same trap applies to all of them.
- The bundles are generated per run by `packages/platform-cloudflare/globalSetup.ts`; both paths
  already build them, so a missing bundle is NOT the cause here.

## Origin

Found while running the cloudflare suite for an unrelated test fix. It fails the same way on
`origin/main`, so it predates that work.
