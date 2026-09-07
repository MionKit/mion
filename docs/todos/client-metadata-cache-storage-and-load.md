---
type: chore
spec: guidelines
status: ready
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
