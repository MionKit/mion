---
type: fix
spec: guidelines
status: ready
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
