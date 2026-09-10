---
type: fix
spec: guidelines
status: done
created: 2026-09-09
---

# Split Error into fatal Errors and RuntimeErrors

## Intent

"Error" meant two unrelated things, and the difference is the one that matters:
**can the build still emit code or not.** Because the two were lumped, a blank
enrichment label could stop a bundler build while a route lint finding could not
stop anything, and neither outcome was designed.

Three levels now say what they mean, so a consumer knows what it is allowed to do
without reading the catalog.

## What shipped

### One authored field, `Level`, with `Severity` derived from it

`Definition.Level` is the field a code author writes; `register` panics on the
zero value (like `Scope`) and *computes* `Severity` from it, panicking if a
`codes_*.go` literal writes one by hand.

```go
const (
	LevelError        Level = 1 // no code was produced for the thing
	LevelRuntimeError Level = 2 // code IS written, and it is broken when called
	LevelWarning      Level = 3 // worth knowing, nothing is wrong
)
```

That was the open question the spec asked to settle first, and this is the answer
it landed on. A fourth `Severity` value was rejected: `SeverityLabel` feeds VS
Code's `$tsc` problem matcher, and roughly fifteen places switch on
`== SeverityError`, so a new enum value would have stopped matching them silently
rather than failing to compile. Deriving instead leaves every one of those correct
by construction. A loose `Fatal bool` was rejected too, because it permits the
nonsense combination `Fatal + Warning`.

`Level` also rides the WIRE next to `Severity`, because a locally built binary can
run ahead of the generated front-end catalog and a build-halt decision must not
depend on the two being in sync.

### The line the classification actually turned on

The spec's two questions were kept, with question 1 sharpened after reading the
emit path: **did the build produce the code for this thing.** It is per-site, not
per-build. Only `CFG001` stops a whole run; every other fatal code leaves ONE
thing unbuilt (no cache entry, no injected id, no extracted body, no batch id)
while the rest of the build proceeds. That is what makes standing one down
meaningless: not halting buys a call that throws either way.

### Every code re-read, and the verdict recorded on the code

173 codes: **17 Error, 74 RuntimeError, 82 Warning.** The verdict IS the authored
`Level`, defended in a comment wherever it is not obvious. Both directions moved.

Down to Warning, because the build emits and what it emits is correct:

| Code | Why |
| --- | --- |
| `MKR006` | The scan DEDUPES the repeated fn key and emits the site normally |
| `NE001` | `@nonEnumerable` on a required property is an ineffective tag; the function is right for the declared type |
| `EXP001`-`EXP003` | Only a comment is wrong. mion does not copy TypeScript here, where the same finding is an error, because in mion an error fails a build |
| `FT002`, `MD001`, the orphan carcasses, the unfilled scaffolds, and every FriendlyText content check | The message still renders, it just falls back to something less specific. Degraded text is enrichment that did not apply, not a broken function |

Up from Warning, because the build emits something broken:

| Code | Why |
| --- | --- |
| `MKR012` | The entry ships reflecting `unknown`, so the validator accepts everything. Its own comment already called that the worst shape of failure |
| `BAT008`, `BAT009` | The batch id IS injected and no table row matches it, so every request comes back a 404 `batch-unknown-id` |

Two decisions differ from the draft above, both confirmed with the author:

- **`MRT001`-`MRT005` are RuntimeErrors, not Warnings.** The draft filed them under
  "nothing is wrong" because a build never asks for them. But each describes a route
  that ships broken: mion compiles the DECLARED types, so a missing annotation
  leaves nothing validating the input or serializing the response. Their lint rules
  keep their `error` default.
- **`BAT001`-`BAT006` are fatal Errors, not Warnings.** The draft said `BAT001`
  "just ships the batch without an id, which one of its own tests asserts". That
  test was the proof of the opposite: a batch with no id throws `batch-missing-id`
  synchronously at call time, so not halting buys nothing. The test now asserts the
  config is refused.

### The pure-fn family turned out not to be fatal

The spec assumed `PFE9xxx` was fatal as a block, and four places hardcoded that.
Reading the emit path says otherwise: only `PFE9005` withholds output. A purity
violation compiles the offending body and ships it (`walker.go`: "Build never
fails; the entry still emits even when violations exist"), a hash collision
rewrites both call sites to one body, and a missing dep ships a file that throws.

So nine of the ten are RuntimeErrors. They still fail every build by default; they
are simply downgradeable now, which is honest, because the old rule did not prevent
bad output, it only refused to finish.

### The four hardcoded checks, gone

| Where | Now |
| --- | --- |
| `unplugin.ts` surfacing call | splits on `d.level === Level.Error` |
| `downgrade.go` `ResolveDowngrade` | refuses `LevelError` |
| `downgrade.go` `Downgraded` | downgrades only `LevelRuntimeError` |
| `expecterror.go` `Suppressible` | refuses `LevelError` |

Plus the two TypeScript twins in `downgradeErrors.ts`.

### Eight unreachable codes deleted

`PJ004`, `PJS004`, `RJ004`, `SJ004`, `TB004`, `TB005`, `FB004`, `FB005` (the
propagating array-element errors) had message text, wording-table rows and lint
routing, but nothing emitted them: the only helper that could, `RTThrowDiagSlot`,
had zero callers, and a test pins that the real trigger (`{a: symbol[]}`) reports
the ROOT code instead. Found while classifying, so removed here along with the
dead slots and the helper. 181 codes became 173.

### Consequences that had to be handled, not discovered later

- **`Completeness` is deliberately NOT a level.** The unfilled-scaffold codes are
  Warnings now, so `enrich --require-complete` and the bundler's production
  enrichment gate read the bit directly. Keying either on the level would have
  silently stopped it failing on anything.
- **`downgradeErrors` reaches the completeness findings**, so `'*'` still lets a
  project ship as it always did.
- **The lint drift guard is one-directional.** A rule may never default to `warn`
  while carrying a non-Warning code; the reverse is a rule author's call. That is
  how `enrichment-field` keeps an editor squiggle for a dead map entry that no
  longer stops a build. The enrichment content codes now route per code, because a
  severity tier could no longer tell a field finding from a message one.

## Done when

- [x] All 173 codes re-read and carrying a level chosen by the two questions,
      warnings included, recorded per code and defended where not obvious.
- [x] The four hardcoded pure-fn checks gone, replaced by the level.
- [x] `downgradeErrors` and `@mion-expect-error` both refuse fatal Errors and both
      accept RuntimeErrors. Verified end to end against a real project.
- [x] `ts-go-runtypes/CLAUDE.md` states the three levels and the question that
      picks between them, next to the Scope rule.
- [x] The website's diagnostics page explains the three levels, and the per-lane
      behaviour table tells the truth afterwards.

## Not done

The docs website was NOT checked in a browser. Its container image needs a rebuild
(from an unrelated earlier commit on the same branch), and that build cannot fetch
`better-sqlite3`'s node-gyp binary through this sandbox's proxy. The catalog data
and the component's level maps were verified statically instead: every one of the
173 codes carries a level, and all three badge classes exist.
