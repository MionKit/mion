---
type: chore
spec: guidelines
status: ready
created: 2026-08-29
---

# Re-run the typecost benchmark after the builder cost work

## Intent

[docs/done/builder-type-instantiation-cost.md](../done/builder-type-instantiation-cost.md)
cut the type-instantiation cost of the union type channel and the preset format
merge, and proved it with an internal budget suite. It never re-ran the OUTER
scoreboard, so we still have no fresh number for where we sit against zod, which
is the comparison that started that task.

## Direction

Run the typecost lane and publish the new numbers:

```
pnpm rtx bench typecost
```

It needs the `tsrt-website` container image. The original task could not get it:
GHCR returned `unauthorized` for `ghcr.io/mionkit/tsrt-website:latest`, and the
local fallback build could not fetch `node:26-bookworm` through the proxy
(`Forbidden` from the Docker CDN). So this wants a host with container egress, or
a GHCR login.

What to look at once it runs:

- The `ts-go (builder)` column against `zod` per case, especially the union cases
  and the string-format cases with params, since those are what moved.
- Whether the gap the original task set out to close actually closed. If it did
  not, that is the interesting result, and the internal report at
  [packages/ts-runtypes/reports/builder-cost.md](../../packages/ts-runtypes/reports/builder-cost.md)
  is the place to start on why: it lists what each builder and format costs, and
  the suite's file header records the seven optimisations that were measured and
  rejected.

The implementer plans the details, including whether any of it is worth a website
docs update.

## Done when

The typecost lane has run against the current tree and the result is reported: the
new position against zod, and whether the builder cost work moved the benchmark
the way the internal budgets say it should have.
