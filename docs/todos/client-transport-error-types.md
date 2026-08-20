# Client error unions omit the transport errors the client actually raises

**Status:** todo
**Type:** bug (type/runtime divergence on a public type)
**Created:** 2026-08-20 (found while turning the examples typecheck into a CI gate --
see [../done/examples-precompile-debt.md](../done/examples-precompile-debt.md))

## The gap

`HandlerErrors` (`packages/client/src/types.ts:113`) is the union a caller narrows on:

```ts
export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
    Extract<HandlerResponse<PH>, RpcError<string, any>> | ValidationError
>;
```

It carries **the handler's own declared errors plus `ValidationError`, and nothing else**. But the
client raises at least seven more `RpcError` types of its own, none of which appear in any handler
signature. From `packages/client/src/request.ts`:

| type | raised at |
| --- | --- |
| `request-timeout` | `:269` |
| `request-aborted` | `:280` |
| `route-metadata-not-found` | `:322`, `:358` |
| `routes-cant-be-prefilled` | `:393` |
| `missing-headers-param` | `:493` |
| `invalid-headers-param` | `:509` |

So a caller who writes the obvious thing gets a compile error on correct code:

```ts
const [result, error] = await routes.users.sayHello(user).call({timeout: 5000});
if (error?.type === 'request-timeout') { /* TS2367: no overlap */ }
```

## Evidence

`packages/examples/src/client/cancellation-timeout.ts` — the example on the
[cancellation & timeouts](../../website/content/3.client/4.cancellation-timeouts.md) page — was
written the natural way and did **not** compile. Turning the examples typecheck into a CI gate is
what surfaced it; before that the file was never typechecked. It currently ships an `as string`
cast plus a comment pointing here, which documents the wart rather than the idiom.

The divergence is one-directional and safe at runtime: the client really does produce these, callers
just cannot narrow to them. Nothing is mistyped — the union is incomplete.

## Fix plan

1. Declare the client's own error types once (they are already thrown from a single module):
   `export type ClientTransportError = RpcError<'request-timeout'> | RpcError<'request-aborted'> | ...`,
   ideally derived from the literals in `request.ts` rather than hand-copied, so a new one cannot be
   added without landing in the union.
2. Add it to `HandlerErrors`. Check whether `MiddleFnError` / `WorkflowRouteErrors` and the
   `TypedEvent.onError` registration path need the same widening.
3. Drop the cast and the note from `cancellation-timeout.ts`; the example should read as the idiom.
4. Check the fixtures: `client.routes.spec.ts` and `clientMethodsMetadata.spec.ts` deep-equal error
   shapes, and widening a union can break an exhaustive `switch` in user code — decide whether this
   is a minor or a breaking bump.

## Done when

- A caller can narrow `error.type` to `'request-timeout'` without a cast.
- `cancellation-timeout.ts` compiles with no cast and no explanatory note.
- Every `type:` literal constructed in `packages/client/src/request.ts` is reachable from the
  public error union.
