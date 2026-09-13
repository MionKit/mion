---
type: fix
spec: guidelines
status: ready
created: 2026-09-13
---

# The uws no-op body drain looks like dead weight, and its comment may be wrong

## Intent

`packages/platform-uws/src/uwsHttp.ts` registers a no-op reader before dispatching a not-found
request, and says why:

```ts
// A not-found chain has no route to feed: the body is consumed
// as it arrives and dropped (a no-op reader keeps the connection reusable), never assembled.
if (!resolved.readsBody) {
  res.onData(() => {});
  dispatchBody('', false);
  return;
}
```

A keep-alive probe cannot find any behaviour the line is responsible for. Either it is dead weight
and should go along with the half of the comment that justifies it, or it is load-bearing for a
reason the comment does not name and the comment should say the real one. Both outcomes are fine;
what is not fine is leaving a line whose stated reason nobody can reproduce.

Settle it, then make the code and the comment agree.

## Evidence

A probe over node's own keep-alive agent, which handles the HTTP protocol correctly (a hand-rolled
raw-socket probe does NOT work here: it fails to get a second response even for a plain 200, so it
cannot measure reuse at all and will mislead you).

```ts
// one request over a keep-alive agent, then a second on the same agent; the socket is tagged on
// the 'socket' event so a REUSED connection shows the same id both times
const agent = new Agent({keepAlive: true, maxSockets: 1});
const first = await call(agent, path, body);
const second = await call(agent, '/api/echo', '{"echo":[7]}');
const reused = first.socket === second.socket;
```

Every case, with the line present and with it deleted:

| case | first | second | same socket |
| --- | --- | --- | --- |
| control, a normal echo | 200 | 200 | yes |
| not-found, small body | 404 | 200 | yes |
| not-found, 300 KB body | 404 | 200 | yes |
| throwing pathTransform, small body | 500 | 200 | yes |
| throwing pathTransform, 300 KB body | 500 | 200 | yes |

The throwing `pathTransform` rows matter because that branch has never had the drain, so it is the
natural control for what its absence costs. It costs nothing measurable.

## Direction

The implementer plans the details. Worth knowing before starting:

- The probe above is the tool. Rebuild it rather than trusting a raw-socket version.
- 300 KB was the largest body tried. A body big enough to span many socket reads, a slow client that
  trickles the body, and a client that never finishes sending are the cases not yet covered, and are
  the most likely place for a real difference to show.
- uWS frees the response object on abort (`res.onAborted`), so a case where the client disconnects
  mid-body is worth including.
- If the line IS load-bearing, the same reasoning probably applies to the `pathTransform` catch a few
  lines above, which has no drain: that one would then be a real bug, with the probe to prove it.
- If it is NOT, delete the line and the clause that justifies it, and check whether
  `packages/platform-uws/src/security.spec.ts` still says anything untrue about draining.

## Done when

The line is either gone or kept with a comment naming a reason a test can demonstrate, and that test
exists.
