---
type: chore
spec: guidelines
status: done
created: 2026-09-07
---

# Move the client's metadata cache off localStorage and make its cold load cheap

## Intent

The client learns how to call a route by fetching that route's compiled functions and metadata from
the server, then keeping them in `localStorage`. That store is the wrong fit in three ways.

It caps around 5 MB per origin. Compiled validators are code strings, so a large API can exceed it,
and every write is wrapped in a `try`/`catch` that warns and moves on, so the cache degrades
silently rather than loudly.

Its reads are synchronous and run on the main thread. The restore walks every key in the origin,
twice, including keys other libraries on the page wrote, so the cost grows with what else the app
stores and it lands during startup.

It does not exist in a Web Worker or a Service Worker, which keeps the client out of those runtimes
regardless of anything else.

On persistence specifically, the thing worth knowing up front: Safari deletes all script-writable
storage after seven days of browser use without user interaction on the site, and that rule covers
IndexedDB and service worker registrations exactly as it covers localStorage. Changing store does
not escape it. Asking the browser for persistent storage does help against eviction under disk
pressure elsewhere, user interaction resets Safari's clock, and a home-screen web app is outside
Safari with its own counter.

This is complementary to the separate plan for bundling route metadata into the client build at
build time. That one removes the cache from the picture for routes the build can see; this one
makes the fetched lane cheap and durable for everything else.

## Direction

What was checked:

- **The seam already exists.** `getStorage()` in `packages/client/src/lib/storage.ts` returns
  `localStorage` or an in-memory fallback, and every caller goes through it, so a different engine
  slots in behind one function. The catch is that the seam's shape is the synchronous `Storage`
  interface (`getItem`, `key`, `length`), which an async store cannot satisfy as-is.
- **The read path is already inside an async function.** `restoreFromLocalStorage` in
  `packages/client/src/lib/clientMethodsMetadata.ts` is called from `fetchRemoteMethodsMetadata`,
  which `makeCall` awaits. So going async need not ripple into the client's public API.
- **The two full scans are the load cost.** `restoreAllDependencies` loops `getStorage().length`
  and `getStorage().key(i)` twice over, filtering by key prefix and a `baseURL` suffix. Any indexed
  store removes both passes.
- **Materialization is already lazy, so do not chase the eval.** `addSerializedJitCaches` in
  `packages/core/src/runtypes/mionAdapter.ts` registers entries whose functions build from their
  code strings on first lookup. The startup cost is the scan plus one `JSON.parse` per entry.
- **Keys are content hashes**, so entries are immutable: a changed id means changed content. Nothing
  ever needs invalidating, only orphan eviction when a deploy leaves old hashes behind.
- **The stored copy is barely on the cold path today.** `makeCall` in
  `packages/client/src/request.ts` picks the optimistic branch from the in-memory `routesCache`
  alone, and that branch never calls `fetchRemoteMethodsMetadata`, so a fresh page load re-downloads
  metadata that may already be on disk. `prefill()` and the retry path do read it. Whether the
  stored copy should be consulted before choosing the branch is part of this work: a cache nothing
  reads on a cold load is not worth optimizing.

Left to the implementer: which store to land on (IndexedDB is the obvious fit; the Cache API and
the Origin Private File System are the alternatives worth a sentence each before being ruled out),
whether an in-memory fallback still covers SSR and blocked-storage cases, how to reshape the sync
seam, whether and when to ask for persistent storage, whether to batch many small entries into
fewer records so a cold read is one round trip rather than hundreds, and how orphaned hashes get
evicted.

Tests should cover the new store, the fallback when it is unavailable or blocked, a quota failure
that no longer loses the cache silently, and a cold load end to end. The website's client pages
should say what is cached, where it lives, and what a browser may evict, in plain terms.

## Done when

- The metadata cache no longer uses `localStorage` as its primary store and no longer blocks the
  main thread.
- A large API's cache no longer fails silently on a quota error.
- The restore no longer walks every key in the origin.
- The client asks the browser for persistent storage where that is supported.
- A cold page load with a warm cache is settled: either it reads the stored copy, or the todo
  records why it deliberately does not.
- Tests cover the store, its fallback, and the load path; the website says what is cached and what
  a browser may evict.


## What shipped

### The store

`packages/client/src/lib/metadataStore.ts` replaces `storage.ts` in full. One async seam,
`MetadataStore`, with two implementations picked once and memoized on `globalThis`:

- **IndexedDB**, one object store keyed by the compound `['baseURL', 'kind', 'id']`. The whole cold
  read is `getAll(IDBKeyRange.bound([baseURL], [baseURL, []], false, true))`: one request, no cursor,
  and nothing from another server touched. The open upper bound rests on IndexedDB sorting arrays
  after strings, which `metadataStore.spec.ts` pins including the case where one baseURL is a prefix
  of another.
