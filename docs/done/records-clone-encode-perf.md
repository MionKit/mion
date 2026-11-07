---
type: fix
spec: guidelines
status: shipped
created: 2026-11-07
---

# Find out why the RECORDS clone encode got slower in 0.14.0

## Intent

The 0.14.0 dry run's serialization bench (website-deploy run 42332370693, main 3be48af32) against the live 0.13.2 data
(deploy run 40491090323, prod cb9d90ea4), same linux-arm64 runner class and node v26.11.1:

- mion `clone` encode, `RECORDS.multiple_index_props`: 1,733,383/s → 1,103,580/s (-36%).
- mion `clone` encode, `RECORDS.index_property_and_prop`: 9,729,578/s → 7,927,454/s (-19%).
- Possibly noise: `UNIONS.union_object_or_null` clone encode -20%, `ITERABLES.objects_with_nested_maps` mutate
  decode -28%, `REALWORLD.user` compact decode -21%, validation-formats `DATETIME.plainDateTime_rel_combo`
  get-errors on invalid input -11%.
- Native JSON moved only -15%..+17% per case between the runs.

Decide whether the drop is real, find the cause, fix it if it is. A fix must not slow anything else: validation
isValid / getErrors, the other strategies and cases, type cost. A drop that is noise or a deliberate correctness
trade-off is reported with evidence and left alone.

## Direction

- Compare the generated clone encoder for those cases at cb9d90ea4 and at main. Candidate commits in between: the
  class accessor work, the plain object key count gate, the clone encoder's sharing memo and short tuple trim.
- Before / after numbers on one machine: the serialization and validation benches several times each, medians.
- Label the PR `bench-report`. The implementer plans the details.

## Docs

None, because no page describes the benchmark harness or these encoders' internals.

## Done when

- The cause is named with evidence, and either fixed or shown to be noise.
- Before / after tables for both benches are in the PR, nothing else slower.
- The simplify-comments pass ran on every touched source file, committed on its own.

## What shipped

The drop is noise, not a code change.

- The generated clone encoder for both RECORDS cases is byte-identical at cb9d90ea4 and main (hash names aside),
  and the serialization harness and test data did not change between them.
- The harness timed 800 calls per cycle after 50 warm-up calls: under 1 ms on these encoders. The same encoder, timed
  that way in fresh processes, read 0.99M/s to 2.03M/s. Six alternating runs of cb9d90ea4 and main on one machine
  gave the same two speed levels for both.

Fixed on the way:

- A second index signature with the first one's value type (`Record<string | number, T>` resolves to two) is skipped
  by the clone and compact encoders, validate and getErrors (`repeatsIndexSignature` in `kinds.go`). They wrote each
  value twice, swept every key twice, and getErrors reported one bad value twice. Mutate already skipped it.
- `scripts/website/bench-data/ops-timer.mjs`: each serialization cycle lasts at least 5 ms, after at least 25 ms of
  warm-up, over a fresh pool, in a loop compiled for that one stream. A full run takes about 3 minutes instead of
  36 seconds. Median max/min spread per row over five runs of the same code: 1.63 → 1.39 on a shared machine.

Evidence that nothing else moved: compiling every run-types test suite type with the old and new resolver changes
only the clone and compact encoders of the two types carrying a repeated signature; all 572 generated validation
functions of the validation bench, and its built bundle, are byte-identical.

Overlapping signatures whose value types differ are still inconsistent across families: that needs a rule decided
first, filed as its own todo.
