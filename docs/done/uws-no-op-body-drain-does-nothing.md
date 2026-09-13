---
type: fix
spec: guidelines
status: done
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

## Outcome — the line is load-bearing (shipped 2026-09-13)

Settled: the drain stays, the comment was wrong about why, and the `pathTransform` catch was missing
the same drain.

### Why the keep-alive probe found nothing

uWS drops the body either way. The drain is not what discards it. In `HttpContext.h` the whole
body-data block is guarded by `if (httpResponseData->inStream)`, and the only thing inside that
block that matters here is the socket timeout: uWS refreshes a socket's idle timeout (10s) **only**
from inside a body-data callback, and runs that callback only when a data handler is registered.

So a body short enough to arrive inside one idle timeout behaves identically with and without the
line, which is every case the original probe measured. A body that takes **longer than the idle
timeout** to finish arriving is the case that differs: with no reader the socket is closed
mid-upload, even though the response already went out.

### The measurements that settled it

The probe from the Evidence section, extended with a raw socket that paces the body (`fetch` and
node's `Agent` cannot trickle). 6 MB announced, sent at 320 KB/s (~19s), same server both runs:

| case | drain registered | bytes accepted | server closed the socket |
| --- | --- | --- | --- |
| unknown path (404) | yes | 6,000,000 / 6,000,000 | no |
| unknown path (404) | line deleted | 3,866,624 / 6,000,000 | yes, at 11.9s |
| known route (200/413) | by `collectBody` | 6,000,000 / 6,000,000 | no |
| client announces a body, sends nothing | either way | 0 | yes, at ~12s (unchanged) |

The known-route row is the control: `collectBody` registers its own `onDataV2`, so that path already
had the refresh. The never-sends row shows the drain does not keep a dead client alive.

The prediction in Direction held. The `resolveRequest` catch had the same shape and no drain, so a
throwing `pathTransform` hit the bug for real: 500 answered, then the socket killed at 12.0s with
3,866,624 of 6,000,000 bytes accepted. With the drain added there: 6,000,000 accepted, never closed.

A client that disconnects mid-body is unaffected, the server keeps serving.

### What shipped

`packages/platform-uws/src/uwsHttp.ts`

- One `drainRequestBody(res)` helper carrying the real reason, replacing the inline `res.onData(() =>
  {})` and the "keeps the connection reusable" clause.
- The same call added to the `resolveRequest` catch, which never had it.
- The block comment describing `uwsRequestHandler` moved onto that function; it had drifted up above
  `toRpcError`.

`packages/platform-uws/src/bodyDrain.spec.ts` (new)

- A raw socket announces a 3 MB `Content-Length` and trickles 20 KB every 100ms (200 KB/s, ~15s,
  past the 10s idle timeout), once for an unknown path and once for a throwing `pathTransform`, both
  concurrently so they share the wall clock. It asserts every announced byte was accepted and the
  server never hung up. Without the drain it fails at ~2.4 MB of 3 MB.
- Its own file rather than an addition to `security.spec.ts`: the router needs a throwing
  `pathTransform`, and a router can only be created once per module.

`security.spec.ts` needed no correction. Its "a large body on the same kept-alive connection is
drained, never assembled" is accurate.

No docs changed: nothing on the website mentions body draining, keep-alive or timeouts, and a uWS
idle-timeout detail is not a knob a consumer sets.
