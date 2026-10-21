# Website prose rules

Language rules for pages under `container/website/content/<NN>.<subsite>/`. Read before writing or editing a page.
Page structure, section template, titles, tables, tips:
[container/website/AGENTS.md → Writing guidelines](../../container/website/AGENTS.md#writing-guidelines).
Real before / after titles and sentences: [simplify-docs](../skills/simplify-docs/SKILL.md). Read before writing a page.

## Plain, short language

Rules, not taste:

- Everyday words: turn off, hide, show, fail, stop, check, add a comment.
- NEVER: stand down, surface, land, settle, pin, carry, ride, reach for, lane, honest, deliberate,
  finding (say error or warning), annotate.
- One idea per sentence, under about twenty words. Second person ("your type").
- A paragraph = one or two sentences, three at most.
- No metaphors, no personification: not "cannot outlive the problem", "keeps the file honest", "help nobody".
- No trailing justification clause ("..., which is what you want when ...", "..., so it cannot ...")
  unless the reason IS the point.
- Start with the thing or the action. Never a setup sentence ("Sometimes a whole file raises the same error.").
- Cut what a developer already knows: how to separate list items, that a file is edited by hand, what a comment is.
  Say only what this feature does differently.
- Shorter always wins. An edit making a sentence longer needs a reason the reader would accept.
- Say what a feature does for the reader, not how it is built. No internals (hashing, byte offsets, "side-channel",
  cache mechanics), no history, no comparison with another tool unless the reader needs it to use the feature.
- Consumer-facing means CONSUMER-facing: a knob only a RunTypes contributor would set does not belong here at all,
  however well written.

## Punctuation and code

- No dashes chaining clauses or sentences: no em-dash, en-dash, `--`, or a spaced single `-` as punctuation.
  Use a comma, a period, or parentheses.
  Hyphenated words (`build-time`) and dashes inside code / flags / URLs are fine.
- Prefer fenced code blocks over heavy inline `code`. Keep essential public API / type names,
  but do not clutter prose with backticks.
- TypeScript examples: prefer `<code-import>` of real files from
  [packages/private-examples/src/](../../packages/private-examples/src/). Root `typecheck` compiles them → drift fails.
- Hand-written fences only for bash/CLI, JSON config, output/tree listings, deliberately partial or invalid fragments.
- Updating examples when the API changes is REQUIRED, `index.md`'s included. Keep the edit scoped to the example.
- Short frontmatter `description`: one simple sentence, aim under ~100 chars. Leave already-short ones alone.

## Never format this tree

- Never let a formatter or linter touch it: Prettier reflows `::` / `:::` MDC components into something
  Docus cannot parse (why `pnpm run format` excludes it).
- Never hand-format it either. Writing and editing the components by hand is normal work.

## Home page

- `index.md` gets the SIMPLEST wording on the site, and is exempt from nothing above.
- Short sentences, second person ("your types"), the concrete benefit first.

## Broad style pass

- Fan out one agent per `N.section/` dir.
- Then verify em/en dashes are gone and the counts still match.
