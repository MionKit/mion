# The five review passes

One brief per pass. Paste the brief verbatim into the agent prompt and fill the
placeholders. Spawn all five in one message so they run at once.

## Shared header (prepend to every brief)

```
You are reviewing a change in the mion monorepo. Read only: do not edit, write,
format, commit or run tests. Your output is a findings list.

Diff range (use exactly this, nothing else):  git diff <MERGE_BASE>..HEAD
Intent of the change: <INTENT from step 2>
Changed files: <PATHS relevant to this pass>

Report every finding in this shape, most important first:

- claim:    one line, what is wrong
  where:    path/to/file.ts:LINE
  evidence: the exact line(s) from the diff
  reason:   the quoted rule it breaks, or why it costs the reader
  fix:      the concrete smaller change, with the replacement text where short
  severity: blocking | worth-fixing | nit
  confidence: high | medium | low

Rules: cite only lines that exist in this diff. Quote a rule only if you read it
in a real file, with the file name. If you find nothing, say "no findings" and
stop. A short list of real findings beats a long list of maybes.
```

## Pass 1: guidelines

```
Check every changed file against the CLAUDE.md files that govern it.

Governing files, most specific wins on conflict:
<LIST from scope.sh, e.g. CLAUDE.md, packages/router/CLAUDE.md>

Method:
1. Read each governing CLAUDE.md in full. They are short.
2. Write down the rules that could touch these changed files. Ignore the rest.
3. Check each rule against the diff, one by one. Quote the rule line you checked.

Rules broken most often here, worth checking explicitly:
- Dependencies: exact pinned versions, cross-package deps use workspace:*,
  devDependencies live at the repo root, not per package.
- Environment variables: every new var must be added to the REGISTRY in
  scripts/lib/env.mjs, be prefixed MION_, and appear in .env.sample only when it
  is user-settable (secret or dev scope, never internal).
- Tests: a fix or a feature without a test is blocking. Anything touching the
  marker API needs BOTH getRunTypeId call shapes as paired tests
  (see ts-go-runtypes/CLAUDE.md).
- Code style: no I prefix on interfaces, no T prefix on type parameters, prefer
  type casting over assertions, no @param or @returns in JSDoc, meaningful names
  rather than one-letter ones (loop indices and err are fine).
- Spec docs: no file outside docs/ may name a docs/todos/ or docs/done/ document.
- Git shape: commits are a single Conventional Commits subject line, history is
  linear, no merge commits from main.
- Build discipline: an edit under packages/devtools/src needs its dist rebuilt,
  since consumers and the linter read the built dist.

Report a finding only where the diff actually breaks a rule you can quote. If a
rule is ambiguous about this case, say so and mark confidence medium.
```

## Pass 2: docs

```
Review the changed documentation for plain language and this repo's voice. This
is the pass that finds the most, because docs land wordy and full of internals.

Read first, in full:
- container/website/CLAUDE.md, the Writing guidelines section
- container/website/content/01.rpc/02.server/01.routes.md, the model page
Then read the root CLAUDE.md section on website documentation.

Changed pages: <PATHS>

Check each changed page and each changed paragraph:
1. Plain, user-focused. Says what the feature does for the reader and why it
   helps. No internals (hashing, byte offsets, side-channel, fixpoint, cache
   mechanics). A knob only a contributor would set does not belong on the site
   at all, however well written.
2. No dashes chaining clauses: no em dash, en dash, --, or a spaced - as
   punctuation. Hyphenated words and dashes in code, flags and URLs are fine.
   Grep the changed pages for them and list every hit with its line.
3. One section, one job: how, what, or why. Two jobs means two sections.
4. Titles: plain Title Case, name the job, stand alone without the page title,
   no code names, no questions, no slogans.
5. One table per topic. Several small sections in a row with the same columns
   are one table that got split.
6. Frontmatter description: one simple sentence, aim under 100 characters.
7. TypeScript examples use <code-import> from packages/examples/src, not a
   hand-written fence. Fences are for bash, JSON, output and deliberately
   partial fragments.
8. index.md gets the simplest wording on the site.
9. A renamed heading changes its URL anchor: check the content tree for links
   to the old slug.

For every wordy sentence you flag, write the shorter replacement in the fix
field. A rewrite is the finding; "this is too complex" is not.

Also check the other direction: does the diff change user-visible behaviour that
the docs do not mention yet? Missing docs for a shipped feature is blocking.
```

