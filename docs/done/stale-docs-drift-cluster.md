---
type: docs
spec: full-plan
status: done
created: 2026-07-25
completed: 2026-07-26
---

# Stale-doc drift cluster found during the ARCHITECTURE.md rewrite

> **Shipped 2026-07-26.** All findings are resolved; see
> [What actually shipped](#what-actually-shipped) at the bottom for the
> decisions taken on the four items that offered a choice, and for the work that
> went beyond the findings as written.

## Origin

Surfaced 2026-07-25 while investigating the whole repo to rewrite
[docs/ARCHITECTURE.md](../ARCHITECTURE.md) (the old 526-line version was deleted in
`2f5be3c0` and rewritten from a fresh full-repo read). Seven parallel investigation passes
each independently reported docs that contradict the code. None of it was in scope for the
rewrite, so it is recorded here.

Two items were fixed in the rewrite commit itself and are **not** part of this todo:

- `CLAUDE.md`'s dangling deep link `docs/ARCHITECTURE.md#the-lint-surface--one-pass-oxlintESLint-transport`
  (the old heading no longer exists) now points at `#ts-runtypes-devtools`.
- The new ARCHITECTURE.md uses the correct scoped platform-package name.

Related and already **shipped**: `reconcile-publish-docs-to-token-model.md` landed on `main`
in `a1ac6db8` and moved to `docs/done/`. That commit corrected the OIDC-vs-token wording in
`SETUP.md`, `scripts/release/manual-publish.mjs`, and `scripts/env/check.mjs`, so those are
**not** open items here. Only the `.env.sample` header it did not touch survives, in item 5.

## README policy (set by the owner 2026-07-25)

A README is an **information placeholder for a published package, and a leaf in the doc
graph**. Links flow *out* of a README to the real docs, never back into it. No doc, and no
agent instruction file, should send a reader to a README to learn something.

Applied in the ARCHITECTURE.md rewrite commit: `README.md` link targets were removed from
`CLAUDE.md` (three places), `docs/ARCHITECTURE.md`, and
`.claude/skills/implement-todo/SKILL.md`, and the root `README.md` gained outbound links to
`SETUP.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`. The items below are what remains.

## Finding 0 (highest impact): `@ts-runtypes/core` publishes with no README

`packages/ts-runtypes/package.json` lists `"README.md"` in its `files` array, but **no
`README.md` exists in that directory**. The other two published packages
(`@ts-runtypes/devtools`, `@ts-runtypes/bin`) both have one.

`files` entries that match nothing are silently ignored, so this does not fail the build or
the publish. The consequence is that **the flagship package's npm page is blank** while the
two supporting packages render properly. Given the policy above (a README exists precisely to
be the published package's information placeholder), this is the one place where the model is
not just documented wrong but entirely absent.

**Fix:** add `packages/ts-runtypes/README.md`. It should be the package-level pitch, a minimal
install and usage snippet, and outbound links to the website plus the repo docs. The root
`README.md` is a good source for the copy, but note it is a *different* artifact: the root one
is `private: true` and serves the GitHub repo landing page, so its relative links to `docs/`
resolve on GitHub. A published package README cannot use repo-relative links, so every link in
the new file must be an absolute URL to the website or the repository.

Worth confirming while fixing: whether the release e2e should assert that every published
package tarball actually contains a README, so this class of defect fails the gate instead of
surfacing on npm.

## Findings

Ordered most to least misleading.

### 1. `container/website/CLAUDE.md` describes the wrong project

The file gives agent instructions for **mion**, not ts-runtypes: it references
`@mionjs/examples`, router/client docs, and a `content/1.getting-started` directory that does
not exist here (the real tree is `content/1.introduction/`, `2.guide/`, `3.ai-integration/`,
`6.suites/`, `7.benchmarks/`). Any agent that loads it while working on the website is being
actively misdirected.

**Fix:** rewrite for this project, or delete it and let the root `CLAUDE.md`'s
"Website Documentation" section govern (that section is current and correct).

### 2. `container/website/README.md` is unmodified Docus starter boilerplate

Never adapted after scaffolding. The real documentation is `container/website/CONTAINER.md`.

**Fix:** replace with a short pointer to `CONTAINER.md` and the `pnpm rtx website ...`
commands, or delete it.

### 3. `packages/ts-runtypes-devtools/README.md` understates the shipped surface

Three concrete errors:

- It says the `./eslint` subpath is "reserved for the future lint integration (placeholder, no
  rules yet)". The lint plugin is fully shipped (dual OXlint + ESLint v9, two rule families,
  worker-backed sync bridge) and `./oxlint` exists too.
