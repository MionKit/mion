---
name: simplify-docs
description: Simplify already written website pages and examples to plain short language without changing a fact. Use before a PR on any touched page, or when asked to simplify docs.
---

# simplify-docs

Take pages that are already written and make them as short and plain as they can be while every fact stays true. This is a second pair of eyes, run with none of the implementation context: the session that wrote the page knows too much and writes in the feature's vocabulary. You read the page as its reader will.

The output is: the pages and examples edited in place, plus a report of every change and every sentence you deliberately left alone.

## The arc

1. **Read the rules** before touching anything.
2. **Scope**: which pages and examples, and which sections of them changed.
3. **Page structure**: merge, rewrite, split, move or keep each changed section.
4. **Section by section**: title, shape, paragraph, example, repetition, accuracy.
5. **Verify**: examples compile, links resolve, no dashes.
6. **Report**.

## Step 1 - Read the rules

Read these three, in full, every run. They change, and your pass is only as current as the read behind it:

- The root [CLAUDE.md](../../../CLAUDE.md), section *Website Documentation*: the language rules and the banned words.
- [container/website/CLAUDE.md](../../../container/website/CLAUDE.md), section *Writing guidelines*: the ideal section template, where a change goes, and the merge / rewrite / split / move / keep table.
- [examples.md](examples.md) in this skill: real titles and sentences, wrong and right, from this repo.

Do not paraphrase the rules from memory. Quote the rule in the report when a change rests on it.

## Step 2 - Scope

You are given either a list of paths or "the branch". For the branch:

```bash
MB=$(git merge-base origin/main HEAD)
git diff --name-only $MB..HEAD -- container/website/content packages/examples/src
git diff $MB..HEAD -- <each page>          # which sections were added or changed
```

Pages off limits for prose: `content/index.md` and the three about pages (`01.rpc/01.introduction/01.about-mion-rpc.md`, `02.runtypes/01.introduction/01.about-mion-runtypes.md`, `03.benchmarks/01.introduction/01.mion-benchmarks.md`). Their examples are still yours.

Sections the branch did not touch are not yours either, with one exception: a section next to a changed one that the merge / rewrite table says must merge with it.

## Step 3 - Page structure

Before any wording changes. For every section the branch added or changed, run the *Merge, rewrite, split, move or keep* table from `container/website/CLAUDE.md`, in its order, and act on the first match:

- **Merge** when the existing title is still true for both, or they share an example, table columns or a sentence. One paragraph, one example, one table survive.
- **Rewrite** when content was bolted on ("There is also", "In addition", "Note that", a second paragraph or example, a tip that became a paragraph). Rewrite the whole section from the ideal template, in place, keeping the title if still true.
- **Split** when one section has two examples, two tables, or a title that needs an "and".
- **Move** only when the target page is obvious. Otherwise keep it and flag it in the report.
- **Keep** when none of the above.

Then read the page's table of contents alone: it must read as a list of distinct jobs, no two titles that could be one. Record every merge, rewrite, split and move with the rule that triggered it.

## Step 4 - Section by section

For each section you own, in this order:

