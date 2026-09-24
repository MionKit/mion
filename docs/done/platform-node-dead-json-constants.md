---
type: fix
spec: guidelines
status: done
created: 2026-09-24
---

# Unused and wrong JSON constants in platform-node

## Intent

`packages/platform-node/src/constants.ts:11-14` exports four constants no file uses:

```ts
export const CONTENT_TYPE_HEADER_NAME = 'content-type';
export const ACCEPT_JSON = 'application/json';
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
export const JSON_TYPE_HEADER = {CONTENT_TYPE_HEADER_NAME: JSON_CONTENT_TYPE};
```

`JSON_TYPE_HEADER` is also wrong: its key is the literal text `CONTENT_TYPE_HEADER_NAME`, not
`content-type`.

## Direction

The implementer plans the details. Remove the four constants. While there, look for the same pattern in
the other `platform-*` adapters and in `packages/core/src` (`MIME_TYPES`, `UNSAFE_PROPERTY_NAMES` were
also reported unused) and remove what has no users.

## Docs

None, because no page names these constants.

## Done when

- The unused constants are gone and nothing breaks.
- `pnpm test` and `pnpm run typecheck` pass; label the PR `pre-publish-e2e` (exports change).
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-24)

A scan of every `export const` in `packages/core/src/constants.ts` and each `packages/platform-*/src/constants.ts`
against the whole repo found these with no user:

- `platform-node`: `CONTENT_TYPE_HEADER_NAME`, `ACCEPT_JSON`, `JSON_CONTENT_TYPE`, `JSON_TYPE_HEADER`. Remove.
- `core`: `MIME_TYPES` (constants.ts). Remove.
- `core`: `UNSAFE_PROPERTY_NAMES` (utils.ts). Remove, and move its doc comment onto `isUnsafePropertyName`, which
  hard-codes the same three names.
- The `*_MAX_BODY_SIZE_CAP` constants in aws / cloudflare / gcloud / vercel are used by their own default options, so
  they stay.

Tests: `isUnsafePropertyName` had none, and after the list goes it is the only home of the three names, so
`packages/core/test/utils.spec.ts` pins it. A barrel test in each package pins that the removed names stay gone.
