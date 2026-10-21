---
type: fix
spec: guidelines
status: done
created: 2026-09-21
---

# Enrichment errors tell users to run a verb that does not exist

## Intent

Several user-facing messages under
[ts-go-runtypes/internal/enrichment/mirror/](../../ts-go-runtypes/internal/enrichment/mirror/) tell
the reader to run `gen`. There is no `gen` verb. The CLI's flag set is named `enrich`
(`ts-go-runtypes/cmd/mion/enrich_cli.go`), and `--update` / `--prune` live on it, so the real
commands are `mion enrich --update` and `mion enrich --prune`.

The messages:

```go
// drift.go
"breadcrumb source %q resolves to a non-existent file (%s) — orphaned mirror; delete it or re-run gen"
"source %s no longer declares type %q — re-run gen"

// index.go
"gen --update: cannot parse mirror %s; fix or delete it"
"gen --update: cannot parse mirror %s (%d syntax error(s)); fix or delete it: %s"
"gen --update: duplicate @rtType id %q (form %s) on both %q and %q — keeping the first; fix the marker on the second"

// splice.go (two more of the same shape)
```

A diagnostic whose remedy names a command that does not exist is worse than one with no remedy: the
reader types it, gets "unknown command", and has to go looking.

The comment pass already corrected every COMMENT that named `gen`. These are string literals, which a
comments-only change may not touch, which is why this spec exists.

## What to settle

Replace `gen` with the real verb in every user-visible string in that package, matching how the CLI
spells it. Check the whole tree for the same word rather than only the lines above, including the
GE002 / GE003 message text and any `Detail` prose in the diagnostic catalog.

Then look at whether the check lane is named correctly too: the report said the check path is
`enrich <file> --no-emit`, so a message pointing at a separate "check command" is the same bug.

## Evidence to produce

- The search proving no user-visible `gen` remains, catalog prose included.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` green. At least one test pins the old wording
  (`mirror/hygiene_test.go` expects a detail string containing `run gen --prune`), so the fix
  includes updating that expectation rather than working around it.
- A manual check that the suggested command actually runs, so the new text is not wrong in a
  different way.

## Watch out

- Some of these strings are diagnostic DETAIL prose that reaches the website's diagnostic pages.
  Regenerate the catalog (`pnpm miondevx core codegen diag`) if any catalog text changes, and commit
  the regenerated file.
- Do not rename the Go identifiers (`enrichgen`, `gen*` function names) while you are in there. Only
  the text a user reads is wrong.

## Origin

Found during a repo-wide comment simplification pass, which corrected the same stale verb in twelve
comments in this package and could not touch the strings.

## What shipped

Every user-visible string that named a `gen` command now names `mion enrich`.

| File | Was | Now |
| --- | --- | --- |
| `mirror/drift.go` (GE002, GE003) | `re-run gen` | `re-run mion enrich` |
| `mirror/index.go` (3 strings) | `gen --update:` | `mion enrich --update:` |
| `mirror/splice.go` (2 strings) | `gen --update:` | `mion enrich --update:` |
| `cmd/mion/enrich_gencheck.go` (GE001, 3 strings) | `re-run gen to relocate` / `to migrate/relocate` | `re-run mion enrich to …` |
| `internal/diagnostics/messages.go` (FT011, MD011 Detail prose) | `so gen refuses the type` | ``so `mion enrich` refuses the type`` |
| `packages/run-types/src/enrich/friendlyText.ts` (public JSDoc) | `` `gen --update` `` | `` `mion enrich --update` `` |

The diagnostic catalog was regenerated (`pnpm miondevx core codegen diag`), which updated
`packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts` and
`container/website/app/components/content/go-generated/diagnostics-catalog.json`.

The GE002 / GE003 / GE001 / FT021 / FT022 / FT023 catalog headlines and Fix prose already spelled
`mion enrich`, so only the two Detail strings above changed there.

The check lane needed no rename: no user-visible string named a separate `check` command. The only
`mion check` mentions left are code comments, which the comment lane owns.

## Tests

`ts-go-runtypes/internal/enrichment/mirror/cli_verb_test.go` is new:

- `TestNoStaleGenVerbInUserVisibleStrings` parses every Go file under `internal/enrichment/`,
  `cmd/mion/` and `internal/diagnostics/`, and fails on any STRING literal matching `gen --…` or
  `run gen`. Comments are not scanned, so it only pins the text a user reads.
- `TestBreadcrumbDriftMessagesNameTheEnrichVerb` pins the GE002 and GE003 messages.
- `TestParseMirrorErrorNamesTheEnrichVerb` pins the reconcile parse-failure message.

`mirror/hygiene_test.go`'s catalog-like fixture was updated from `run gen --prune` to
`run mion enrich --prune`.

Both guards were proven to fail when a message is reverted to the old wording.

Manual check: `mion enrich --prune .` exits 0, `mion gen --update` prints `mion: unknown command
"gen"`.
