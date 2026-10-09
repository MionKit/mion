# Documentation Website (one site, three subsites)

Nuxt 4 + Docus v5 docs site: Tailwind CSS 4 + Nuxt UI v4, Nuxt Content v3 (MDC), Shiki + Twoslash.
Deps live ONLY in the podman image, never in the monorepo lockfile.

- ONE Nuxt install builds ONE static site, mion.pages.dev. Subsite `<id>`: tree `content/NN.<id>/`, theme
  `sites/<id>/theme.css`, `/<id>` redirects to its home:
  - `rpc` (framework): `/rpc/introduction/about-mion-rpc`. `runtypes`: `/runtypes/introduction/about-mion-runtypes`.
  - `benchmarks`: `/benchmarks/introduction/mion-benchmarks`.
- Build output: `.output/public`. `legacy-runtypes/` = redirect-only upload for the old runtypes.pages.dev project.
- Prose voice + what a style pass may touch: [website-writing.md](../../.agents/docs/website-writing.md).
- Subsite wiring + styling: [app/AGENTS.md](app/AGENTS.md). Read before editing `app/`, `sites/`, `content.config.ts`.
- Code import, examples, twoslash, API: [server/AGENTS.md](server/AGENTS.md). Read before an example or `server/` edit.
- Deps + build-script allowlist: [_deps/AGENTS.md](_deps/AGENTS.md). Read before a dependency change.
- Run commands + image lifecycle: [CONTAINER.md](CONTAINER.md).
- Benchmark data the docs read: [docs/WEBSITE-DOCGEN.md](../../docs/WEBSITE-DOCGEN.md).

## Writing guidelines

- How a page is built. Model: [content/01.rpc/02.server/01.routes.md](content/01.rpc/02.server/01.routes.md),
  read it before writing or restyling any page.
- Clear, very concise: say it once, fewest plain words. Cut what does not help the reader do or understand.
- One section, one job: **How** (one sentence, then the `<code-import>` or fence), **What** a feature is (describe,
  then show), or **Why** it is done this way (the reason, short).
- Titles name the job: Title Case noun phrase or gerund ("Defining a Route", "Parser Strategies").
  No slogans ("Fast by construction"), no questions, no backticks.
- A title stands alone: "Rules", "Setup" fail; "Lint Rules", "FriendlyText Shape" pass. Feature names
  (Type Builders, Transforms, RunType, FriendlyText) are fine.
- No code names in a title (function, option, flag, keyword): "Dry Runs", not "Dry Runs with --check".
  First sentence names the API. Two things = two sections.
- Renamed heading = new URL anchor: grep the content tree for the old slug, update every link.
- One table per topic: same-column small tables in a row → one table (group column if needed), no sub-headings.
  Keep tables apart only when columns differ.
- Default, fixed order, gotcha, recommended form → short `::tip` / `::note` right there, 1-2 sentences.
  Never a paragraph. `::tip` = how to do something; `::note` = information only.
- Each fact ONCE per page: paragraph, example, table or tip. A comment in the example says it → paragraph doesn't.
- Every page written or changed → [simplify-docs](../../.agents/skills/simplify-docs/SKILL.md) before the PR, by the
  `docs-simplifier` subagent, NEVER the writing session. Writer still follows every rule here.

### The ideal section

In this order. Drop what is not needed, never reorder, never double a part:

1. `## Title`: names the job, stands alone, no code names, no question.
2. One or two sentences: what it does + when. No lead-in ("Sometimes a whole file..."), not what the example shows.
3. `<code-import ... />`: only what the section explains, 5-15 lines. No unneeded setup, no second feature.
   One-liner comments on the lines that matter, saying why. Never what the API is, never a top comment block.
4. Optional `| ... |`: ONE table for the variants, never one example per variant.
5. Optional `::tip` … `::`: 1-2 sentences, a default, a gotcha, a recommended form.

### Where a change goes

- New value, placement, flag or variant of a covered feature → that section (table row, example line, ≤ 1 sentence).
- New way to do a job the page covers → that section if one example still shows both, else a new one beside it.
- New job (how / what / why) a reader would look for in the TOC → own section, own title.
- New feature with 3+ sections of its own, or fitting no page's job → own page.
- Test: would a TOC reader look under the existing title? Yes → existing section. Two examples or tables under one
  title = should have been two sections.

### Merge, rewrite, split, move or keep

Check every added or changed section. In this order, first match wins:

1. **Merge**: existing title true for both; or shared example, table columns or sentence; or new one < 2 sentences
   + the neighbour's example plus a line. Result: 1 paragraph, 1 example, 1 table.
2. **Rewrite** from the template, in place (keep a still-true title): bolted on, or first sentence lost the job.
   Bolted-on: second paragraph or example, "There is also" / "In addition" / "Note that" / "Sometimes", unfitting new
   table column, first paragraph old feature + second the new one, a `::tip` grown into a paragraph.
3. **Split**: two examples, two tables, or a title needing "and". Each half gets its own title.
4. **Move** to another page: its job belongs to an obvious target page. Not obvious → keep it, flag it.
5. **Keep**: none above (new job, example showing nothing the neighbour's shows, title looked for on its own).

## Content tree

- `content/*.md`, MDC. Subsite dirs `01.rpc/`, `02.runtypes/`, `03.benchmarks/`: `.navigation.yml` (title, icon).
  Section dirs: `.navigation.yml` (title, icon, redirect). Frontmatter: `title`, `description`, `toc`.
- Sections: `NN.<name>/` (`ls` the tree). Benchmarks: `01.introduction/` + one per family (`02.rpc/`, `03.runtypes/`).
- ⚠️ Every prefix TWO digits, new ones too: text sort reorders single digits at a 10th entry (`1 < 10 < 2`).
  Nothing errors, only the nav breaks. URL strips the prefix, so padding is free.
  Pinned by `website-content-prefixes` in `packages/devtools/test/repo-contracts.test.ts`.
- No `index.md` outside the root: any `<dir>/index.md` is a landing page ([app/AGENTS.md](app/AGENTS.md#subsites)).
- `03.middlewares/`: one page per shipped middleware, export name minus `mion` (`fetch-metadata`). Client half = next
  page (`fetch-metadata-client`) with `navigation.class: nav-subpage` (indented under the server page).
- Root-relative links carry the subsite prefix (`/rpc/server/routes`). `website-links.test.ts` fails on a dead one.
- `parked/` (outside `content/`, unseen by collections, link tests, post-build check): pages off the site, kept whole,
  top comment says why + how to republish.
- Subsite homes (about pages) + root `index.md`: hand-tuned, densest custom MDC. Off limits to prose-only style passes;
  API-truth fixes to their examples still required. Root `content/index.md` gets the simplest wording.
- MDC components (custom + Docus built-ins): [app/components/AGENTS.md](app/components/AGENTS.md).

## Development

- Site runs ONLY in its container: `pnpm miondevx website …` from repo root, never raw in-container `pnpm run dev`.
- Flags: `build --no-bench` (skip benchmarks), `preview --no-build`, `check --docs` (code-import + twoslash render),
  `check --static` (serve the BUILT site, assert not hollow).
- Agents: `dev --agent` = own `tsrt-website-agent` container on :3100, stops after ~5 min idle (never hits a human's
  :3000). Browser checks: [website-browser](../../.agents/skills/website-browser/SKILL.md).
- Hot-reload polling auto-on for macOS. `MION_WEBSITE_POLL=1` forces it anywhere.
- In-container scripts: `pnpm run dev`, `dev:fresh`, `build`, `preview`, `check-links` (broken code-import paths).
