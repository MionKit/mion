---
type: docs
spec: guidelines
status: done
created: 2026-09-10
completed: 2026-09-10
---

# Two bits of router documentation say something the code does not

Both were found while reading the router for an unrelated change, and both predate it. Neither is on
that change's code path, so they are delegated here rather than fixed inline.

They are grouped in one spec on purpose: two small documentation fixes, one PR.

## Finding 1: the context pool default is documented as off, and it is on

`packages/router/src/types/general.ts` documents `maxContextPoolSize` as disabled by default:

```ts
  /**
   * Maximum size of the CallContext pool for reduced memory allocations.
   * ...
   * Set to 0 to disable pooling.
   * @default 0 (disabled)
   */
  maxContextPoolSize: number;
```

`packages/router/src/constants.ts:27` sets it to `100`:

```ts
export const DEFAULT_ROUTE_OPTIONS = {
  ...
  maxContextPoolSize: 100,
  ...
} as Readonly<RouterOptions>;
```

So pooling is ON by default and the type says it is off. Anyone reading the option to decide whether
to turn pooling on gets the wrong answer, and pooling is not a cosmetic detail: it decides whether a
`CallContext` object is reused between requests.

`100` looks like the deliberate value (the pool code, `acquireCallContext` / `releaseCallContext` in
`packages/router/src/callContext.ts`, is written to be the normal path), so the likely fix is the
JSDoc, not the constant. Confirm which one is intended before editing, `git log` on both lines and
the router's own docs are the places to look.

Check whether the website repeats the wrong number too. `container/website/content/01.rpc/` does not
appear to document this option today, but the whole `02.server/` dir is worth a grep for
`maxContextPoolSize` and for "pool".

## Finding 2: three dead in-page links on the routes page

`container/website/content/01.rpc/02.server/01.routes.md` links to three anchors that have no
matching heading anywhere on that page:

```md
line 80:  ... by passing the [`Handler`](#handler) as first parameter and [RouteOptions](#routedef) as second.
line 145: The [`CallContext`](#callcontext) contains all the data related to the ongoing call.
```

The page's headings are `Jargon`, `Creating the Router`, `Defining a Route`, `Query and Mutation
Handlers`, `Strict Types`, `Registering Routes`, `Naming Routes`, `Sanitize Params`, `Awaiting Every
Step`, `Call Context`, `Sharing Data between MiddleFns and Routes`, `Context Data Factory`,
`Defining a context data factory`. So all three links land nowhere: a reader clicking them stays put.

They read like leftovers from an API-reference section that used to sit on this page. Decide per
link whether to point it at a real destination (`#call-context` exists for the third one, and the
`Handler` / `RouteOptions` types may be better served by a link to the relevant page section) or to
drop the link and keep the plain text.

While there, sweep the rest of `01.rpc/` for other in-page anchors with no heading behind them, so
this is fixed once rather than one link at a time.

## Done when

- The context pool default is stated correctly in exactly one place, and nothing else repeats a
  different number.
- Every in-page link on the routes page reaches a heading that exists, and the sweep found no others
  in `01.rpc/`.
- If the fix changes anything a consumer reads, the website says the same thing as the code.

## What shipped (2026-09-10)

### Finding 1: the option was removed, not the tag corrected

The first read confirmed the spec's guess. `git log` shows `maxContextPoolSize: 100` arriving with
`constants.ts` itself, and `dispatch.ts` read it as the normal path rather than an opt-in, so `100`
was deliberate and the tag was the drift.

Correcting the tag was the plan. Reviewing the pool before doing it changed the answer: the pool is
gone instead, so the wrong tag went with it. Measured over 300k and 600k dispatches by counting GC
cycles with a 1MB young generation, it saved ~10 bytes per request (6% of the router's garbage), no
time (+0.6% / -0.6% / -3.4% at 1 / 50 / 200 concurrent) and no GC time, with zero major collections
either way. Against that it wiped a released context and handed the shell to the next request, so a
handler holding its context past the response read nulls and then another request's data. Removing
the binary wire had already taken `releaseBinBuffer`, the one part of a context worth reusing.

That same binary removal also left `binSerializer` and `releaseBinBuffer` behind in
`createCallContext`, off the `MionResponse` type and hidden by an `as` cast, so the pooled and fresh
paths returned two differently shaped response objects. Both lines went with the pool.

`maxContextPoolSize` is now `?: never`, the same retirement `serializer` got, so the old key is a
type error rather than silently ignored. `getContextPoolStats`, `clearContextPool`,
`acquireCallContext` and `releaseCallContext` are gone; `createCallContext` is the one path.

The website never documented the option and `01.rpc/` has no router-options table, so nothing else
in the tree had to change.

### Finding 2: five dead anchors, not three

Sweeping `01.rpc/` for links pointing at a heading (in-page `#x` and cross-page `/page#x` alike)
turned up five, two more than the spec listed. The rest of the content tree, `02.runtypes/` and
`03.benchmarks/` included, is clean.

| Link | Was | Now |
| --- | --- | --- |
| `02.server/01.routes.md:80` | `[`Handler`](#handler)` | plain `` `Handler` ``, no section to link to |
| `02.server/01.routes.md:80` | `[RouteOptions](#routedef)` | plain `` `RouteOptions` ``, same reason |
| `02.server/01.routes.md:145` | `[`CallContext`](#callcontext)` | plain `` `CallContext` ``, the link sat under the `Call Context` heading it meant to reach |
| `02.server/02.middle-fns.md:50` | `` [`mion.rawMiddleFn`](#rawmiddleFndef) `` | plain `` `mion.rawMiddleFn` ``, same self-link |
| `01.introduction/03.manual-install.md:9` | `/rpc/introduction/about-mion-rpc#automatic-serialization-validation` | `/runtypes/introduction/configuration#setting-options`, where the tsconfig entry is actually documented |

The first two had no destination anywhere on the site: no page documents `Handler` or `RouteOptions`
under a heading, so the link was dropped and the type name kept.

One near miss worth recording: `about-mion-rpc.md#rpc-like` looks dead to a naive sweep because its
headings sit indented inside MDC cards. It resolves, and the new check indexes indented headings so
it does not report it.

### Guards, so neither comes back

- `packages/devtools/test/website-links.test.ts` grew `website-anchor-links`: it indexes every
  heading id the content tree publishes and resolves every `#anchor` link against the page it
  targets. It joins the link checks already in that file, which skipped anchors entirely.
- `packages/router/src/callContext.spec.ts` is new: one context per request, still readable after
  the response, untouched by later requests, and kept apart across 50 concurrent requests. Every one
  of those failed while pooling was on.

Each guard was confirmed to fail when the bug it covers is put back. The anchor check earned itself
immediately: rebasing onto main it caught a sixth dead link, `See [Server](#server)` on the vite
devtools page, written by a doc rewrite that landed while this branch was open. It now points at
`#server-only`, the section that exists.

A third guard was written and then dropped: a test comparing every `@default` tag in `RouterOptions`
to `DEFAULT_ROUTE_OPTIONS`. It would have caught finding 1 (TypeScript checks the type, never the
comment text, which is why the wrong tag survived), but the option it was written for no longer
exists, and pinning the remaining tags was judged not worth an obligatory JSDoc edit on every
default change.
