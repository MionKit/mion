---
type: feature
spec: guidelines
status: done
created: 2026-10-01
---

# Name the URL formats like the Date formats

## Intent

The date formats follow one rule: the object keeps its class name, the string form gets a `String` prefix
(`TF.Date` / `TF.date()` for a `Date`, `TF.StringDate` / `TF.stringDate()` for a date string, `TFT.PlainDate` for a
Temporal object). The URL formats break it: the string forms hold the plain names (`TF.Url`, `TF.UrlHttp`,
`TF.UrlFile`, `TF.url()`, `TF.urlHttp()`, `TF.urlFile()`) and the URL-object forms carry a `Native` prefix
(`TF.NativeUrl`, `TF.NativeUrlHttp`, `TF.NativeUrlFile`, `TF.nativeUrl()` …). Apply the rule:

| Today | After |
| --- | --- |
| `TF.Url`, `TF.UrlHttp`, `TF.UrlFile` (string) | `TF.StringUrl`, `TF.StringUrlHttp`, `TF.StringUrlFile` |
| `TF.url()`, `TF.urlHttp()`, `TF.urlFile()` (string) | `TF.stringUrl()`, `TF.stringUrlHttp()`, `TF.stringUrlFile()` |
| `TF.NativeUrl`, `TF.NativeUrlHttp`, `TF.NativeUrlFile` (URL object) | `TF.Url`, `TF.UrlHttp`, `TF.UrlFile` |
| `TF.nativeUrl()`, `TF.nativeUrlHttp()`, `TF.nativeUrlFile()` | `TF.url()`, `TF.urlHttp()`, `TF.urlFile()` |

`TF.Uri`, `TF.UriReference`, `TF.UriTemplate`, `TF.Iri`, `TF.IriReference` stay as they are: no class backs them.

## Direction

- A public rename, so it breaks consumers. It breaks loudly: code that kept `TF.Url` for a string now names a URL
  object, and a string is not assignable to it. Per the "a removed thing leaves no trace" rule, no alias or shim for
  the old names.
- Only the TypeScript names move. The Go format names stay (`url` for the string family, `nativeUrl` for the object),
  so ids, error keys and `rtFormat` in JSON Schema are unchanged. Check that claim while planning.
- Starting points: the URL section of `packages/run-types/src/formats/string/stringFormats.ts` (both families live
  there), `packages/run-types/src/formats/index.ts` (exports), and `ts-go-runtypes/internal/schemadoc/leaf.go`
  (`FormatFamilies`: the convert printer's builder and alias names for `url` and `nativeUrl`).
- Other users of the names: the run-types tests and enrich cases, the Go convert and resolver tests,
  `packages/private-examples/src/guide/`, and `container/benchmarks/competitors/mion` (so the PR needs the `bench`
  label, plus `website` and `pre-publish-e2e`).
- Add a CHANGELOG entry for the rename.

The implementer plans the details.

## Docs

`container/website/content/02.runtypes/03.type-formats/02.string.md`: existing section "Named String Formats" (the
URLs row) and existing section "URL Objects" (rename its names). Also the String row of the table in
`03.type-formats/01.overview.md`, and any page or example that names `TF.Url` / `TF.url()`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The table above holds: no `NativeUrl*` / `nativeUrl*` identifier, type or builder name (the format name string
  `'nativeUrl'` stays) and no string-form `TF.Url*` / `TF.url*` name is left in the TypeScript surface, docs, examples
  or tests.
- Ids and generated code for both families are unchanged (only spellings move).
- `pnpm test`, the Go tests, `pnpm run lint` and `typecheck` pass; the PR carries `website`, `bench` and
  `pre-publish-e2e`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each
  committed on its own.

## What shipped

- The table above, as written. The helper types behind the object family were renamed too (`NativeUrlParams` -> `UrlObjectParams`, `NativeUrlFormat` -> `UrlObjectFormat`, `NativeUrlPresetBuilder` -> `UrlObjectPresetBuilder`), and the mock helper `mockNativeUrl` -> `mockUrlObject`, so no `NativeUrl*` identifier, type or builder name is left in the TypeScript. The format name string `'nativeUrl'` stays, as a Go name. The test file is now `urlObject.test.ts` and the example `type-formats-url-object.ts`.
- Go: `FormatFamilies["nativeUrl"]` now prints builder `url` and alias `Url`; the convert printer writes `url()`; the two error texts say `Url:`. The Go format names (`url`, `nativeUrl`) are untouched, so ids, error keys and `rtFormat` did not move.
- Tests: the existing suites moved to the new names, and new tests pin that `TF.StringUrl` and `TF.Url` keep different ids (both `getRunTypeId` call shapes), that a string no longer fits `TF.Url` (a compile probe), and that the two Go error texts start with `Url:`.
- The CHANGELOG is generated from commit subjects, so the rename is recorded by a `feat(run-types)!:` commit with a `BREAKING CHANGE:` footer.
