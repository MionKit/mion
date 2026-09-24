---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# Remove the dead response `serializer` field and the adapter branches on it

## Intent

Every router response carries a `serializer` field meant to pick the body format. Binary is gone from the router, so it is always `SerializerModes.json`:

```ts
serializer: SerializerModes.json,   // packages/router/src/router.ts:~444, ~480; batches.ts:~251
```

Everything that branches on it is dead:

- Each of the 7 platform adapters switches on `mionResp.serializer` with a `default:` / `!== json` branch that throws "unknown body type" and can never run (`platform-aws/src/awsLambda.ts:~121`, `platform-bun/src/bunHttp.ts:~168`, `platform-cloudflare/src/cloudflareHandler.ts:~113`, `platform-gcloud/src/googleCF.ts:~129`, `platform-node/src/mionHttp.ts:~243`, `platform-uws/src/uwsHttp.ts:~290`, `platform-vercel/src/vercelHandler.ts:~112`).
- `MionResponse.serializer` (`packages/router/src/types/context.ts:~65`), `MethodsExecutionChain.serializer` (`types/remoteMethods.ts:~110`), the copy in `dispatch.ts:~96`, the check in `routes/serializer.routes.ts:~92`, and the value set in `callContext.ts:~60` and `lib/dispatchError.ts:~22`.
- `MionResponse.rawBody` and its type `RawResponseBody` (`types/context.ts:~42, ~64`): always `''`, no adapter reads it.

After the change an adapter just writes `JSON.stringify(response.body)` with no switch.

## Direction

The implementer plans the details.

- Scope is the RESPONSE side only. The REQUEST side is live: adapters pass `SerializerModes.stringifyJson` for a string body and gcloud passes `SerializerModes.json` for a body the host already parsed (`googleCF.ts:~63`). Keep that behaviour; simplifying it (for example a `typeof body === 'string'` check instead of the code) is fine if it stays correct and tested.
- The client keeps its `serializer` option, including `'optimistic'` (the maintainer is keeping it). The client's `'json'` value behaves exactly like `'stringifyJson'` (`packages/client/src/lib/serializer.ts:~30-31`); drop it only if that falls out naturally, otherwise leave it.
- `SerializerModes` in `packages/core/src/types/general.types.ts:~35` stays for whatever the request side and client still use; remove the values nothing reads.
- Update the adapter tests that assert the unknown-format branch.

## Docs

None expected, the field is internal. If a page under `container/website/content/01.rpc/` names `serializer` on the response or `rawBody`, update it.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- No response-side `serializer` field, no adapter switch on it, no `rawBody` / `RawResponseBody`.
- Request bodies (string and pre-parsed) still work on every adapter.
- `pnpm test`, `pnpm run test:bun` and `pnpm run typecheck` pass.
- The simplify-docs pass ran on every touched page (if any) and the simplify-comments pass on every touched source file, each committed on its own.
