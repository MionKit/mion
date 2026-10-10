---
type: docs
spec: full-plan
status: done
created: 2026-10-10
---

# RunTypes Homepage: Ready for Compiled TypeScript

## Problem

TypeScript compiled ahead of time (to a native binary or to optimized code before it runs) is getting a lot of
attention. Projects promise speed close to Go, some even zero-copy data handling. In that world, code built from
strings while the app runs (`eval`, `new Function`) has no place: an ahead-of-time compiler cannot compile code
that does not exist yet.

JIT validators like Zod 4 get their speed that way: they read a schema object at runtime,
build a JavaScript string, and turn it into a function with `new Function`. Without that step they drop to a
slow path or stop working.

RunTypes reads everything it needs from your TypeScript types at build time. The shape of your data is known
before the app runs, so the generated functions are plain code a compiler can see.

The RunTypes homepage still pitches "the evolution of validation libraries" and never says any of this.
Goal: reposition the page for people who use a simple validation library today.

## Plan

Edits in TWO files:

- `container/website/content/02.runtypes/01.introduction/01.about-mion-runtypes.md` (RunTypes home: hero + card).
- `container/website/content/index.md` (main site home: its RunTypes block only).

### 1. Hero wording (RunTypes home)

- Frontmatter `seo.title` (line 6): new title around compiled TypeScript, e.g.
  `'RunTypes: Ready for compiled TypeScript'`. Update `seo.description` (line 7) and `description` (line 3)
  to match, one sentence each, under about 100 characters.
- `slided-title` `leading` (line 23): replace "The evolution of validation libraries" with
  "Ready for compiled TypeScript". Keep the rotating `titles` list as is. A longer line ("Compiled TypeScript is
  coming. RunTypes is ready.") wrapped to three lines of hero text, so the short one shipped.
- `#description` (lines 32-33): replace "Why stop at validation?" + paragraph with a short pitch, e.g.

  > **Compiled TypeScript is becoming a reality.**
  > <br/>RunTypes generates validation, JSON round trip, mocking and reflection from your types at build
  > time. No schemas to write.

  Wording is a starting point. Final copy follows the prose rules below.

### 2. RunTypes block on the main site home

- `content/index.md` lines 66-70, the `data-site="runtypes"` block: heading `## RunTypes<br>One type, many functions`
  + one pitch paragraph. Rewrite both to the same message as the RunTypes hero, e.g.

  > ## RunTypes<br>Ready for compiled TypeScript
  >
  > TypeScript is starting to compile ahead of time. RunTypes gets everything from your types at build time:
  > validation, JSON round trip, mock data and reflection. No schemas to write.

- Text only: keep the button, the `twoslash-code` example and the layout. No card here.
- `index.md` gets the simplest wording on the site (`.agents/docs/website-writing.md`, Home page). Same claim
  rules as below.
- Leave the "Tested to the highest standard" RunTypes block and the benchmarks block as they are.

### 3. New card on the RunTypes home: "Built for Compiled TypeScript"

- Place it as the FIRST `::u-page-section` after the hero (before "One type, many functions.", line 88),
  so it is the first thing a reader sees after scrolling.
- Layout: reuse the existing split card, no new CSS:
  `:::card{class="rt-standard-card"}` > `::::div{class="rt-standard-split"}` >
  prose column `:::::div{class="rt-feature-card rt-standard-prose"}` + code column
  (same shape as the "The whole toolbelt, in one box" card, lines 106-117; styles in
  `container/website/app/assets/css/mion.css` around lines 413 and 540).
- Prose column, three short points, one or two sentences each:
  1. Compiled TypeScript cannot compile code built from strings while the app runs.
  2. JIT validators like Zod 4 only learn your schema when the app runs, so their speed
     depends on building code from strings. In compiled TypeScript they drop to a slow path or stop working.
  3. RunTypes gets the full shape from your types and compiles its functions at compile time, before your app
     ever starts. Your types are the schema, no runtime schema object at all.
- Code column: two hand-written fences (deliberately partial fragments, allowed by the prose rules), stacked in a
  plain `:::::div` so both show at once and fill the card height (code-group tabs left half the card empty):
  - `[JIT validator]`: a Zod-style schema plus a short comment that it becomes a string and `new Function(...)`
    at runtime.
  - `[RunTypes]`: a plain type plus `createValidateFn<User>()` and a comment that it is compiled at build time.
    Same `User` type as the "Compile time code generation" section so the page stays consistent.
  Comments kept short so they do not wrap on a phone.
- Footer link: `[Build-time, not run-time →](/runtypes/introduction/built-on-typescript-go)`.

### Claim rules (required, user decision)

- Marketing copy: keep it short and direct. The one claim that matters: RunTypes compiles its functions at
  compile time, from your types. True in every config, so say it plainly.
- Never mention emit modes or other config options on either home page. Shipping a function as a string is only a
  way to send less code (and to send functions to clients); it changes nothing about when they are compiled.
- Competitor lines stay accurate: Zod 4 has a slower mode without `new Function` (`jitless`), so say JIT
  validators "drop to a slow path or stop working", not "won't run". Check a library's current docs before
  naming it.
- Say "generated at build time" for the whole toolbelt: mocking walks the type data at runtime, so only
  validation and the JSON round trip are "compiled". No "no schema at runtime" line for the same reason.
- Name only Zod 4 as a JIT validator: AJV can also generate standalone code ahead of time.
- "JIT validators won't be enough" lives only in the animated card's title (user's ask); the text box under it is
  "Compiled TypeScript is on its way". Never "no code built while your app runs".