## Pass 3: reuse

```
Find new types and new functionality that could come from something that already
exists. Every redundant declaration is committed lines someone must maintain.

Changed files: <PATHS>

Method:
1. List every type, interface, enum and exported function ADDED by the diff.
2. For each one, search for a near-match before judging it: grep the same
   package, then its siblings, then packages/run-types and packages/core for the
   same field set, the same shape, or the same job under another name.
3. Ask, in this order:
   - Does this type already exist? Then import it.
   - Can it be derived? Pick, Omit, Partial, Extract, ReturnType, a generic
     parameter on the existing type, or extending it. Prefer deriving, because a
     derived type follows its source when the source changes.
   - Is it a near-copy of a neighbour that differs by one field? Then the two
     should share a base.
   - Same questions for functions: is there a helper doing this already, and
     does this one just wrap it with a different name?
4. Flag the reverse too: a type widened or duplicated so two callers could share
   it, where a small generic would have kept both honest.

For each finding name the existing type or function by file and line, and show
the derived form you propose. A reuse claim without the existing declaration to
point at is not a finding.

Ignore: intentional duplication across package boundaries where importing would
create a dependency the repo does not allow. Check that before you flag it.
```

## Pass 4: architecture

```
Judge the shape of the change. The goal is the simplest obvious version, and
fewer committed lines.

Diff stat: <STAT>
New files: <ADDED FILES with line counts>

Method:
1. Restate the intent in one sentence, then ask what the smallest change that
   achieves it looks like. Compare that to the diff.
2. Every new file: does it earn its existence? What would it cost to put this in
   the file that already owns this job? Name that file. A new file is right when
   it holds a genuinely separate concern or the host file is already large.
3. Look for structure added ahead of need: an abstraction with one caller, an
   options object with one option, an interface implemented once, a registry
   with two entries, an indirection layer that only forwards.
4. Look for the missed extension point: did the author add a parallel path where
   the codebase already had a hook, a strategy table, or an existing branch to
   extend?
5. Look for copy-paste between the new files, and between a new file and the one
   it was modelled on.
6. Is anything placed wrongly? Package boundaries here are strict: recorders do
   not import drizzle, platform adapters wrap the router, devtools presets map
   through shared options so they cannot drift. Check the package's own
   CLAUDE.md for its boundary before flagging placement.

Every architecture finding must carry a line count: roughly how many committed
lines the simpler shape removes, and confirmation that behaviour is unchanged.
If the simpler shape is only different, not smaller and not clearer, drop it.

Do not propose refactoring code the diff does not touch.
```

## Pass 5: comments

```
Review only the comments added or changed by the diff, in code files.

Changed files: <PATHS>

The bar this repo sets: one-liners, and a comment stays only if it says
something that cannot be read from the code.

Delete or rewrite:
- Restates the line below it ("// increment the counter").
- Names the function again in prose above it.
- JSDoc with @param or @returns tags: the repo bans both, the types already say it.
- A multi-line block that says one thing: collapse it to one line.
- Commented-out code, a TODO with no owner and no plan, a leftover debugging note.
- Stale: describes behaviour the diff just changed. Quote both and mark it
  blocking, because a wrong comment is worse than none.

Keep:
- Why, not what: the reason a surprising choice was made, the constraint that
  forced it, the bug it avoids.
- A load-bearing invariant, an ordering requirement, a link to the spec of a
  format.
- A warning that the obvious simplification here is wrong.

For each finding give the replacement one-liner, or say "delete" outright. Be
strict but do not strip a comment carrying real reasoning just because it is two
lines. If you cannot tell whether it is load-bearing, mark confidence low and say
what would settle it.
```
