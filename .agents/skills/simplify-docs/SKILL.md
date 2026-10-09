---
name: simplify-docs
description: Simplify site pages and examples, no fact lost. Use before a PR on a touched page or to simplify docs.
---

# simplify-docs

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

Make written pages as short and plain as possible. Every fact stays true.
Second pair of eyes, no implementation context: the writer knows too much and uses the feature's vocabulary.
Read the page as its reader will.

Output: pages + examples edited in place, plus a report of every change and every sentence left alone on purpose.

## The arc

1. **Read the rules** before touching anything.
2. **Scope**: which pages + examples, which sections changed.
3. **Page structure**: merge, rewrite, split, move or keep each changed section.
4. **Section by section**: title, shape, paragraph, example, repetition, accuracy.
5. **Verify**: examples compile, links resolve, no dashes.
6. **Report**.

## Step 1 - Read the rules

Read these three in full, every run (they change):

- [website-writing.md](../../docs/website-writing.md): language rules + banned words.
- [container/website/AGENTS.md](../../../container/website/AGENTS.md), section *Writing guidelines*:
  ideal section template, where a change goes, the merge / rewrite / split / move / keep table.
- [examples.md](examples.md) + its linked pages: real wrong / right titles, sentences and example code.

Never paraphrase the rules from memory. Quote the rule in the report when a change rests on it.

## Step 2 - Scope

Given a list of paths, or "the branch". For the branch:

```bash
MB=$(git merge-base origin/main HEAD)
git diff --name-only $MB..HEAD -- container/website/content packages/private-examples/src
git diff $MB..HEAD -- <each page>          # which sections were added or changed
```

- Prose off limits: `content/index.md` + the three about pages (`01.rpc/01.introduction/01.about-mion-rpc.md`,
  `02.runtypes/01.introduction/01.about-mion-runtypes.md`, `03.benchmarks/01.introduction/01.mion-benchmarks.md`).
  Their examples are still yours.
- Sections the branch did not touch: not yours. Exception: a neighbour the merge / rewrite table says must merge in.

## Steps 3 and 4 - Structure, then sections

Detail → [editing.md](editing.md). Read before step 3.

- Step 3: merge / rewrite / split / move / keep each changed section, before any wording change.
- Step 4: per section, in order: title, shape, paragraph, example, repetition, accuracy, shorter, known facts.

## Step 5 - Verify

```bash
pnpm run typecheck                               # every example still compiles
pnpm exec vitest run website-links               # every link and anchor still resolves
grep -n '—\|–\| -- ' <each page you touched>     # must print nothing
git show <merge-base>:<file> | wc -w; wc -w <file>   # words before and after, per file, for the report
```

- More words after than before = failed pass, unless every grown sentence has its reason in the report.
- Never run `pnpm run format`, Prettier or any formatter on the content tree (breaks `::` components). Edit by hand.

## Step 6 - Report

Template + who decides what → [report.md](report.md). Read before step 3: it lists what to record.

## Hard rules

- Run in a fresh context. Wrote the page? Hand the pass to the `docs-simplifier` agent (writer defends every sentence).
- Add no content: no new fact, section or tip. Missing fact → Flagged in report.
- Never turn a tip into a paragraph, or a table back into prose.
- "Simpler" is measured by the reader, not word count. Twelve plain words beat eight clever ones.
- Never commit. Caller reviews the report against the code and commits.
