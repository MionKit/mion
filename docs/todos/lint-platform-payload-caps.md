---
type: feature
spec: guidelines
status: ready
created: 2026-09-11
---

# Build-time diagnostics for the hosting platform's payload ceilings

## Intent

Each hosted platform refuses a request past its own ceiling before mion runs, and a response past
its own ceiling on the way out, and the developer only finds out in production. The router already
brings every request limit it resolves down to the adapter's `maxBodySizeCap`, silently. What is
missing is the message at build time: "this option asks for more than the platform allows" and
"this route's return type allows more than the platform answers". Nothing runs at request time.

## Direction

The implementer plans the details. What was checked:

- **A resolver diagnostic, not a hand-written ESLint rule.** mion's lint rules
  (`packages/devtools/src/lint/`) are transport for the Go resolver's diagnostics: one pass per
  file, fanned out by `diagnosticRouting.ts`, with mion's own route rules living in
  `ts-go-runtypes/internal/compiler/routerrules`. A hand-written rule comparing literals was
  built and removed on purpose; the check belongs with the others, in Go, emitted at
  `mion.route()` / `mion.middleFn()` call sites and at the adapter's `createXHandler` /
  `startXServer` call.
- **Two findings, one family.** Request side: a literal `maxBodySize` above the ceiling (route,
  middleFn or adapter option), and a derived limit above it when the walk can tell. Response side:
  the return type's `jsonMaxBytes` (the compiler already emits it on every bounded reflection root,
  return roots included) above the platform's response ceiling. Warnings, opt-in severity; an
  unbounded type is never reported (the unbounded-types lint is its own todo).
- **Knowing the platform.** The adapter import in the file names it (`@mionjs/platform-<name>`);
  route files need a project setting (a tsconfig plugin key or a preset option), and a
  `maxBodySizeCap` literal or option overrides the table for a bigger plan.
- **The ceilings, verified per vendor.** Request: Cloudflare Workers 100 MB on Free and Pro
  (200 MB Business, 500 MB Enterprise, the zone plan), Vercel 4.5 MB, AWS Lambda 6 MB on a
  synchronous invocation (1 MB behind an Application Load Balancer), Google Cloud Functions 10 MB
  on 1st gen and 32 MB on 2nd gen; Node, uWebSockets and Bun none. The request numbers are the
  adapters' `*_MAX_BODY_SIZE_CAP` constants. Response: Vercel 4.5 MB (a streamed response is not
  counted), AWS Lambda 6 MB buffered and 200 MB streamed, Google 10 MB on 1st gen and 32 MB on 2nd
  gen (10 MB streamed), Cloudflare and the self-hosted runtimes none. The response numbers live
  nowhere in the code today; this doc is their home until the diagnostic ships.
- **Docs**: the linter page lists the new rule names; the security page's ceilings table can grow a
  response column back once the response diagnostic exists.
