---
type: docs
spec: guidelines
status: done
created: 2026-09-30
---

# Say JSON Round Trip Instead of Serialization

## Intent

The RunTypes home page already explains the feature as a "JSON roundtrip"
(`container/website/content/02.runtypes/01.introduction/01.about-mion-runtypes.md`, section "JSON roundtrip",
example `packages/private-examples/src/_homepage/json-roundtrip.ts`). The maintainer finds that term more
accurate and descriptive than "serialization": a value goes to JSON and comes back as the same value
(`bigint`, `Date`, `Map`, `Set` included), and "serialization" only names the first half.

Use "JSON round trip" everywhere a reader meets the idea, one spelling across the whole site.

## Direction

- Website pages (about 84 lines in 32 files under `container/website/content/`), including the three pages
  titled "Serialization": `01.rpc/02.server/07.serialization.md`, `02.runtypes/02.guide/04.serialization.md`,
  `03.benchmarks/03.runtypes/05.serialization.md`. A renamed page file changes its URL: update every link,
  and the old URL simply goes away (no redirect, per the maintainer's choice for this docs restructure).
  Section titles and anchors too; grep the content tree for each old anchor.
- Code comments in `packages/*/src` (about 86 lines mention serialize or serialization) and in the examples
  under `packages/private-examples/src/` (about 12 lines) when they describe the JSON round trip.
- Pick ONE spelling first ("JSON round trip" in prose, "JSON Round Trip" in Title Case headings) and apply it
  everywhere, the home page's "JSON roundtrip" included.
- Keep public API names as they are (`createJsonEncoderFn`, `createJsonDecoderFn`, the `parser` option,
  `SerializerCode` and the like). Renaming an API is out of scope; if one reads badly next to the new
  wording, list it for the maintainer instead.
- Not every "serialize" means the JSON round trip: encoding one way only (the encoder alone, error
  serializers, the response writer) may keep its verb. Change the wording only where the text means the
  whole round trip or names the feature.
- Follow the website writing rules in the root `CLAUDE.md` and `container/website/CLAUDE.md`, and finish
  with the docs and comments simplification passes.

## Done when

No page, heading, example comment or source comment calls the feature "serialization" where it means the
JSON round trip, every link and anchor still lands (`packages/devtools/test/website-links.test.ts`), and the
one spelling is used everywhere.

## Plan (approved 2026-10-01)

One spelling: "JSON round trip" in prose, "JSON Round Trip" in Title Case headings, `json-round-trip` in
slugs and file names.

- Rename the three pages to `json-round-trip` (new URLs, no redirect from the old ones). Older redirect
  rules in `public/_redirects` that pointed at the old pages now point at the new ones.
- Rename the examples: `guide/serialization-*.ts` -> `guide/json-round-trip-*.ts`
  (`serialization-roundtrip.ts` -> `json-round-trip-calls.ts`), `run-types/serialization-union.ts` ->
  `json-round-trip-union.ts`, `_homepage/json-roundtrip.ts` -> `_homepage/json-round-trip.ts`.
  (Shipped differently: `run-types/serialization-union.ts` was deleted, see below.)
- Reword only the text that names the feature or means the whole round trip. Comments: only the ones that
  name the feature.

## What shipped

- Pages: the three renamed pages, every link to them, two section titles ("JSON Round Trip Steps" in the
  call context page, "JSON Round Trip in a Batch"), and the feature wording across about 30 pages,
  `index.md` included. The about page keeps its sentence case headings, so its section reads
  "JSON round trip".
- Redirects: the 7 `public/_redirects` rules that pointed at the old guide or benchmark page now point at
  `json-round-trip`. The three old URLs have no redirect. Catch-all rules (`/server/*` in
  `public/_redirects`, `/*` and `/benchmarks/*` in `legacy-runtypes/_redirects`) still map older paths
  such as `/server/serialization` onto the removed URLs, so those 404 too, by the same choice.
- Examples: renamed as planned, except `run-types/serialization-union.ts`, which no page imported (the
  guide page already covers unions with `guide/json-wire-format.ts`), so it was deleted. The
  `code-import` paths, `tsconfig.json`, `tsconfig.runtypes.json`, `eslint.config.js` and the two
  pre-publish e2e header comments are updated, plus the `@annotate` lines.
- Source comments: about 20 comments across `core`, `devtools`, `rpc-client`, `rpc-router`, `run-types`
  and `private-test-server`, plus the website's bench bars component, `subsites.ts` and
  `scripts/website/check-static.mjs`.
- Also reworded (readers meet them too): the root `README.md`, the `rpc-client`, `rpc-router` and
  `run-types` READMEs, and `docs/FUZZING.md`.
- Kept on purpose: "serializable" (data that fits JSON), the class serializer API, one way wording
  (encoder, decoder, "encode responses"), the network "round trip" of a batch, competitor code in the
  benchmark snippets, test file and suite names, and pure function code serialization.

### API names left for the maintainer

These read "serialize" next to the new wording. Renaming them was out of scope:

- `registerClassSerializer` and its `serialize` / `deserialize` options (also `unregisterClassSerializer`).
- `SerializerCode`.
- The `serialization-error` error code.
- The `bench="serialization"` data key and the `bench-data/serialization/` directory.
