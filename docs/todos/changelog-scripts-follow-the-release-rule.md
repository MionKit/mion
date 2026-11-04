---
type: chore
spec: guidelines
status: ready
created: 2026-11-04
---

# Changelog scripts follow the release rule

## Intent

The root `changelog` script runs `git-cliff -o CHANGELOG.md`, which regenerates the whole file from history.
The release skill (`.agents/skills/release-to-prod/bump.md`, "Never regenerate the whole file") forbids exactly
that: past release intros are hand-written and a full regeneration erases them. `SETUP.md` (Commits section)
still advertises the script. A maintainer or agent following `SETUP.md` would wipe the curated changelog.

## Direction

The implementer plans the details. Pointers:

- Root `package.json` scripts `changelog` (full rewrite) and `changelog:unreleased`
  (`git-cliff --unreleased --prepend CHANGELOG.md`).
- The release skill's own flow generates one section with an explicit range and `--tag`, curates it by hand,
  then inserts it under the header. Decide whether `changelog:unreleased` still matches that flow or also goes.
- `git-cliff` is not a devDependency (installed with `brew`); say so wherever a remaining script needs it.
- Per root `AGENTS.md`, a removed script leaves no trace: drop it from `SETUP.md` too.

## Docs

`SETUP.md` Commits section: the script list matches what stays. No website page.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- No script or doc line offers a whole-file `CHANGELOG.md` regeneration; any kept script matches the release skill.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
