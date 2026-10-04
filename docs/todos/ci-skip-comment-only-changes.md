---
type: chore
spec: full-plan
status: blocked
created: 2026-10-04
---

# CI skips lanes when code changes are only comments or blank lines

Starting point: `main` with the "CI keeps the runs a new commit does not affect" work merged (gate-owned cancel, `supersede.mjs`, per-lane marker saves). Pull `main` and start a fresh branch from it.

## Problem

A lane's hash (`scripts/ci/lanes.mjs:145` `laneHashes`) is built from git object ids:

    digest.update(`${entry.objectname} ${entry.path}\n`);   // lanes.mjs:161

So a commit that only edits a comment or a blank line in a `.ts` or `.go` file changes the blob id, the lane hash moves, and every lane that reads the file runs again from zero: the Go suite plus fuzz, the JS suite, the container smoke, the website build, benchmarks, e2e, drizzle. This repo makes such commits often (every PR carries a `chore(comments):` commit from the simplify-comments pass), so each PR pays a full extra run for a change no test can see.

What we want: when every changed JS/TS and Go file differs from the reference only in comments or blank lines, the test lanes count as unchanged. The reference is either:
- the PR base (a whole PR that only touched comments), or
- the commit the last run tested (a new push that only touched comments).

## Approach

Hash a code file by its **code tokens**, not its bytes. Then both references work for free through the gate that exists today:
- PR base: `decide`'s `unchangedFromBase` (lanes.mjs:205) compares lane hashes with the base tree. Equal token hashes, equal lane hash, lane skips.
- Last run: a green marker saved by the last run sits under the same hash, so the lane skips. While the last run is still going, `supersede.mjs` sees equal hashes and keeps it, and the new run waits for its marker.
- It also chains: three comment-only pushes in a row still map to the first run's hash. A diff-against-one-commit design cannot do that.

Checks that READ comments (format, lint, typecheck, the contract tests, codegen drift) keep hashing raw bytes, in their own lanes, so a bad comment is still caught.

### The tool: `ts-go-runtypes/cmd/code-digest` (no new dependencies)

