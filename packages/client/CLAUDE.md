# @mionjs/client guidelines

## The call result is a 5-tuple, and the order is deliberate

`call()` resolves to `[result, error, undeclared, middleFnResults, middleFnErrors]`
([src/types.ts](src/types.ts), `Result`; `batch()` returns the same layout with arrays in
the first two slots, `BatchResult`). Do not "tidy" the shape or the order: it encodes WHO
can produce each error, and that is what makes slots 1 and 4 closed, strongly typed unions.

| slot | holds                                                        | who produced it                                                                                                                                                                 |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | the route's value                                            | the route handler, whenever it ran and succeeded                                                                                                                                |
| 1    | the route's DECLARED errors + `ValidationError`              | the route (or its param validation), a CLOSED union                                                                                                                             |
| 2    | `UndeclaredError`, an OPEN `RpcError<string>`                | anything outside the declared contract: transport (timeout, abort, network), platform, framework, an undeclared throw, an error for a middleFn that was not part of the request |
| 3    | middleFn results, by name                                    | each middleFn sent with the request                                                                                                                                             |
| 4    | each middleFn's DECLARED errors + `ValidationError`, by name | each middleFn, one slot per name so several failures are never collapsed into one                                                                                               |

Why `undeclared` sits BEFORE the middleFn slots, which looks odd at first:

- Everything the ROUTER runs, the route and every middleFn, has a slot of its own, typed from
  what the handler declared. `undeclared` is the one slot for "anything else", and anything
  else can be a network error the router never saw. Reading order follows frequency: the
  route's own value and error first, then the catch-all a user MUST check before trusting
  `result === undefined`, then the middleFn outcomes.
- MiddleFn outcomes are meant to be handled by the middleFn's own callbacks
  (`prefill().onError()` / `.onSuccess()`, or `onError` / `onSuccess` registered on the
  middleFn sub request). The two trailing slots exist so a call site CAN still read them;
  they are not the primary way. Prefer the callbacks and leave the tuple positions alone.

The dispatch rules (which error lands where) are pinned by
[src/errorDispatch.spec.ts](src/errorDispatch.spec.ts); the header of that file lists them.
Two of them exist because of real bugs, keep them in mind when touching request handling:

- A middleFn failing NEVER masks a route result that the server did produce (a returned,
  non-fatal middleFn error does not abort the chain), so slot 0 keeps the value while slot 4
  carries the middleFn error.
- A middleFn error NEVER appears in slot 1. Slot 1 is the route's declared union and nothing
  else, otherwise the typing of that slot would be a lie.

One thing rides slot 2 that the router never saw: a metadata cache write the browser refused, after
eviction ran out of things to give up. The request itself succeeded, so it never rejects and never
displaces a real error; it takes the first free undeclared slot on a later call and is reported once
(`packages/client/src/lib/clientMethodsMetadata.ts`, `takeMetadataCacheError`).

## Calls never throw

Every failure comes back inside the tuple. The ONE method that throws is `typeErrors()`,
which validates params locally and is documented as such. Never add a throwing path to
`call()` / `batch().call()`.

## Batches need the build plugin

`batch()` requires the batch id the build transform injects (`InjectBatchId`), because
batches are compiled into the server at build time. A client without the transform gets a
`batch-missing-id` error; that is by design, not a missing fallback.
