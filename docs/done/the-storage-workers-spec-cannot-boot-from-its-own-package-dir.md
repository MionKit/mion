---
type: fix
spec: guidelines
status: done
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

## Plan — pair every scriptPath with modulesRoot (approved 2026-09-21)

### What settled

Option 2. Miniflare names a modules worker `relative(modulesRoot, scriptPath)`, and `modulesRoot`
defaults to `path.resolve('')`, which is `process.cwd()`:

```js
// node_modules/miniflare/dist/src/index.js
const modulesRoot = path.resolve(('modulesRoot' in options ? options.modulesRoot : void 0) ?? '');
function moduleName(modulesRoot, modulePath) { return path.relative(modulesRoot, modulePath); }
```

So the absolute `scriptPath` was never the problem; the missing `modulesRoot` was. Pinning the root
to the bundle's own directory makes the module name `test-server-cloudflare-storage.js` from any cwd.

The `script`-text swap the sibling spec uses was rejected. It needs `modulesRoot` anyway for the
module specifiers, so it buys nothing and costs a `readFileSync` plus a synthetic script path.
`container/drizzle-e2e/shared/runners/durable-worker.mjs` already pairs `scriptPath` with
`modulesRoot`, so the fix matches the pattern the repo already had.

### What shipped

- `packages/platform-cloudflare/src/cloudflareStorage.workers.spec.ts` passes
  `modulesRoot: dirname(STORAGE_BUNDLE_PATH)`.
- `scripts/ci/check-tree.mjs` gained a fifth whole-tree sweep: every `new Miniflare(...)` carrying
  `scriptPath:` must carry `modulesRoot:`. It reads the argument list paren-balanced with comments
  and string bodies stripped, so a template-literal worker full of its own parens and a
  commented-out `modulesRoot` both read correctly. The sweep runs from the one CI job nothing can
  skip (`ci.yml`'s `lanes`, plain node, no install), so it fires on every commit including a
  docs-only one, and it does not depend on the cwd it is run from.
- `packages/devtools/test/repo-contracts.test.ts` unit-tests the rule and asserts the storage spec
  itself is clean.
- `ci.yml`'s step name no longer lists three of the sweeps by name; it points at `SWEEPS` instead.

### The other call sites

Checked all four in the repo. Only the storage spec was broken:

| Call site | Shape |
| --- | --- |
| `packages/platform-cloudflare/src/cloudflareStorage.workers.spec.ts` | `scriptPath`, was missing `modulesRoot` |
| `container/drizzle-e2e/shared/runners/durable-worker.mjs` | `scriptPath` + `modulesRoot`, already correct |
| `container/drizzle-e2e/shared/runners/d1.test.ts` | inline `script` text |
| `packages/platform-cloudflare/src/cloudflareHandler.bench.ts` | inline `script` text |

### Evidence

```
$ pnpm --filter @mionjs/platform-cloudflare test
 Test Files  4 passed (4)
      Tests  29 passed (29)

$ pnpm exec vitest run --project platform-cloudflare
 Test Files  4 passed (4)
      Tests  29 passed (29)
```

The sweep was checked against a deliberate regression: deleting the `modulesRoot` line makes
`node scripts/ci/check-tree.mjs` report

```
==> no miniflare worker depends on the directory it was started from — 1 offender(s):
  packages/platform-cloudflare/src/cloudflareStorage.workers.spec.ts
```

No website docs: nothing here is consumer facing. No Go change, so no Go suite.
