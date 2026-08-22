# Thrown errors never reached a binary client

**Status:** done — shipped on `claude/serialize-chain-single-pass-6s2pb2`
**Created:** 2026-08-22 · **Completed:** 2026-08-22

Found while reading `willSerialize` for
[serialize-chain-single-pass.md](serialize-chain-single-pass.md). Predates that work; it has been
true for as long as the binary lane has existed.

## Evidence

`serializeResponseBody` puts thrown errors in the response body under `@thrownErrors`
(`packages/router/src/routes/serializer.routes.ts`). Both JSON lanes then serialize that key as an
explicit extra entry, because `@thrownErrors` is NOT a member of any execution chain. The binary lane
walks the chain and nothing else, and `willSerialize` additionally skipped the key outright — "should
be handled separately by the caller if needed", except no caller on this lane handled it.

A dispatch probe over a route that throws:

```
response.body keys: [ '@thrownErrors' ]        <- the router put the error in the body
chain ids:          [ 'mionDeserializeRequest', 'boom', 'mion@methodsMetadata', 'mionSerializeResponse' ]
WIRE body keys:     []                          <- the binary envelope is EMPTY
```

So a binary client whose request threw received a zero-item envelope and no error at all. Worse, the
client was already looking for exactly this key: `deserializeBinaryResponseBody` calls
`extractThrownErrors` (`packages/client/src/lib/serializer.ts`), so that branch — including its
`platformError` special case — was dead code on binary. Untested: `dispatch.binary.spec.ts` covered
only RETURNED `RpcError`s, never a thrown one.

## The fix

`withThrownErrors` in the router's `serializeBinaryBody` appends the `@thrownErrors` executable to the
chain when the response body carries thrown errors, mirroring what the JSON lanes already do; the
special-case skip in core's `willSerialize` is gone, so the key serializes like any other member the
caller put in the chain. The deserializer already resolved arbitrary keys from `routesCache`, so
nothing changed on the read side. Allocating a new chain array is confined to error responses.

Pinned by `dispatch.binary.spec.ts > Thrown errors on the binary wire`, which fails with
`expected undefined to be defined` without the fix.
