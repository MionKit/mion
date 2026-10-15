---
type: chore
spec: guidelines
status: ready
created: 2026-10-14
---

# Run the server benchmarks' zod lanes on zod 4.6 with z.compile

## Intent

The RunTypes validation benchmarks already run zod 4.6.5 with `z.compile` (the compiled fast path,
about 2.4x faster on zod's own suite). The RPC server benchmarks do not: the express, hapi, hono
(node + bun) and http-node apps still resolve zod 4.5.1 (`^4.3.6` in their `_deps` manifests) and call
the plain runtime parser, `UserSchema.safeParse(req.body)`. So the server pages compare mion against
a slower zod than a current user would ship, and the two benchmark families disagree on what "zod" means.

## Direction

The implementer plans the details. Verified pointers:

- Versions: `container/mion-bench/_deps/{express,hapi,hono,http-node}/package.json` pin `zod ^4.3.6`.
  Move them to the same exact version as `container/benchmarks/_deps/competitors/zod/package.json`
  (currently `4.6.5`), honoring the 30-day `minimumReleaseAge` in `container/mion-bench/_deps/pnpm-workspace.yaml`.
  A manifest change drifts the image hash → rebuild, verify and push the `mion-bench` image.
- Schemas: `container/mion-bench/shared/zod-schemas.mjs` `makeSchemas(z)` builds every app's schemas.
  Compile them there (`z.compile(schema)`) so every zod app gets it in one place.
  zod/compile falls back to the runtime parser silently for anything it cannot model. Check that the
  user schemas really compile (e.g. `{strict: true}` once at startup, or a smoke assertion),
  because `z.coerce.date()` and the discriminated union are the likely spots.
- Fastify (ajv JSON schema) and elysia (TypeBox) do not use zod: out of scope.
- Every lane must still answer correctly AND reject an invalid payload before it is measured.
- Re-run `pnpm miondevx bench servers` and regenerate the server pages' data.

## Docs

`container/website/content/03.benchmarks/02.rpc/02.light-validation.md` and `03.heavy-validation.md`:
existing code examples under "Other frameworks" show a plain `z.object(...)` + `UserSchema.parse`;
update them to show the compiled schema. Check the http-node note in "Reading the Results" still holds
with the new numbers.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The four zod server apps run zod 4.6.x with compiled schemas, confirmed to take the compiled path.
- The `mion-bench` image is rebuilt, verified and pushed; server data regenerated; pages render.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan: zod 4.6.5 + strict compile (approved 2026-10-15)

- Pin `zod` to exactly `4.6.5` in the express, hapi, hono and http-node `_deps` manifests: the validation
  benchmark's version, 32 days old, so it passes the 30-day `minimumReleaseAge` (4.6.6 / 4.6.7 are too new).
- `makeSchemas(z)` returns `z.compile(schema, {strict: true})` for both schemas. Checked on a scratch zod 4.6.5:
  both compile, `z.coerce.date()` and the discriminated union included; the fast path accepts the bench payloads,
  rejects a bad field and an extra key, returns real `Date`s, and runs ~1.2x to 2.2x faster than the plain parser.
  `strict` makes a schema the compiler cannot model throw at app startup, so a lane fails loud.
- Host contract tests in `packages/devtools/test/mion-bench-wire.test.ts`: the four manifests pin the validation
  benchmark's zod version; `makeSchemas` with a stub `z` returns strict-compiled schemas.
- Rebuild + push the `mion-bench` image (both arches), re-run `pnpm miondevx bench servers`, check the pages render.
- Docs: the "Other frameworks" examples on the light and heavy validation pages show `z.compile` and name the zod
  apps (Fastify uses ajv); re-check the http-node note against the new numbers.