- **Memory**, for SSR, Node, a Web Worker, and any browser where the database is missing, blocked, or
  does not answer inside a short timeout.

One row per entry, not a blob per server: rows are content addressed, so each is written once and
skipped forever after. A blob would be rewritten in full every time the app learned a new route.

`storageEngine` is a named `ClientOptions` field with exactly one value, `'indexeddb'`. Nothing is
built on it yet; it keeps the seam visible for an app bringing its own engine later.

### Size cap and eviction

`METADATA_CACHE_MAX_BYTES` (8 MB per server) with oldest out first, and it loops:

- Before a write, trim to fit the incoming payload.
- On a refused write, give up a batch of the oldest and try again, up to
  `METADATA_CACHE_EVICTION_ROUNDS`. The new data always wins.
- Only when a round frees nothing is the failure reported.

### Write path

`extractAndProcessMetadata` still runs synchronously on the response path and still fills the
in-memory caches there, so nothing about the in-flight request changes. The store write, the
`JSON.stringify` and the safety checks moved to an idle callback. `flushMetadataCache()` is exported
so a test can wait for it.

### Read path

`hydrateMetadataCache(options)` runs once per baseURL, never rejects, and is awaited in `makeCall`
before `allCached` is decided, so a returning visitor's first call goes out already knowing the route
instead of guessing and paying for the guess. Warm calls pay nothing: the `every` short-circuits
before the await.

### Persistence

`requestPersistenceWhenSilent()` runs once after the first successful write. **The client never
triggers a browser prompt, in any browser, under any state.** Some browsers show a permission bar for
`persist()` and there is no way to know in advance which will, so the automatic path asks only where
the permission already reads `granted`, which cannot prompt. Everything else is left alone.
`requestPersistentStorage()` is exported for an app that wants to ask on its own terms.

This is narrower than the original "asks for persistent storage where that is supported": it asks
only where asking is invisible, which the maintainer chose over any risk of a surprise popup.

### Orphan eviction

`metadataEviction.ts` marks every compiled function reachable from a stored method and its transitive
`rtDependencies` / `pureFnDependencies`, and deletes the rest. It walks the records hydration already
parsed, so it costs no extra reads, and runs once per server per page on idle.

### Reporting a write that could not land

`console.error` when it happens, and the `RpcError` rides slot 2 (undeclared) of the next result whose
slot is free, then clears. The call itself never fails because of it.

### Removed

`getStorage`, `MemoryStorage` and `resetStorageInstance`, plus the three e2e fixtures that existed only
to force the localStorage branch (the mion-consumer helper and its two callers, the inline class in the
bun lane, and the one in `batchFlow.ts`). Those lanes now run the in-memory fallback, which is the
branch a Node or Bun consumer genuinely takes.

## Two bugs found on this path and fixed here

**A stored method whose compiled functions are gone throws at call time.**
`getJitFunctionsFromHash` throws `Jit function(s) ... not found`, and a half-finished write left exactly
that, silently. `hasJitFnsForMethod` in `packages/core/src/routerUtils.ts` checks presence without
materializing any code, and hydration refuses a method that fails it. That is also what makes dropping
old entries safe, which the size cap needs. The check covers params and return only, matching exactly
what throws: the header sets are never sent to a client and `getHeaderJitFunctionsFromHash` returns
them empty rather than throwing.

**Stale metadata from an earlier deploy could never self-heal.** Method rows are keyed by method id, so
an older row is what a cold load reads. That was masked while a cold load always guessed the wire (the
server's answer corrected it), and reading the store first exposed it. The retry gate in `request.ts`
now also fires for a call that did not guess: it purges the rows that came from the store, once, and
retries so the server is asked again. `routesCache.removeMetadata(id)` was added to core for it.

## Testing

`fake-indexeddb` (exact-pinned root devDependency) is a real implementation of the spec that passes the
W3C suite, so key ordering, bound ranges and transaction atomicity are genuinely covered in Node. It
cannot simulate quota, so those tests drive a store stub that rejects.

A real headless browser lane was considered and deliberately not built: quota, real eviction, private
mode and the persistence permission are the only things it would add, and Playwright currently only
runs inside the website container.

New: `metadataStore.spec.ts`, `metadataCache.spec.ts`, `metadataEviction.spec.ts`,
`persistentStorage.spec.ts`, `request.coldLoad.spec.ts`. Rewritten:
`clientMethodsMetadata.security.spec.ts`. Updated: `clientMethodsMetadata.spec.ts`,
`validationErrors.spec.ts`, `client.spec.ts` (its `forgetMetadata` helper now clears the store too,
since memory alone no longer makes a client cold).

## Docs

New `container/website/content/01.rpc/03.client/02.metadata-cache.md`, cross-referenced from the client
overview. `packages/client/CLAUDE.md` notes the one thing that now rides slot 2 without the router
having seen it.
