---
type: chore
spec: guidelines
status: ready
created: 2026-09-17
---

# uws holds a large response twice while a slow client reads it

## Intent

`reply()` in [uwsHttp.ts](../../packages/platform-uws/src/uwsHttp.ts) ends every response with
`res.end(payload)`. uWS takes the whole string and copies whatever the socket cannot send into its
own backpressure buffer, so while a slow client drains it the response exists twice: once as the JS
string, once natively. Nothing caps that native buffer, nothing observes the drain, and mion cannot
apply flow control.

`tryEnd` / `onWritable` / `getWriteOffset` are all declared in
[bin-uws/lib/index.d.ts](../../packages/bin-uws/lib/index.d.ts) and used nowhere in the repo.

## What was already tried, and why it was reverted

A `tryEnd` + `onWritable` streaming path was written and then taken back out. The reasons are the
useful part of this document:

- **`onWritable` never fired.** Instrumented on a 700 KB response over a local `fetch` client,
  `tryEnd` returned `done: true` on the first call every time. uWS accepted the whole response
  immediately, which means it buffered it, which is exactly what `end()` does. At that size the
  streaming path bought nothing and the resume branch was dead code.
- **Its test could not fail.** A 4-case spec over a 700 KB multi-byte response passed against a
  deliberately broken version that sliced the JS string by a byte offset, because the resume branch
  it was meant to exercise never ran. A test that passes against the bug is worse than no test.
- **It cost memory in the change that was trying to save memory.** `tryEnd` offsets are bytes, so
  the body has to become a `Buffer` first: a second full copy of every large response, paid on every
  request, to avoid a copy that only a slow client provokes.

## What would make this real

Start with the harness, not the code. There is no way to demonstrate the problem today:

- A **throttled reader** test: a raw socket that sends the request and then reads the response
  slowly, the download twin of the upload trickle in
  [bodyDrain.spec.ts](../../packages/platform-uws/src/bodyDrain.spec.ts). It has to actually make
  `tryEnd` report not-done, proven by instrumenting the branch, not assumed.
- Then a measurement showing the native buffering it avoids, since peak RSS is where that memory
  lands.
- Only then the streaming path, with the Buffer copy accounted for: it has to pay for itself
  against the copy it adds, not just against the copy it avoids.

The byte-offset trap is the thing that breaks quietly: resuming by slicing a JS string at a byte
offset cuts multi-byte characters in half, and the failure looks like a couple of replacement
characters in a large body.

## Done when

A throttled-client test provokes real backpressure and fails without the streaming path; the
streaming path exists; and a measurement shows peak memory under a slow reader improving by more
than the Buffer copy costs. Or: the investigation shows uWS' own buffering is fine and this is
closed with the numbers that say so.