- The entry-point table omits `/rolldown`.
- The options table is missing roughly ten real `PluginOptions` keys: `genDir`,
  `transformMode`, `sourcesContent`, `failOnError`, `size`, `validate`,
  `allowUncheckedPatterns`, `pureFnReport` / `onPureFnReport`, `singleThreaded`, `hashLength`.

Note the website docs for the same surface
(`container/website/content/1.introduction/4.configuration.md` and
`content/2.guide/9.linting.md`) are current, so this is README-only drift.

### 4. Root `CLAUDE.md` uses the pre-scope platform-package name

The "JS monorepo" section writes `ts-runtypes-binary-<os>-<arch>`. The published npm name is
**`@ts-runtypes/binary-<os>-<arch>`** (`scripts/release/build-binaries.mjs`,
`platformPackageName()`). The unscoped spelling survives only as the packed `.tgz` filename in
`tarballs/`, so the sentence as written names a package that does not exist on the registry.

**Fix:** use the scoped name, and if the tarball-filename distinction is worth keeping, say so
explicitly in one clause.

### 5. `scripts/README.md` claims an enforcement that does not exist

`scripts/README.md:81` says `pnpm run check:env` "will enforce the mirror to `.env.sample`".
`scripts/env/check.mjs` only reads `REGISTRY` and prints a status table. There is no machine
check that a new `dev` / `secret` row was also added to `.env.sample`, and no CI job doing it.

**Fix (pick one, do not leave it ambiguous):** either soften the README to describe what the
command actually does, or implement the check so the sentence becomes true. Implementing it is
cheap (diff the `secret` + `dev` names in `REGISTRY` against the keys present in `.env.sample`)
and turns a documented contract into a real gate, so prefer that.

Two smaller defects in the same area:

- `.env.sample`'s header still points at shell-era paths (`build.sh`,
  `scripts/website/site.sh`) that no longer exist.

### 6. `docs/WEBSITE-DOCGEN.md` points at a renamed directory — RESOLVED

It referenced `content/6.test-suites/`. Moot as of the suites-section removal: that whole
content section is gone and `docs/WEBSITE-DOCGEN.md` was rewritten as a benchmarks-only doc.
Nothing left to do here.

### 7. `container/website/CONTAINER.md` lists one command twice

`pnpm rtx website build` appears twice in a list where the second occurrence clearly means
`generate`.

### 8. Go package doc comments open with stale package names

`go doc` convention is that a package comment starts with "Package <real name>". Three do not,
left over from renames:

- `internal/compiler/sourcerewrite/transform.go` says "Package transform"
- `internal/compiler/entrymodules/entrymodules.go` says "Package entrymod"
- `internal/compiler/batchcompile/compile.go` says "Package compile"

### 9. `internal/compiler/resolver/resolver.go` package doc is out of date

It names only three cache generators and lists the package as `dispatch.go`, `scan.go`,
`scope.go`, `render.go`. The package has since grown `overrides.go`, `generate.go`,
`enrichcheck.go`, `missingtypeargs.go`, `relimports.go`, `scan_parallel.go`, and several
lint/guard files, none of which the doc mentions.

### 10. The `docs/done/` purge leaves `docs/partially/` declared but absent

**Context, because this one is a consequence of a deliberate decision, not accidental drift.**
The branch that filed this todo intentionally retires the `docs/done/` archive: `2f5be3c0`
deleted 135 specs there, and the owner confirmed (2026-07-25) that the purge should stand even
though `main` had meanwhile added to the directory. So `docs/done/` shrinking is *intended*.

