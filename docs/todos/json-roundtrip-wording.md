---
type: docs
spec: guidelines
status: ready
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
