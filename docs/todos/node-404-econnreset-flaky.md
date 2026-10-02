---
type: fix
spec: guidelines
status: ready
created: 2026-10-02
---

# Flaky node 404 test: ECONNRESET under load

## Intent

`pnpm test` must be green every run. One platform-node test fails now and then during a full run:

```
FAIL |platform-node| test/security.spec.ts > node adapter: an unknown path never reads the body >
     the 404 carries the route-not-found envelope and no parse error for a body that is not JSON
Error: read ECONNRESET
```

Seen once on a macOS (darwin arm64) host, full `pnpm test`, main at `a8119e1a0`. The same file passes 5 of 5 when run
alone, so it only fails under load.

## Direction

The implementer plans the details. Likely cause, to confirm first: the node adapter answers an unknown path with a 404
without reading the body (by design), and the request sends `Connection: close`. If the server closes the socket while
the 9 body bytes are still unread or still arriving, the kernel sends a reset, and the test's `rawRequest` sees
`ECONNRESET` instead of the response it already got.

Decide where the fix belongs:

- In the adapter, if a client can lose a 404 it was already sent (for example by draining or half-closing before the
  close). That is a real bug for consumers, not just a test problem.
- In the test helper, if the response is always fully sent and only the helper reports the late reset as a failure.

Keep the "never reads the body" promise intact either way. The sibling test in the same `describe` ("answers 404 before
the body finishes and serves a second request on the same connection") covers the keep-alive case.

## Docs

None, because this is a test reliability fix (or an internal adapter fix) with no documented behaviour change.

## Done when

- The test passes reliably under a full `pnpm test`, proven by repeated runs (for example the file in a loop while the
  rest of the suite runs), with the cause explained in the PR.
- The simplify-comments pass ran on every touched source file, committed on its own.
