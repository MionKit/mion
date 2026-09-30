---
type: fix
spec: guidelines
status: done
created: 2026-09-30
---

# Run Every Client Error Handler

## Intent

The client keeps ONE error handler per middleware and error type. `HandlersRegistry.register`
(`packages/rpc-client/src/lib/handlersRegistry.ts`, around line 29) does `handlerMap.set(errorType, handler)`,
so a second `onError` for the same type silently replaces the first.

`useSyncRoutes` (`packages/rpc-client/src/middlewares/syncRoutes.ts`) installs handlers for
`route-types-mismatch` and `route-sync-required`. Ordinary user code then breaks it with no error or warning:

```ts
useSyncRoutes(middlewares.mionSyncRoutes);
useMethodsMetadata(middlewares.mionMethodsMetadata);
// meant to ADD a "please reload" banner
middlewares.mionSyncRoutes.onError('route-types-mismatch', () => showReloadBanner());
```

The built-in handler forgot the stale fetched metadata, fetched the new one and retried, so the call
succeeded. After the user's `onError` it never runs: every call to a changed route fails. The same happens
with `offError('route-types-mismatch')`, or a user `onError('route-sync-required', ...)`.

Decision (from the maintainer): **run all registered handlers** for an error type, in registration order.

## Direction

- Store a list of handlers per middleware and error type, and run them all in registration order. Decide and
  test what happens when a handler throws (today one throw becomes `middleware-on-error-failed`): the others
  should still run.
- `context.retry()` may now be called by more than one handler for the same failure: it must still resend at
  most once per middleware.
- `offError` needs a way to remove only the caller's own handler (e.g. `offError(type, handler)`), so user code
  can never remove the built-in one by accident. Decide whether `offError(type)` with no handler stays; follow
  the "A removed thing leaves NO trace" rule in the root CLAUDE.md if its meaning changes.
- Check whether `onResponse` has the same replace problem and whether it should follow the same rule.
  `onRequest` supplies the middleware's params, so it stays single; but a second `onRequest` on a middleware
  that `useSyncRoutes` or `useMethodsMetadata` owns should not silently drop theirs: at least document it,
  ideally throw.
- Tests in `packages/rpc-client/test/` (mirroring `src/`), including the banner example above with a changed
  fetched route that still recovers.
- Docs: the `::warning` in "Installing the Client Half" on
  `container/website/content/01.rpc/03.middlewares/02.mion-sync-routes.md` (new on branch
  `claude/zealous-pascal-hmgi1b`) becomes a short tip saying your own handlers run next to the built-in ones.
  Also the error handler text in `container/website/content/01.rpc/04.client/` if it says one handler per type.

## Done when

Adding your own error handler to a middleware never disables another handler for the same error, with a test
proving `useSyncRoutes` still recovers a changed fetched route while a user handler also runs.

## Plan (approved 2026-09-30, as shipped)

- `HandlersRegistry` keeps a list per middleware and error type, and a list of `onResponse` handlers per
  middleware. The dispatch runs every one in registration order, each with its own `retry()` window.
- A handler that throws or rejects does not stop the next one. The first failure is the one reported
  (`middleware-on-error-failed` / `middleware-on-response-failed`), and as before a failed handler cancels
  the resend.
- `retry()` from several handlers for the same failure still resends once per middleware: `requestRetry`
  already recorded the middleware id once, so no change was needed there.
- `offError(type, handler)` and `offResponse(handler)` take the handler and remove only it. The handler-less
  forms are gone: the handler is a required argument.
- `onRequest` stays single and a second one replaces the first, as before. The maintainer chose not to
  special-case the middlewares an installer owns: registering hooks correctly is up to the app.
- Tests: `test/isolatedMiddleware.spec.ts` (an app handler next to an installer's, two retries resend once,
  a throw does not stop the rest, every `onResponse` runs, `offError` removes only its own),
  `test/bundled/routeDrift.spec.ts` (a changed fetched route still recovers while an app
  `route-types-mismatch` handler also runs). The recovery test fails on the old code.
- Docs: the hook table and a tip in `01.rpc/03.client/00.client-overview.md`, and a tip under "Handling a
  Stopped Call" in `01.rpc/03.client/06.route-sync.md`. The `02.mion-sync-routes.md` page named above is not
  on `main` yet, so its `::warning` is left for the branch that adds it.
