---
type: feature
spec: guidelines
status: ready
created: 2026-08-25
---

# Cross-platform WebSocket transport on crossws

## Intent

mion is HTTP RPC only today. Add a websocket transport that works IDENTICALLY on every platform
mion ships, using [crossws](https://github.com/h3js/crossws) as the cross-platform bridge. The
uniform API is the point: one mion websocket story with per-platform adapters handled by crossws,
not a per-platform reimplementation. Wanted by the owner right after platform-uws landed (the uWS
adapter is crossws' fastest backend, and our binary mirror is what makes it installable).

## Direction — verified facts (2026-08-25, crossws 0.4.12)

- crossws is a normal MIT registry package with ZERO runtime dependencies (one optional peer dep,
  srvx, we do not need). It exact-pins cleanly under this workspace's policies — no git
  specifiers anywhere in its chain.
- It is websockets ONLY (upgrade + messaging). It does NOT serve HTTP and does NOT bundle
  uWebSockets.js: `src/adapters/uws.ts` imports uws TYPES only and returns a websocket behavior
  the consumer registers on their OWN app. So it composes with @mionjs/bin-uws + @mionjs/platform-uws
  rather than replacing anything: our mirror supplies the binaries its uws adapter needs.
- Wiring points, all on servers our adapters already own (each is a few lines):
  - platform-uws: `app.ws('/*', adapter.websocket)` registered NEXT TO the existing
    `app.any('/*')` in `startUwsServer` — one app, one port, HTTP and websockets together.
  - platform-node: `crossws/adapters/node` hooks the node server's 'upgrade' event.
  - platform-bun: `crossws/adapters/bun` plugs into `Bun.serve`'s websocket field.
  - cloudflare adapter exists; also deno, and an SSE fallback adapter for platforms
    without real websockets.
- The adapters expose per-connection peers, publish/subscribe (mapped to uWS' NATIVE pub/sub on
  that platform), upgrade hooks (the auth point), and an idleTimeout/keepalive knob.
- Useful background from the platform-uws work (docs/done/uws-platform-adapter.md): the uWS app
  is created by `@mionjs/bin-uws`'s loader; `packages/platform-uws/src/uwsHttp.ts` owns the app and
  is where `app.ws()` would register.

## Deliberately NOT designed here: the websocket paradigm

The message/routing paradigm is left open ON PURPOSE — do not treat this doc as a design. The ONE
constraint the owner has set: whatever is proposed must fit INTO the current mion router system
and its strongly-typed request/responses — websocket routes as an ALTERNATIVE alongside today's
routes (same typing/validation story), not a separate parallel system. Within that constraint,
the implementing agent must, BEFORE writing any plan:

1. Analyze mion's current route paradigm (router, dispatchRoute, execution chains, request/response
   envelopes, the client package) in this codebase.
2. Analyze the crossws codebase/API (peers, hooks, pub/sub, resolve/upgrade flow).
3. Investigate the interaction between routers and wsRoutes in routesFlow
   (packages/router/src/routesFlow.ts and its spec): whether a root websocket dispatcher (or
   similar) would support routesFlow across both kinds of routes, or whether keeping them separate
   is the better shape — routesFlow must be taken into account in every proposed design.
4. Propose a FEW alternative designs to the user (e.g. how a ws message maps to routes, what
   subscriptions/server-push look like, what the client side is) and settle the paradigm in that
   discussion — the user decides. Only then plan and build.

## Done when

- The paradigm was proposed as alternatives, discussed, and decided with the user, and the decision
  is recorded (appended to this doc per the implement-todo flow).
- One mion websocket transport rides crossws and works identically on at least uws, node and bun
  (cloudflare if the discussion scopes it in), with tests per platform lane.
- Usual PR-readiness gate: vitest coverage, website docs for the new transport, this spec updated
  to what shipped and moved to docs/done/.
