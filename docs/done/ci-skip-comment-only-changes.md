---
type: chore
spec: full-plan
status: done
created: 2026-10-04
---

# CI skips lanes when code changes are only comments or blank lines

Built before the "CI keeps the runs a new commit does not affect" work, which was not merged yet. That work compares the same lane hashes, so once it lands a comment-only push also keeps an older run that is still going.

## Problem

A lane's hash (`laneHashes` in `scripts/ci/lanes.mjs`) was built from git object ids, so a commit that only edits a comment or a blank line in a `.ts` or `.go` file moved every lane that reads it: the Go suite plus fuzz, the JS suite, the container smoke, the website build, benchmarks, e2e, drizzle. Every PR here carries a `chore(comments):` commit, so each one paid a full extra run for a change no test can see.

## What shipped

Code files hash by their **code**, not their bytes, in the lanes marked `hash: 'tokens'`. Both references work through the existing gate with no extra logic:
- PR base: `decide`'s `unchangedFromBase` sees equal hashes.
- Last run: its green marker sits under the same hash. Several comment-only pushes in a row still map to the first run's hash.

### `ts-go-runtypes/cmd/code-digest`

A private Go command (no new dependency), built into `mion-bin/code-digest`.
- **TS/JS** (`.ts .mts .cts .js .mjs .cjs`): parsed with the tsgo shim parser. The digest is the syntax tree minus trivia: each node as `(kind … )`, each token as `kind length:text`. Token nodes (identifiers, literals, regex, template parts) are emitted whole; the punctuation and keywords between children come from a scanner over that gap. The tree carries what line breaks decide (automatic semicolons), so line breaks drop out. A check that every non-trivia byte was emitted exactly once guards the walk: anything else falls back to raw.
- **Go**: stdlib `go/scanner` with comments off; automatic semicolons are tokens.
- **Directives**: every line holding a marker (`@ts-`, `eslint-`, `oxlint-`, `/// <reference`, `__PURE__`, `@vitest-environment`, `//go:`, `//nolint`, … one table in `directives.go`) is added as text. Over-sensitive on purpose: it can only cause a re-run.
- **JSDoc in JS files** is kept whole (`checkJs` packages take their types from it), read from the real comments in the trivia.
- **Raw fallback** for one file (`<objectname> -`): a parse error, a cgo preamble, a Go `func Example`, an unknown extension.
- `toolVersion` is folded into every digest, so changing the rules re-keys every marker.
- Wire: `<objectname> <path>` lines on stdin, one `git cat-file --batch`, parallel digests. The whole repo takes about 2 s.

### Lanes (`scripts/ci/lanes.mjs`)

- Tokens: `go`, `js-fuzz`, `js`, `smoke`, `website`, `bench`, `e2e`, `drizzle` (items included), hashes prefixed `t`.
- Raw: `go-tools` (generators copy comments into what they emit), and two new lanes in `ci.yml`: `js-static` (format, drizzle version guard, env, test-batch and typecheck coverage, lint + typecheck, code imports, mion examples, and a new `Contract tests` step running `vitest run contracts`) and `go-static` (gofmt and vet).
- `TOKEN_HASHED` keeps raw: any path with `fixture`, `testdata` or `__snapshots__`, `packages/private-examples/`, `*.generated.ts`, `_deps/`, `node_modules/`, `third_party/`, and JSX files.
- `codeDigests` runs the tool once over HEAD and the base together. A missing or failing tool gives mode `r`: tokens lanes hash raw under an `r` prefix, so they never match a token marker.

### CI wiring

- `scripts/core/build.mjs`: target `digest` (in `all`), its own stamp, and `--digest-cache-key`. Its inputs leave out `internal/`, so a resolver edit does not drop the gate to raw while the entry rebuilds.
- `.github/actions/ci-lanes`: restores `mion-bin/code-digest` under that key before deciding; a miss means raw for the run.
- `.github/actions/resolver`: restores the same entry, sets up Go on a miss of either entry, builds and saves it.
- `ci.yml`: js-lint runs on `js || js-static` with the static steps on `js-static` and the suite steps on `js`; go-fuzz adds `go-static` for gofmt and vet. Both new lanes save their marker at the end of the job, beside the others.

## Tests

- `cmd/code-digest/digest_test.go`: equal digests for comments, blank lines, spacing, JSDoc in TS, a `//` comment quoting JSDoc; different digests for a token, an operator, a moved line break that changes semicolon insertion, comment-like text inside a string, template or regex, a JSDoc type in JS, Go token and statement changes; every directive row moves the digest; raw fallbacks.
- `cmd/code-digest/property_test.go`: every repo code file digests without a fallback; a seeded sweep over real repo files (`MION_FUZZ_SEED`) inserts comments and blank lines before tokens (never on a directive line) and checks the digest holds, then renames an identifier inside a code token and checks it moves.
- `packages/devtools/test/code-digest-oracle.test.ts`: TypeScript's own JS parser finds every comment in every token-hashed TS/JS repo file (about 29,000), the test strips the non-directive ones, and the Go digest must not move. It caught the JSDoc-in-a-line-comment case before shipping.
- `packages/devtools/test/ci-token-hash-contracts.test.ts`: hash modes, `TOKEN_HASHED`, digests only in tokens lanes, the `t` / `r` prefixes, fallbacks, a scratch repo where a comment-only commit keeps every tokens hash and moves the raw lanes, and the CI wiring.
- Updated: `ci-lane-contracts.test.ts` and `ci-skip-defaults-contracts.test.ts` for the new lanes; `eslint/prefilter.test.ts` now allows any spacing around `=` in the Go constants it reads, since gofmt can re-align a block after a comment edit.

## Audit of tests that read code as text

`prefilter.test.ts` (fixed above), `bundleSplit.spec.ts` (looks for code strings), the Go `family_test.go` (parses without comments) and `regexsafety/shipped_patterns_test.go` (reads registered patterns) only match code. Fixture readers already sit under raw paths.

## Docs

`SETUP.md`, CI lanes paragraph: one sentence each on token hashing and on what still runs. No website page.

## Out of scope

- The per-file test skip (`scripts/core/test-skip.mjs`) still hashes raw bytes.
- The Go binary cache key still moves on a comment-only Go change.
- Non-code files (JSON, YAML, CSS, Markdown) stay raw.