A small private Go command, built like `cmd/extract-fn-bodies` (which already parses TS with tsgo's parser through `github.com/microsoft/typescript-go/shim/parser`). It ships in `mion-bin/` next to `extract-fn-bodies` and is never published.

- **TS/JS** (`.ts .tsx .mts .cts .js .jsx .mjs .cjs`): parse with the tsgo shim parser (`shim/parser`, `shim/scanner`), so regex literals, template literals and JSX are read exactly as TypeScript reads them. Walk the tokens and emit `kind + text + hasPrecedingLineBreak` per token. The line-break flag keeps automatic semicolon insertion exact (`return /*\n*/ x` keeps its break), while blank lines and spacing drop out.
- **Go** (`.go`): stdlib `go/scanner` with comments off. It already emits the automatic semicolons, so the stream is exactly what the compiler sees.
- **Directive comments stay as tokens**, because they change what a tool does:
  - TS/JS: `@ts-` (expect-error, ignore, nocheck, check), `eslint-`, `oxlint-`, `/// <reference`, `/// <amd`, `#__PURE__`, `@__PURE__`, `#__NO_SIDE_EFFECTS__`, `@vite-ignore`, `webpack`, `@vitest-environment`, `@jsx`, `istanbul`, `c8`, `v8 ignore`, `prettier-ignore`, `oxfmt-ignore`, `# sourceMappingURL`.
  - JS only (`.js .mjs .cjs .jsx`): every `/** */` block, since `checkJs` packages (`packages/bin-compiler`, `packages/bin-uws`) take their types from JSDoc.
  - Go: `//go:`, `//line `, `// +build`, `//export`, `//nolint`, the cgo preamble before `import "C"`, and `// Output:` / `// Unordered output:` (example tests assert on them).
  - Keep the list in one Go table with a one-line reason per entry.
- **Wire**: reads `<objectname> <path>` lines on stdin, reads the blobs itself through one `git cat-file --batch`, parses in parallel, prints `<objectname> <digest>`. A file that fails to parse prints its objectname unchanged (raw hash, so it runs).
- **Digest = sha256 over the token stream, prefixed by the tool's own version** (a constant bumped when the token rules change), so a rule change re-keys every marker instead of trusting old ones.

### Which files are token-hashed

Code extensions above, EXCEPT where line numbers or exact text are observable:
- any `testdata/`, `fixtures/` or `__snapshots__/` directory (Go goldens report line:col of TS fixtures);
- `packages/private-examples/` (the website shows the code, comments included);
- `*.generated.ts` and other codegen output (the codegen drift check compares bytes);
- `_deps/` trees and `ts-go-runtypes/third_party/`.

One `TOKEN_HASHED` predicate in lanes.mjs owns this list. Audit before shipping: every vitest or Go test that reads a source file as text, or asserts a line number of a non-fixture file (seen in passing: `packages/devtools/test/compile-cli-mion.test.ts`, `convert-cli.test.ts`, `cli-surface.test.ts`, `eslint/oxlint-e2e.test.ts`, `eslint/prefilter.test.ts`, `packages/rpc-client/test/bundleSplit.spec.ts`, `helpers/inline.ts`, and every `*-contracts.test.ts`). Each one either reads only raw paths, or runs in the raw `js-static` lane below.

### Lane changes (`scripts/ci/lanes.mjs`)

- Each lane gets `hash: 'tokens' | 'raw'`.
  - `tokens`: `go`, `js-fuzz`, `js`, `smoke` (+ items), `website`, `bench` (+ items), `e2e` (+ items), `drizzle` (+ items).
  - `raw`: `go-tools` (generators read comments, e.g. diagnostic prose), plus two NEW lanes:
    - `js-static` (JS paths): `check-format:js`, `pnpm run lint` (both linters + typecheck), `check-code-imports`, `check-types-examples`, and the contract tests (`vitest run` over `*contracts*`).
    - `go-static` (`GO_TREE` paths): `Go formatting` and `Go vet`.
- `laneHashes` runs `mion-bin/code-digest` once over the union of HEAD's and the base's token-hashed blobs (deduped by object id, so shared blobs parse once), then uses the digest in place of the objectname for `tokens` lanes.
- **Fail safe**: no binary, a non-zero exit, or a timeout (budget 30 s) → `tokens` lanes hash raw. A raw-mode hash gets an `r-` prefix and a token-mode one a `t-` prefix, so the two never match each other's markers. `decide`'s summary row says which mode ran.
- Local `pnpm miondevx core lanes` uses the same binary, so it matches CI.

### Build and CI wiring

- `scripts/core/build.mjs`: add `code-digest` beside `extract-fn-bodies` (`EXTRACT_PKG` pattern, line 64, own stamp), include its source in `goBinCacheKey` (line 148), and build it in the default target so local and CI agree.
- `.github/actions/ci-lanes/action.yml`: before deciding, restore `mion-bin/` with `actions/cache/restore` under `node scripts/core/build.mjs --cache-key` (git + node only, no install). A miss means raw mode for this run, never a failure.
- `.github/workflows/ci.yml`:
  - js-lint job: the static steps (line 266 `Check formatting` to line 304 `Typecheck the mion examples`, plus a new contract-test step) gate on `js-static.run`; the test steps from line 306 on gate on `js.run`. The job `if:` runs when either is set. Save `js-static`'s marker right after its last step.
  - go-fuzz job: `Go formatting` and `Go vet` (lines 139, 149) gate on `go-static.run`, with its own early save.
  - New lanes join `skip-defaults` and the `gate` field from the earlier spec (both blocked by `skip-defaults`), and any waiter `lanes:` list that covers their job.
- `.github/actions/ci-lanes/action.yml` description and the lanes.mjs header: one line each on token hashing.

## Tests

Go, `ts-go-runtypes/cmd/code-digest/*_test.go`:
- Equal digests: comment added, removed or edited; blank lines added or removed; spacing changed (TS and Go).
- Different digests: any token change; a directive comment changed (one case per table row); a line break that changes semicolon insertion (`return\nx` vs `return x` in TS, a statement split in Go); a comment inside a string, template or regex literal changed (`"// x"`, `` `/* y */` ``, `/\/\*/`).
- A file that fails to parse returns its objectname.

Vitest, `packages/devtools/test/`:
- `ci-lanes-tokens.test.ts`: `laneHashes` with a fake digest runner: `tokens` lanes use digests, `raw` lanes use objectnames, the prefixes differ, a runner failure falls back to raw. `TOKEN_HASHED` excludes every listed directory.
- End to end on a scratch git repo: a comment-only commit leaves every `tokens` lane hash equal and moves `js-static` and `go-static`; a code commit moves all of them.
- `ci-lane-contracts.test.ts`: the js-lint static steps gate on `js-static`, the test steps on `js`; `go-static` owns gofmt and vet; every lane in `LANES` has a `hash` mode.

Run `go -C ts-go-runtypes test ./cmd/code-digest/...`, `pnpm exec vitest run ci-`, `pnpm run lint`.

## Fuzzing

Good candidate, two cheap oracles:
- Metamorphic, over every token-hashed file in the repo: insert random comments and blank lines between tokens → digest unchanged; change one random token → digest changes.
- Trusted source for TS: the comment ranges `code-digest` drops must equal the ones TypeScript's own scanner finds (the `typescript` package in the test, `ts.forEachLeadingCommentRange` / trailing over every token). For Go: `go/parser` + `go/printer` without comments as the reference.

Add it as a Go fuzz target (quick budget in the Go suite) per the fuzzy-testing skill.

## Live check on the PR

1. Push a commit that only edits comments in `packages/run-types/src` and a `.go` file. Expect: `go`, `js`, `js-fuzz`, smoke and the labelled heavy lanes skip ("these exact inputs already passed"); `js-static`, `go-static` and `go-tools` run.
2. Push a comment-only commit while the previous run is still going. Expect the older run to be kept and the new run to wait for it.
3. Push a one-token code change. Expect everything that reads it to run.

Note each result in the PR body.

## Docs

The website: none, because this is contributor CI that no consumer uses. `SETUP.md` CI lanes paragraph (line 105): one sentence saying a change that only touches comments or blank lines in code skips the test lanes, while format, lint and contract checks still run. No website page or example is touched, so no simplify-docs pass is needed.

## Out of scope

- The per-file test skip (`scripts/core/test-skip.mjs`) still hashes raw bytes. Token-hashing its inputs is a separate change once this one proves out.
- The Go binary cache key (`goBinCacheKey`) still moves on a comment-only Go change.
- Non-code files (JSON, YAML, CSS, Markdown) stay raw.

## Done when

- A comment-only or blank-line-only commit to JS/TS or Go skips every token-hashed lane, against the PR base and against the last run (live checks 1 and 2).
- Format, lint, typecheck, contract tests, gofmt, vet and codegen drift still run on such a commit.
- A missing or failing `code-digest` falls back to raw hashing and runs everything.
- New tests and the fuzz target pass; `pnpm run lint` is clean.
- The simplify-comments pass ran on every touched source file and was committed on its own (`chore(comments):`). No website page or example was touched, so there is no simplify-docs commit.
- The spec is moved to `docs/done/` and updated to match what shipped.
