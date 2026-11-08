---
type: docs
spec: guidelines
status: ready
created: 2026-11-08
---

# Rewrite the batch page: a typed, compiled alternative to GraphQL

## Intent

`container/website/content/01.rpc/04.client/03.batch.md` explains how a batch request works, but not why it
matters. Batching is one of mion's most distinctive features and the page should say so plainly:

- It is a strongly typed, fast alternative to GraphQL. The client composes existing routes into one request,
  with no schema, resolvers or query language.
- Query planning is orchestrated from the client: the client decides which routes run, in what order, and how
  one route's output feeds the next.
- The `inputFrom()` mapper is written in the client but runs on the server, in the same request, with no extra
  round trip. The build copies it into the server.
- Only batches the build compiled can run, so a caller can never make the server run a route mix nobody wrote.

Edits to the current page have not improved it, so it is rewritten from scratch.

## Direction

The implementer plans the details. Constraints from the maintainer:

- Delete (empty) the current page first. Then brief a fresh subagent to study the feature end to end (client
  `batch()` / `inputFrom()`, the build's batch compilation, the server batch table) and only then write the new
  page. The parent session does not draft the page itself.
- Lead with the why: the GraphQL comparison, client-side query planning, and mapper code declared in the client
  but run on the server.
- One section for compilation, titled "Why batch requests need compilation". It merges today's "Why Only Compiled
  Batches Run" and "Writing a Batch the Build Can Read" (whose title says nothing).
- Examples use only users / orders style routes. Never `sayHello`, `sumTwo` or other `utils` routes. Replace the
  `hello-sum*` imports, and any `batch-*.ts` example built on them, under `packages/private-examples/src/client/`.
- Keep the existing `rpc-batch-compiled` card (batches compiled at build time): the maintainer likes it. Reuse it
  in the compilation section, reworked:
  - Its code examples get syntax highlighting.
  - Show what the build compiles: each batch's plan (routes in order, `inputFrom` mappings), and the `inputFrom`
    mapper code moving from the client into the server.
  - Animate how the blocks of two routes and their middleware merge into one execution chain. Show it as the
    server does it: built once per batch id on its first request, then reused (`getBatchExecutionChain` in
    `packages/rpc-router/src/batches.ts`), not at compile time.
- Add a new animated card (card skill, `tools/code-card/`) for the overall flow: the client composes the routes
  and mappings, the build compiles the plan, one request carries only the id, and the server runs each route and
  feeds the mapper output into the next.
- Keep every fact the page states today (limits, errors, ids, choices / unions, middleware behaviour) unless the
  code no longer does it.

## Docs

Page: `container/website/content/01.rpc/04.client/03.batch.md`, rewritten. Examples:
`packages/private-examples/src/client/batch-*.ts` and their route files. Cards: the reworked `rpc-batch-compiled`
in the compilation section, plus a new animated flow card under `tools/code-card/cards/`, both exported to the site.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The page opens with why batching matters: the GraphQL alternative, client-side query planning, mappers run on
  the server.
- One "Why batch requests need compilation" section replaces the two current ones and shows the reworked
  `rpc-batch-compiled` card: highlighted code, the plan and mapper code moving into the server, and the
  once-per-batch merge of routes and middleware.
- Every example on the page uses users / orders routes only.
- A new animated card shows the client → build → one request → server flow.
- The page was written by a subagent after studying the feature, not edited from the old text.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
