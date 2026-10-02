---
type: fix
spec: guidelines
status: ready
created: 2026-10-02
---

# sechttp soak flags a HEAD request as a JSON response that does not parse

## Intent

The release gate's `sechttp` fuzz soak failed on `main` in the `workflow_dispatch` run
https://github.com/MionKit/mion/actions/runs/37071291695 (job "fuzz soak · sechttp"):

```
FAIL test-router-fuzz test/fuzz/security/httpFuzz.integration.test.ts
  > the node adapter answers every raw-socket attack with a typed response and keeps serving
Error: 2 violation(s):
  [SH-ENVELOPE] sock.method (seed=0xa19f052f): a JSON response that does not parse
      HEAD /echoUser HTTP/1.1
      Host: x
      Content-Length: 0
```

Replay: `MION_FUZZ_SEED=0xa19f052f pnpm miondevx core fuzz sechttp` (the soak itself:
`MION_FUZZ_SEED=37071291695 pnpm miondevx core fuzz sechttp --soak`).

A HEAD response carries no body by the HTTP spec, so one of two things is wrong:

- the `SH-ENVELOPE` oracle expects a JSON body on a HEAD answer (an oracle bug), or
- the node adapter answers HEAD with a JSON content type and a body that a client then sees as empty or truncated
  (a router / platform-node bug).

## Direction

- Replay the seed, capture the raw response, and decide which side is wrong.
- Fix that side. If it is the oracle, make it treat a HEAD answer as headers only. If it is the adapter, make its HEAD
  answer valid.
- Pin the case with a regular (non-fuzz) test so it does not depend on the seed.

## Done when

- The replay above passes.
- A plain test covers a HEAD request on a route.
