---
type: fix
spec: full-plan
status: done
created: 2026-07-30
---

# `format: 'uuid'` recovers `UUIDv4`, rejecting every other UUID version

> **SHIPPED** (2026-08-02, feature/json-schema-rollout M6): `format: 'uuid'`
> now recovers the version-agnostic `UUID` brand (`{version: 'any'}`) —
> pf_isUUID treats slot 14 as an ordinary hex digit under 'any', the
> `TF.uuid` preset builder ships beside uuidv4/uuidv7, and the
> version-agnostic acceptance is pinned in referencesUneval.test.ts
> (v1 / v3 / v7 accepted, junk rejected, mocks sound).


Found while building the JSON Schema benchmark lane ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)). Out of scope there, so filed rather than fixed. **Predates the rollout** — it shipped with M1 of [json-schema-first-class-implementation.md](../done/json-schema-first-class-implementation.md).

## Problem

[packages/ts-runtypes/src/json-schema/fromJsonSchema.ts](../../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts) maps the `format` keyword to a brand through `BrandBySchemaFormat`, and the `uuid` row points at `UUIDv4`:

```ts
interface BrandBySchemaFormat {
  readonly email: Email;
  readonly uuid: UUIDv4;   // ← narrower than the keyword means
  …
}
```

Draft 2020-12 defines `format: 'uuid'` as **any** RFC 4122 UUID. `UUIDv4` enforces the version-4 nibble, so a schema saying `{"type": "string", "format": "uuid"}` produces a validator that **rejects a valid v1, v6 or v7 UUID**. A schema author gets a stricter contract than the document they handed over, silently, with no diagnostic.

This is a translation divergence, not a formatting nit: the same document accepted by ajv, and by the service that emitted it, is rejected here. v7 in particular is what new systems mint.

## Evidence

- The mapping row: `fromJsonSchema.ts` → `BrandBySchemaFormat.uuid: UUIDv4`.
- The brand set actually available on the formats surface is version-specific only: `uuidv4` and `uuidv7` (`packages/ts-runtypes/src/formats/index.ts`), with no version-agnostic `UUID`. That absence is likely why the narrow row was written.
- The benchmark lane's `realworld_user` case sidesteps it by using v4 samples on both sides, which is exactly the kind of accidental coverage that hides this.

## Fix plan

1. Add a version-agnostic `UUID` type-format (brand + validator + mock fn) beside `UUIDv4` / `UUIDv7`, matching the RFC 4122 shape without pinning the version nibble. Go side: a `stringFormat` entry alongside the existing uuid formats (`ts-go-runtypes/internal/cachegen/typefunctions/formats/string/`); JS side: the brand + pure fn in `packages/ts-runtypes/src/formats/string/stringFormats.ts`.
2. Point `BrandBySchemaFormat.uuid` at it.
3. Re-baseline the affected compile budgets if the wider brand moves them.

Fixing it inside the JSON Schema layer alone (without the new format) is not possible: there is no version-agnostic brand to map to.

## Tests

- `packages/ts-runtypes/test/suites/json-schema-define/` — a case pinning that `{type: 'string', format: 'uuid'}` accepts a v1, v4 and v7 UUID and rejects a non-UUID string. Both `getRunTypeId` shapes per the marker rule.
- `packages/ts-runtypes/test/suites/format-validation/StringFormat.ts` — the new `UUID` format's own row, plus its `validateJsonSchema` / `getValidationErrorsJsonSchema` thunks.
- The new format needs its `'not-supported'`-or-filled column across the four registries, and the completion meta-check will enforce that.

## Done when

- A v7 UUID validates against `{"format": "uuid"}`; `uuidv4()` / `UUIDv4` keep rejecting it.
- Full `pnpm test` + `go -C ts-go-runtypes test ./internal/...` green.
- The guide's format list ([container/website/content/2.guide/02.json-schema.md](../../container/website/content/2.guide/02.json-schema.md)) still reads true.
