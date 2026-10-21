---
type: fix
spec: guidelines
status: done
created: 2026-09-28
---

# Cloudflare handler tests: the first request pays workerd's startup

## Intent

`packages/platform-cloudflare/test/cloudflareHandler.workers.spec.ts` "cloudflare handler (workerd runtime) > with
the default clone parser > should get an ok response from a route" timed out at vitest's default 5000 ms during a
full `pnpm run test:ci` run (mion-platforms batch, on a loaded host). Rerun alone it passed twice (32/32). A red
full run on a timing race blocks every PR that happens to hit it.

## Direction

The implementer plans the details. What was checked:

- Each describe's `beforeAll` builds the worker with `createMiniflare(setupOptions())` and does not wait for it, so
  workerd starts inside the FIRST test's `mf.dispatchFetch`, under the 5 s test timeout, not the hook's.
- Likely fix: `await mf.ready` in every `beforeAll` that creates a Miniflare in this package's workers specs (and a
  hook timeout that covers the startup), so tests only measure requests. Check the sibling workers specs
  (`cloudflareStorage.workers.spec.ts` and the rest) for the same pattern.
- Never raise the test timeout alone or retry the test: that hides the race instead of removing it.

## Docs

None, because it is a test-only change.

## Done when

- Every Miniflare the platform-cloudflare workers specs create is ready before its first test runs.
- `pnpm --filter @mionjs/platform-cloudflare test` passes, and so does the mion-platforms batch of `pnpm run test:ci`.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-28)

What shipped, all in `packages/platform-cloudflare/test/cloudflareHandler.workers.spec.ts`:

- `createMiniflare` became the async `startMiniflare`, which awaits `mf.ready` before returning, so no caller can hand a test an unstarted worker.
- Every `beforeAll` awaits it. The two tests that built a Miniflare in their own body ("should include default headers" and "setup options") now build it in a `beforeAll`; default headers got its own describe for that.
- No timeout change: startup measured 100-200 ms, well inside vitest's 10 s hook timeout. No retry.
- `cloudflareStorage.workers.spec.ts` already awaited `mf.ready`; unchanged.

Measured: the first test of each describe dropped from 100-160 ms to 5-40 ms. `pnpm --filter @mionjs/platform-cloudflare test` passes (32/32) and so do the mion-platforms batch projects together (128/128).