What is left inconsistent is the surrounding instructions, which still describe a two-lane
archive:

- `CLAUDE.md:109` links both `docs/done/` and `docs/partially/` as PR-readiness `git mv`
  targets.
- `.claude/skills/implement-todo/SKILL.md` and `.claude/skills/create-todo/SKILL.md` both
  describe them as real directories to move specs into and to search for duplicates.
- `docs/partially/` has never existed in the current history, locally or in git, so that link
  is dead regardless of the purge.
- After the purge `docs/done/` retains exactly one file,
  `reconcile-publish-docs-to-token-model.md`, which postdates `2f5be3c0` and so was never in
  its delete list. It was deliberately left rather than deleted, since extending the purge to
  a record `main` had just completed was outside what was agreed.

**Fix:** decide what the archive lane is now and make all three files agree. If specs still get
archived, keep `docs/done/` and add `docs/partially/` (with a `.gitkeep`) so both links
resolve in a fresh clone. If the archive is retired, say so in `CLAUDE.md`, strip the
`git mv`-to-`done` step from both skills, and settle the one remaining occupant. Either way the
current state contradicts itself.

## Plan

Doc-only, no behaviour change, so it can land as one PR. Suggested order (each is
independent, so they can also be split):

1. Items 1 and 2 (`container/website/CLAUDE.md`, `README.md`) are the highest value because
   they actively mislead agents. Decide delete-vs-rewrite per file.
2. Item 3 (devtools README) by porting the current option list from the website config page,
   which is already correct.
3. Item 4 (root `CLAUDE.md` package name), item 6, item 7: one-line each.
4. Item 5: implement the `.env.sample` mirror check, then the README sentence is true as
   written. Fix the two OIDC strings and the `.env.sample` header in the same pass, or defer
   them to the token-model todo.
5. Item 10 (`docs/done/` + `docs/partially/`) needs a decision first, then it is a `.gitkeep`
   or a docs edit. Worth doing early since the implement-todo workflow depends on it.
6. Items 8 and 9 (Go doc comments). Touching Go source means
   `go -C ts-go-runtypes test ./internal/...` and `pnpm run format` (`gofmt` is in scope for
   `ts-go-runtypes/cmd` + `internal`).

## Verification

- Nothing here is covered by a test today, which is why it drifted. After the edits, grep the
  fixed strings to confirm no other file repeats them, in particular
  `ts-runtypes-binary-` (unscoped) and `6.test-suites`.
- If item 5 is implemented as a check, add it to the `js-lint` CI job next to
  `pnpm rtx core codegen all --check` so the registry-to-sample contract is enforced the same
  way the Go-to-TS mirror contract is.
- `pnpm run check-format` for the Go comment edits. Note the markdown files touched here are
  outside `pnpm run format`'s scope on purpose, so do not run Prettier over them.

## What actually shipped

Landed 2026-07-26 as one doc-focused PR plus two small code additions (the env
mirror check and the README tarball gate). Every finding is closed. Where the todo
left a choice, the decision taken:

| Item | Decision |
| --- | --- |
| 0 — missing core README | Added `packages/ts-runtypes/README.md`, absolute URLs only, **plus** a gate (below) so the class of defect cannot recur. |
| 1 — `container/website/CLAUDE.md` | **Rewritten**, not deleted: much of it (code-import, twoslash, component list) was real website knowledge worth keeping, just written against mion. |
| 2 — `container/website/README.md` | **Replaced with a pointer** to `CONTAINER.md` + `CLAUDE.md` and the `pnpm rtx website …` commands, rather than deleted. |
| 5 — `check:env` enforcement | **Implemented the check**, as the todo preferred, so the `scripts/README.md` sentence is now true. |
| 10 — archive lane | **Kept both lanes**: added `docs/partially/.gitkeep` so both links resolve in a fresh clone. No instruction file needed changing, and the lane is in active use (`docs/done/` had grown to three specs by the time this landed, not the one the finding recorded). |

Beyond the findings as written:

