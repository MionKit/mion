---
type: fix
spec: guidelines
status: ready
created: 2026-09-02
---

# Compact codec loses an object whose key contains a double quote

## Intent

The roundtrip fuzz soak (`fuzz soak · roundtrip` in `release-gate.yml` and `fuzz-soak.yml`)
found 4 violations, all on one generated type, all in the COMPACT format. A value like

```json
{"kind":"t1","f0":[{"with\"quote":true}]}
```

comes back from the compact round-trip as

```json
{"kind":"t1","f0":[[true]]}
```

The object with the quoted key turns into a bare array, `validate` rejects the decoded value,
compact disagrees with clone and with the native JSON projection, and the wire is not stable.
The other codecs (json, binary, clone) agree with each other, so this is a compact encoder or
decoder bug around escaping a `"` inside an object key, most likely in the key table or the
object/array discrimination.

Found on 2026-09-02 by the release gate on PR #201 (run 33579204363, seed `0xd179ff0b`).
Predates that branch, which touches no codec code.

## Direction

- Replay: `MION_FUZZ_SEED=0xd179ff0b pnpm rtx core fuzz roundtrip --soak`. The violating
  type is logged as `({1}|{2}|{1}|{1}) (seed=2792797093)` with the four `RT-*/compact`
  oracle names; the fuzz harness under `packages/run-types/test/fuzz/roundtrip/` can
  regenerate that one type from its per-type seed.
- Reduce it to a hand-written feature test first (a union arm whose object has a key with a
  `"` in it, nested in an array), so the fix is pinned by a deterministic test and not only
  by the fuzzer. Follow the Marker test coverage rule in `ts-go-runtypes/CLAUDE.md` if the
  test goes through the marker API.
- Then fix the compact codec (the Go emitter and its JS twin, whichever side owns key
  escaping) and confirm the seeded soak passes.

## Done when

- The reduced feature test passes and the compact round-trip of a quoted-key object equals
  the clone / json results.
- `MION_FUZZ_SEED=0xd179ff0b pnpm rtx core fuzz roundtrip --soak` reports 0 violations.
- `fuzz soak · roundtrip` is green on `main`.
