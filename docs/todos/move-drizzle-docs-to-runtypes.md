---
type: docs
spec: guidelines
status: ready
created: 2026-10-30
---

# Move the Drizzle ORM Docs to the RunTypes Subsite

## Intent

The Drizzle ORM section lives in the RPC subsite (`container/website/content/01.rpc/05.drizzle-orm/`, 9 pages),
but it documents a RunTypes feature. `@mionjs/drizzle-orm` imports only `@mionjs/run-types/formats`, never the
router, and the pages explain how Drizzle tables become RunTypes types and type formats: column formats, views,
constraints, row level security, relations, the schema file, migrating an existing schema, Cloudflare storage.
A reader looking for "types from my database tables" looks under RunTypes. RPC keeps one page on the
RPC-specific part: using those tables in mion routes.

## Direction

The implementer plans the details; these are the verified pointers and constraints.

- Move the section into a new RunTypes section dir (`content/02.runtypes/NN.drizzle-orm/`, two-digit prefix,
  placed where it reads best in the RunTypes nav), with its `.navigation.yml` (title, icon).
- Add ONE page to the RPC Server section (`content/01.rpc/02.server/`) on using Drizzle tables with mion routes,
  linking to the RunTypes section for everything else. Write it for its job; don't copy the overview.
- Decide per page whether it belongs in RunTypes. The Cloudflare D1 / Durable Objects page is about storage
  drivers on a platform: it may fit better next to `01.rpc/06.platforms/05.cloudflare.md`, which already links
  it. Record the choice in the PR.
- Every moved page gets a new URL. Update:
  - links in `01.rpc/01.introduction/01.about-mion-rpc.md`, `01.rpc/06.platforms/05.cloudflare.md`,
    `01.rpc/07.devtools/01.linter.md`, and the section's own cross-links;
  - `public/_redirects`: add `/rpc/drizzle-orm/*` to the new section, and repoint the existing `/drizzle-orm/*`
    and `/rpc/drizzle-orm/indexes-constraints` rules so every old URL lands on its final page in ONE hop
    (`website-links.test.ts` enforces this). No rule may cover a page that stays under `/rpc`, or a file in
    `public/`.
- Check doc links in `packages/drizzle-orm/` (README, AGENTS.md) and the drizzle-slim-schemas skill.

## Docs

RunTypes: new section holding the moved pages. RPC: one new page in the Server section, plus the link updates above.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The Drizzle docs live under `/runtypes/...`, the RPC Server section has one Drizzle page, and every old
  `/rpc/drizzle-orm/...` and `/drizzle-orm/...` URL 301s to its new page in one hop.
- `website-*` and `repo-contracts` tests pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