- **`container/website/AGENTS.md` was also mion boilerplate** — same defect as
  finding 1, in the sibling file the finding did not name. Replaced with a pointer
  to `CLAUDE.md` and the root `CLAUDE.md`'s Website Documentation section.
- **Item 3 was wider than recorded.** Both existing package READMEs used
  **pre-scope package names throughout** (`ts-runtypes-devtools`, `ts-runtypes-bin`,
  `ts-runtypes-binary-*`), and `packages/ts-runtypes-bin/README.md` pointed at a
  repository URL that does not exist (`github.com/mionkit/ts-runtypes`). Both are
  now correct. The devtools options table was missing **twelve** keys, not ten
  (`enrich` and `hashLength` were the two the finding did not list), and the entry
  point table gained `/oxlint` as well as `/rolldown`. The `../../README.md` link
  was replaced with absolute URLs, per the README-leaf policy.
- **Item 4's unscoped name appeared in six more places** than the root `CLAUDE.md`
  sentence: `SETUP.md` (twice), `packages/ts-runtypes-bin/README.md`,
  `packages/ts-runtypes-bin/package.json`'s `comment:optionalDependencies`,
  `packages/examples/src/introduction/manual-install-vite-config.ts`,
  `packages/ts-runtypes-devtools/src/unplugin.ts`, and
  `scripts/release/bump-version.mjs`. All fixed. The two genuine tarball-filename
  uses (`scripts/release/publish-tarballs.mjs`'s `rank()`, and the new clause in
  `CLAUDE.md`) deliberately keep the unscoped spelling.
- **Item 7's file had more drift than the duplicate line.** `CONTAINER.md` also
  described the repo context as defaulting to a sibling `../mion` checkout, which
  `defaultRepoContext()` in `scripts/website/site.mjs` has not done since
  `packages/examples/` moved in-repo. The whole command block was resynced with
  `rtx`'s own help text (it was missing `preview`, `dev --agent`, and
  `check --static`).
- **Item 8's `sourcerewrite` doc cited two paths that no longer exist**
  (`docs/COMPILER-DRIVEN-TRANSFORM.md`, `packages/ts-runtypes-devtools/src/rewrite.ts`)
  on top of the stale package name. Rewritten against the real JS twin
  (`apply-edits.ts` + `edit-buffer.ts`) and the two-wire-mode invariant.
- **`.env.sample`'s section headers** pointed at three shell-era scripts, not the
  one the finding named: `build.sh`, `scripts/website/site.sh`,
  `scripts/website/bench-data/bench.sh`, plus a `pnpm run fuzz:*` script family
  that no longer exists. All now name the real `pnpm rtx …` commands.

### New enforcement (so these two cannot silently rot again)

- **Env registry mirror.** `scripts/env/check.mjs` gained `sampleKeys()` +
  `sampleMirrorDrift()` and now exits 1 on three kinds of drift: a `secret`/`dev`
  row missing from `.env.sample`, an `internal` var listed there (setting one
  breaks the run), or a key there that no `REGISTRY` row declares. Wired into
  `ci.yml`'s `js-lint` job next to the codegen drift gate, as the todo's
  verification section asked.
- **Published READMEs.** `scripts/release/pack.mjs` now asserts that every packed
  tarball whose `files` array lists `README.md` actually contains
  `package/README.md`, so a `files` entry matching nothing fails the release
  instead of publishing a blank npm page. The per-platform binary packages are
  exempt by design (they ship `lib/` + `LICENSE`).
- **Tests:** `packages/ts-runtypes-devtools/test/repo-contracts.test.ts` (11 tests)
  pins both contracts — each published package has a README, listed in `files`,
  with no repo-relative links; and the mirror check detects each drift kind.

### Found but deliberately not fixed here

`container/website/typescript-lsp-docs.md` is a 269-line mion-era scratch doc
(`@mionjs/client`, `@mionjs/router`, `@mionjs/server`, and an example path that
does not exist here), unreferenced by anything. Same class as findings 1 and 2 but
outside this todo's scope, so it was filed as
[website-typescript-lsp-docs-is-mion-era.md](website-typescript-lsp-docs-is-mion-era.md)
rather than fixed inline.
