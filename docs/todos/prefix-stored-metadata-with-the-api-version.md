---
type: feature
spec: guidelines
status: ready
created: 2026-09-22
---

# Key the stored metadata cache by the API version

## The idea

A fetched client keeps route metadata in a local store so a later page load does not ask the server
again (`packages/client/src/lib/metadataStore.ts`, `metadataCache.ts`). The keys are route ids.

Route ids are not unique across servers, and they are not unique across versions of one server. So one
browser profile talking to two mion servers, or to one server that was redeployed, can read back a row
that belongs to something else.

Prefix every stored key with the API build version, the same value `initClient` now carries and the
server answers with in `x-build-version`. Two servers then keep two sets of rows, and a redeploy leaves
the old set unread rather than mixing it in.

## Why now

The build version landed with the runtime version check (`packages/client/src/lib/apiBuildVersion.ts`,
`ts-go-runtypes/internal/compiler/resolver/apiversion.go`). The value exists on both ends and is
derived from the API's types alone, so the store can use it without computing anything new.

## Worth thinking about while planning

- **Where the prefix comes from.** A bundled client has its own injected version. A fetched client may
  have none, since the build only injects one when it can resolve the API against the server's program.
  The server's `x-build-version` header is the other source, and it arrives only after the first
  response. Decide which is authoritative and what a client with neither does.
- **What happens to rows under an old prefix.** Left to rot, evicted on read, or swept. The store
  already has an eviction path (`metadataEviction.ts`) and a quota it can hit, so dead prefixes are not
  free.
- **Whether the base URL belongs in the key too.** Two servers of the SAME version are still two
  servers; the version alone does not separate them. Check whether that matters given the rows are
  derived from the API's types.
- **Migration.** Existing stored rows have no prefix. Decide whether they are read once and rewritten,
  or simply ignored and re-fetched.

## Out of scope

- The bundled lane's own shelf. A bundled client's rows come from its build, never from the store, and
  the runtime version check already replaces the ones a server disagrees with.

## Done when

- Two servers, or two versions of one server, cannot hand each other a stored row.
- A client with no version still works, with whatever the plan decides that means.
- The store's existing tests still pass, and the new keying has its own.
