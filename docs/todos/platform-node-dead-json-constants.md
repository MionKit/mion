---
type: fix
spec: guidelines
status: ready
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