- Compiled TypeScript projects are named in one short linked list (user's ask): scriptc (Vercel Labs), Porffor,
  Perry and Bun's experimental ahead-of-time mode (its WebKit pull request says `new Function` code stays
  interpreted). Each verified to exist before linking; no claims beyond what its own pages say.
- No speed numbers for compiled TypeScript (Go / Rust comparisons) on the page: they are not ours to prove.

### Prose rules

Follow `container/website/AGENTS.md` (Writing guidelines) and `.agents/docs/website-writing.md`:
second person, under about twenty words a sentence, no em or en dashes, no metaphors. The page is a hand-tuned
home, so slogan-style section titles that match its neighbours are fine.

### 4. Animated card (user follow-up)

- The section opens with an animated card, `jit-wall`, built with the card skill
  (`tools/code-card/cards/jit-wall.vue`, exported to `container/website/app/data/cards/`). Two lanes run to a wall
  labelled "AOT compiler": the JIT lane bounces off it, the RunTypes lane passes into the binary.
- New card parts `CardLanes` + `CardLane`. `CardWindow` never animates, on every card: the empty frame shows the
  reader a block is there before its content plays. `step="0.8s"` leaves time to read.
- `CodeCard.vue` starts a card only once its top is 35% of the screen above the bottom edge.
- Under the card, the page text stays: "Compiled TypeScript is on its way" with the project tiles (`stat-tiles`), and
  the Zod 4 and RunTypes paragraphs with the link. The side-by-side code fences were dropped: the card shows that.

## Tests

No source code changes, so no unit tests. Checks that cover a content page:

- `pnpm miondevx website check --docs`: page renders, code blocks render.
- `website-links.test.ts` (in `pnpm test` via devtools): the new footer link resolves.
- Browser check with the website-browser skill (`pnpm miondevx website dev --agent`): hero reads well, new card
  sits right after the hero, split stacks on narrow screens (under 760px), light and dark themes.

## Docs

Pages: `/runtypes/introduction/about-mion-runtypes` (existing hero rewritten + one new section after it) and the
main site home `/` (existing RunTypes block, text only).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- Main site home beyond its first RunTypes block (RPC, benchmarks and "Tested" blocks stay as they are).
- Every other RunTypes page, the RPC subsite, the benchmarks subsite.
- Any compiler, runtime or config change.
- New CSS or new Vue components.

## Done when

- Hero leading line, description and SEO text say compiled TypeScript is coming and RunTypes is ready.
- The main site home's RunTypes block says the same, in the simplest wording.
- New card sits right after the hero, explains why runtime-code-building validators fit compiled TypeScript
  badly and why build-time types fit it well, within the claim rules above.
- `website check --docs` and the links test pass; browser check done in both themes and on a narrow screen.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
