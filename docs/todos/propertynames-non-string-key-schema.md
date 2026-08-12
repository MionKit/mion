---
type: fix
spec: guidelines
status: ready
created: 2026-08-12
---

# A typeless `propertyNames` subschema converts to builders code that does not compile

## Problem

A `propertyNames` whose subschema has no `type` keyword converts to a
`RT.record(…, {propertyNames: …})` call the TypeScript compiler rejects, and the
constraint vanishes from the resolved type:

    export const xRT = runTypeFromJsonSchema({
      type: 'object',
      propertyNames: {pattern: '^[a-z]+$'},
    } as const);
    export type X = InferType<typeof xRT>;

    $ ts-runtypes convert --to builders src/main.ts
    export const xRT = RT.record(RT.unknown(), {propertyNames: RT.union([
      RT.array(RT.unknown()), RT.literal(false), RT.literal(true),
      RT.record(RT.unknown()), TF.number(),
      TF.string({pattern: {flags: 'u', source: '^[a-z]+$'}})])});

    id: y6ckeiC → XZdnZhd

The reflected graph shows the constraint gone entirely after the round trip:
`propNames` is present before and absent after.

`--to type` is FINE — it prints
`TF.FormattedObject<Record<string, unknown>, {propertyNames: … | …}>` and the id
holds. Only the value-first target breaks.

## Why

The chain is three steps, and each one is defensible on its own:

1. **The door lowers a typeless subschema to the full JSON-value union.** That
   is the correct standard reading: `{pattern: '^[a-z]+$'}` constrains strings
   and lets every non-string through. So the `propertyNames` child is
   `unknown[] | false | true | Record<string, unknown> | number |
   TF.String<{pattern: …}>`.
2. **The value-first builder's params type requires a string key schema.**
   `FormattedObjectParamsValueFirst = FormattedObjectParams<RunType<unknown>,
   RunType<string>>` (`packages/ts-runtypes/src/formats/structural.ts`), so a
   `RunType` of that union does not satisfy the parameter — the emitted call is
   a type error.
3. **The unwrap silently gives up rather than failing loudly.**
   `ObjectParamsType` reads the slot as
   `P extends {propertyNames: RunType<infer K extends string>} ? … : unknown`.
   With a non-string `K` the conditional takes the `unknown` arm, so the
   `__rtPropNames` sentinel is never attached and the constraint disappears
   from the type. The TYPE-first side (`PropNamesSlot`, same file) has no such
   constraint, which is exactly why `--to type` survives.

## Fix directions to evaluate

This needs a decision, which is why it is filed rather than fixed:

- **Narrow at the door.** Property names are always strings, so a
  `propertyNames` subschema could be lowered to its string part alone. Most
  semantically honest, and it makes the union never arise. But it changes the
  lowering, so it moves the id of every existing schema using the shape, and it
  touches the `CORE-INERT` reasoning in
  `docs/json-schema-2020-12-javascript.md` (deleting the keyword must not
  change which values validate — narrowing the CHILD does not violate that, but
  the reasoning deserves to be written out).
- **Widen the builder.** Drop the `extends string` from the unwrap and from
  `FormattedObjectParamsValueFirst`, so the value-first surface carries exactly
  what the type-first one does. Smallest change, and it restores the invariant
  the codebase states everywhere (the two surfaces must resolve one id). It
  does mean the public builder accepts a key schema that can never match a real
  key.
- **Refuse in the converter.** Print a CNV001 on the builders target for a
  non-string `propNames` child, with a row in
  `packages/ts-runtypes/test/features/unsupported-conversion.test.ts` and the
  website table. Correct but least useful, since `--to type` already handles it.

Whichever ships, the silent drop in step 3 should go: a slot that cannot be
carried must fail, not evaporate.

## Not affected

Typed spellings all round-trip today, pinned by
`TestHandAuthored_TypedPropertyNamesConverts`
(`ts-go-runtypes/internal/convert/handauthored_test.go`):
`{type: 'string', pattern: …}`, `{type: 'string', minLength: 2}`, and
`{enum: ['a', 'b']}` (whose members are all strings, so the union is a string
union). `additionalProperties: {pattern: '^x'}` also round-trips — same typeless
lowering, but the value slot has no string constraint to trip over.

## Done when

- The schema above converts to builders code that compiles, with the constraint
  intact and the id held — or refuses with a diagnostic.
- `TestHandAuthored_EveryDialectKeyword`'s `propertyNames` row is un-skipped.
- A non-carryable `propertyNames` slot never silently resolves to `unknown`.
