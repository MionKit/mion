---
type: chore
spec: guidelines
status: done
created: 2026-08-27
---

# Remove the types-first drizzle lane (toDrizzleXTable)

## Intent

Now that the proxy builders (`@mionjs/drizzle/pg|mysql|sqlite`, see
docs/done/drizzle-proxy-column-builders.md) give tables-first users full runtype
fidelity, the inverse lane (generating drizzle tables FROM TypeScript types via
`toDrizzlePGTable` / `toDrizzleMySqlTable` / `toDrizzleSqliteTable`) is redundant.
Remove it so the package works the way everyone already uses drizzle: declare tables
with drizzle's own builders (imported from the proxy subpaths), infer models with
`InferSelectModel`, validate with the compiled functions.

The `InsertModel` / `SelectModel` / `UpdateModel` type utilities STAY: they are
standalone type transforms with zero mapper coupling and compose fine with proxy
tables.

This is a breaking API change for `@mionjs/drizzle` (the root export loses the
`toDrizzleXTable` functions); the version-bump call belongs to this PR.

## Removal map (investigated 2026-08-27, verified against the tree)

Delete (types-first only, nothing in the proxies lane touches them):

- `src/{postgres,mysql,sqlite}.ts` and their `.spec.ts`
- `src/core/` (typeTraverser, utils, validator)
- `src/mappers/` (base, pg, mysql, sqlite)
- `src/types/{postgres,mysql,sqlite}.types.ts`
- `src/stubs-formats-mappings/{postgres,mysql,sqlite,common}.stub.ts`
- `src/stubs-formats-mappings/drizzle-types.spec.ts` (the proxies lane has its own
  gate: `proxies/manifest-coverage.spec.ts` + `pnpm rtx core drizzle-manifest --check`)

Shared surgery:

- `src/types/common.types.ts` shrinks to just `MustBeNever` (the only export the
  proxies use, via `proxy-completeness.stub.ts`); everything else in it is
  mapper-only or already dead (`DatabaseType`).
- `index.ts` currently re-exports the three lanes + models; only the
  `src/types/models.types.ts` line survives. Open decision: keep the root `"."`
  export as a models-only entry, or drop it and make `./pg`, `./mysql`, `./sqlite`
  the whole public surface.
- Stale comments: `vite.config.ts` (explains the missing mionVitePlugin by pointing
  at toDrizzleXTable's marker param) and the `models.types.ts` header (frames the
  models as payload shapes "for a table generated with toDrizzleXTable").
- The model-utility type coverage in `postgres.stub.ts` (modelUtilityFlow) dies with
  that stub; re-home it into a proxy stub.

Keep untouched:

- `src/proxies/**`, `proxy-*.stub.ts`, `proxy-completeness.stub.ts`,
  `manifests/<dialect>.manifest.json`, `type-inference.spec.ts` (glob-based),
  `param-recovery.stub.ts` (the pinned spike justifying the proxies),
  `src/types/models.types.ts` + `models.spec.ts`.

Examples (`packages/examples/src/`):

- Delete: `drizzle/drizzle-postgres-example.ts`, `drizzle-mysql-example.ts`,
  `drizzle-sqlite-example.ts`, `drizzle-keys-example.ts`,
  `drizzle-length-buffer.ts` (lengthBuffer has no proxy analogue).
- Rewrite onto proxy tables: `drizzle/drizzle-model-types.ts` and
  `_homepage/home-drizzle.ts` (the mion home page twoslash card is load-bearing).
- A sqlite proxy example does not exist yet; add one to keep three-dialect coverage.

Website (`container/website/sites/mion/content/`):

- `03.drizzle-orm/00.drizzle-overview.md`: full rewrite, its whole thesis is
  "types are the source of truth"; all six code-imports are types-first.
- `03.drizzle-orm/01.column-mapping.md`: SHIPPED as a rename to
  `01.column-formats.md` carrying the inverse reference (column builder to format
  per dialect and mode).
- `03.drizzle-orm/02.table-first-proxies.md`: SHIPPED as deleted; its content was
  absorbed into the rewritten overview, which is now the tables-first page.
- `index.md` drizzle card (line ~175) says "Auto-generate Drizzle ORM table schemas
  directly from types"; rewrite the card text and fix the link if the overview page
  is renamed. Touch ONLY the card prose, index.md is hand-tuned.
- Re-run `pnpm run check-code-imports` plus the website check-links /
  unused-examples gates.

Small drift fixes in the same PR:

- `packages/drizzle/README.md` tagline ("Auto-generate Drizzle ORM table schemas
  from TypeScript types") to the proxies pitch.
- `.claude/skills/drizzle-slim-schemas/SKILL.md` cites `src/mappers/*.mapper.ts`
  as the mapping authority; after deletion the manifest + the skill's own table are
  the authority, reword.
- Comment drift in `packages/ts-runtypes/test/types/formatIntrospection.test.ts:4`
  (describes drizzle keying column maps off sentinels).

Unaffected (checked): test-server, mion-bench, the twoslash server config and
external-deps allowlist, release e2e package lists, runtypes site content.

## Decisions taken (were open for the implementer)

- Root `"."` export: DROPPED entirely; `./pg`, `./mysql`, `./sqlite` are the whole
  public surface and re-export InsertModel/SelectModel/UpdateModel. Run
  `rtx release e2e` before publishing to sweep the packaged exports.
- The salvaged column-to-format table shipped as the `01.column-formats.md` docs
  page (consumer mirror of the manifest + skill table).
- Version bump: deferred to the release curation (breaking change noted in PR #158).

## Done when

- The toDrizzleXTable lane, mappers, core/ and their types/stubs/specs are gone;
  `pnpm --filter @mionjs/drizzle test`, `pnpm typecheck:test`, lint/format and the
  manifest `--check` gate are green.
- InsertModel/SelectModel/UpdateModel remain exported and tested, with the
  model-utility type coverage re-homed onto a proxy table.
- Examples and the website drizzle section describe ONLY the drizzle-native
  workflow; the homepage card compiles and renders; code-import and link gates pass.
- README and the migration skill no longer reference the removed lane.

## Plan — remove the lane in PR #158 (approved 2026-08-27)

Decisions taken with the developer:

- The root `"."` export is DROPPED entirely: `./pg`, `./mysql`, `./sqlite` become the
  whole public surface. InsertModel/SelectModel/UpdateModel move into the three
  subpath modules via explicit named type re-exports (they shadow the star cleanly).
- The column-mapping docs page is replaced by an INVERSE reference (column builder to
  format per dialect and mode); the tables-first page is absorbed into the rewritten
  overview and deleted.
- The removal lands in the SAME branch and PR as the proxy builders (PR #158), not a
  separate PR as originally intended.