1. **Title.** Check it against the title rules (Title Case, names the job, stands alone without the page title, no code names, no backticks, no question, no slogan). Rewrite it if it fails. A renamed heading changes its URL anchor: grep the content tree for the old slug and fix every link.
2. **Shape.** Compare with the ideal section: title, one or two sentences, example, optional table, optional tip, in that order. Move or cut anything out of order. A lead-in sentence goes. A second example or a second table means step 3 missed a split.
3. **Paragraph.** Write the section's main idea in one plain sentence, for yourself. Then rewrite the paragraph around it in everyday words: what it does, when you use it. Two sentences is the target, three the ceiling. Cut every sentence that says what the example, the table or the tip already shows. Apply the banned-word list. No metaphors, no trailing justification clauses, no history, no internals.
4. **Example.** Trim to what the section explains: five to fifteen lines, no setup the reader does not need, no second feature. Comments become one-liners on the line they explain, saying why that line matters. Delete any comment block at the top. Never change an identifier, an import, or an API call: the example must compile and show the same behaviour.
5. **Repetition.** Each fact once across paragraph, example comments, table and tip. When two of them say it, keep it where a reader meets it first (usually the example) and cut the other.
6. **Accuracy.** Never change meaning. A shorter sentence that drops a condition, a code, a default or a limit is wrong, not simpler. When a sentence cannot be made simpler without losing a fact, keep the fact, and list the sentence in the report as left alone.
7. **Shorter, never longer.** Every sentence you touch ends up shorter than it was, and so does every file. A sentence that grows needs a reason a reader would accept, written next to it in the report; "it reads better" is not one. Moving a fact into a sentence is not a licence to keep the old wording too.
8. **Cut what a developer already knows.** How to separate items in a list ("split by spaces or commas"), that a config file is edited by hand, that a command runs in a terminal, what a comment is: gone. Keep only what this feature does differently from what the reader would assume.

The frontmatter `description` counts as a paragraph: one plain sentence, under about 100 characters.

## Step 5 - Verify

```bash
pnpm run typecheck                               # every example still compiles
pnpm exec vitest run website-links               # every link and anchor still resolves
grep -n '—\|–\| -- ' <each page you touched>     # must print nothing
git show <merge-base>:<file> | wc -w; wc -w <file>   # words before and after, per file, for the report
```

A file with more words after than before fails the pass unless every grown sentence carries its reason in the report.

Never run `pnpm run format`, Prettier or any formatter on the content tree: it breaks the `::` components. Edit by hand.

## Step 6 - Report

Short, and complete. Per page:

```markdown
## <page path>   (<N> -> <M> words)

Structure: merged "<B>" into "<A>" (rule: shared example) | rewrote "<A>" (rule: bolted-on second paragraph) | split | moved | kept
Titles: "<old>" -> "<new>" (rule: code name in title)
Paragraphs: "<old sentence>" -> "<new sentence>"     (one line per rewritten sentence)
Grew: "<new sentence>" (<N> -> <M> words, because: <the reason>)
Examples: <file> (<N> -> <M> words): cut top comment block, cut lines N-M (setup), N comments made one-liners
Left alone: "<sentence>" (would lose: <the fact>)
Flagged: "<section>" looks like it belongs on <page> (not moved)
```

Every "left alone", "grew" and "flagged" line is for the caller to decide. Every rewrite is yours.

## What NOT to do

- **Do not add content.** No new sentence that states something the page did not, no new section, no new tip. If a fact is missing, say so under Flagged.
- **Do not make anything longer without saying why.** A sentence or a file with more words after the pass than before is a failed pass unless its reason is in the report.
- **Do not change meaning.** Dropping a condition, a code, a default or a limit is an error, not a simplification.
- **Do not edit code.** Identifiers, imports, API calls and the behaviour an example shows stay as they are. Only comments and unneeded lines go.
- **Do not touch `index.md` or the about pages' prose.**
- **Do not turn a tip into a paragraph, or a table back into prose.**
- **Do not run a formatter on the content tree, and do not write a dash as punctuation.**
- **Do not rewrite from memory of the rules.** Read the three sources in step 1 each run and quote them.
- **Do not commit.** The caller reviews the report against the code and commits.

## Gotchas

- **Run in a fresh context.** The reason this is a subagent pass is that the writing session knows why every sentence exists and will defend it. If you are in the session that wrote the page, hand the pass to the `docs-simplifier` agent instead of doing it yourself.
- **The example is usually the best place for a fact.** A one-line comment on the line that does the thing beats a sentence above the example describing it.
- **Renaming a title is cheap, breaking an anchor is not.** Always grep for the old slug (`lowercase-with-hyphens`) across `container/website/content/` after a rename.
- **"Simpler" is measured by the reader, not by word count.** Twelve plain words beat eight clever ones.
