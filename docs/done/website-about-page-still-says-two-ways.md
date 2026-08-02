---
type: fix
spec: guidelines
status: SHIPPED
created: 2026-07-31
shipped: 2026-08-02
---

# About page still says "the two ways to describe a shape are really one"

## Shipped

**Option 2 (prose-only), and the content decision was made by the user, not
defaulted:** on 2026-08-02 the user asked for the HOME PAGE to go back to the
two-block define section, with JSON Schema presented as its own dedicated
section at the bottom instead of a co-equal third column. That direction
resolves this todo's premise (the about page no longer contradicts the home
page) and rules out option 1 (a third column would reintroduce the
presentation the user just removed). The about page keeps its two-column
duality grid and gains one sentence after it: a JSON Schema you already have
is a third door into the same engine, and still not a parallel dialect (the
line-15 strengthening this spec suggested). MDC / fence counts unchanged;
no example-file changes, so typecheck is unaffected.

Found during the json-schema rollout docs review. The same claim on the home page was fixed on the rollout branch ("Two ways" → "Three ways" plus a third example column); the About page kept the old count. Filed rather than fixed because the fix needs a content decision.

## Problem

[1.about-ts-runtypes.md:17](../../container/website/content/1.introduction/1.about-ts-runtypes.md): "That principle is why the two ways to describe a shape are really one. A plain type and an `RT.*` schema builder are two doors into the same engine." — followed by a two-column `rt-define-cols` grid importing `whatis-duality.ts` (start-type / start-schema regions). With `runTypeFromJsonSchema` shipped there are three doors, so the design-principles page undercounts the feature and contradicts the home page and the guide.

## Content decision (pick one)

1. **Full third column.** Add a json-schema region to [packages/examples/src/introduction/whatis-duality.ts](../../packages/examples/src/introduction/whatis-duality.ts) and a third `:::code-group` to the grid, mirroring how the home page and `2.guide/01.types-vs-schemas.md` went three-wide. This restructures an MDC grid — allowed as an API-truth update, but verify the per-file MDC-component / code-fence counts changed by exactly the added block, nothing else.
2. **Prose-only.** Reword the sentence to three doors and keep the two-column grid as an illustration of two of them. Cheaper, slightly weaker.

Worth touching in the same pass: line 15's "We don't invent a parallel schema dialect" is still true and is actually strengthened by JSON Schema input (the one schema language accepted is the existing interop standard, not a new dialect). An optional half-sentence could make that point.

## Done when

- The page states three forms, consistent with the home page and guide; `pnpm run typecheck` green (examples compile); MDC / fence counts verified against the pre-edit baseline.
