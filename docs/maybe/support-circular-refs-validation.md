# `supportCircularRefs` — validate cyclic graphs instead of rejecting them

Status: **IDEA — needs a motivating use case before implementation.** Captured
from the design discussion that followed shipping the
`rejectCircularRefs` compiler option.
Priority LOW: the scenarios below are real but niche, and the owner's own
assessment tempers them — support-mode validation only matters once values are
already **in memory**, and in-memory values are usually constructed by typed
code, so full structural validation there is of questionable value. Do not
build this until a concrete consumer asks for it; until then this spec records
the semantics + design so the discussion isn't lost.

## Idea

`{rejectCircularRefs: true}` treats a reference cycle as a **violation**
(validate → `false`, verr → `{expected: 'circular'}`). That is the right
verdict under the library's validate contract (serializable data only — a
cyclic value can never round-trip through JSON/binary), but it is the wrong
tool for validating a legitimately cyclic **in-memory** graph that conforms to
a recursive `T`.

Proposed: a second compile-time option, `supportCircularRefs`, on
`ValidateOptions` ONLY (validate + getValidationErrors; meaningless for the
encoders, which can never represent a cycle):

- A cycle edge **terminates descent** instead of failing: re-encountering a
  value currently being validated at the same type node returns `true`
  ("assume valid — it is being checked"). Every node in the cyclic graph is
  still structurally validated exactly once.
- verr in support mode records nothing for the cycle — descent just stops.
- Mutually exclusive with `rejectCircularRefs` on one call (CTA-lane compile
  error if both are set).

## Scenarios where this is valid

- Values from cycle-capable sources: YAML anchors/aliases, `structuredClone` /
  IndexedDB, superjson / devalue / flatted payloads, MessagePack-with-refs.
- In-memory graphs at trusted boundaries: ORM entities with bidirectional
  relations, doubly-linked structures, state machines whose transitions point
  back at states, reactive state trees where the framework added parent
  pointers.

**Counter-argument (the demand question):** all of these are in-memory values,
typically produced by typed code or by a deserializer that already enforced a
schema. The untrusted-wire case — the library's core use case — can never
deliver a cycle (JSON/binary cannot encode one). So the option would serve a
narrow trusted-boundary niche. This is why the spec is parked.

## Why `rejectCircularRefs` stays on validate/verr regardless

Support mode is ADDITIVE, not a replacement:

1. Reject enforces the documented serializable-data contract — "contains a
   cycle" ⇒ "not valid data" is the correct verdict for the RPC/persistence
   framing, and verr says why.
2. Armed-reject validate agrees with the armed encoders (`isX(v) === false`
   exactly when `encodeX(v)` would throw), so validate stays usable as a
   pre-flight. Support-only semantics would make `isX(v) === true` for a value
   the encoder then throws on.
3. Reject turns an accidental cycle (easy to create with reactive frameworks)
   into a clean `false` / diagnosable error instead of the unarmed validator's
   stack-overflow `RangeError`.

## Design sketch (what makes this the expensive variant)

`rejectCircularRefs` was cheap because it is a ROOT PROLOGUE: one
`rt::findCycle(v, skeleton)` pre-walk call prepended to the armed root entry;
child `val_` entries stay byte-identical to the plain variant and shared.
Support mode cannot be a prologue — "stop here and treat as valid" is a
decision made DURING the real validation descent:

- **Tracked-node child entries fork** into stack-aware variants: signature
  `(v, cyS)`, entry check `if (cyS.indexOf(v) !== -1) return true`, push/pop
  around the body. This breaks the current "variants only change the root
  body; children are always plain" invariant
  ([typefunctions/module.go](../../ts-go-runtypes/internal/cachegen/typefunctions/module.go)
  `collectFamilyDemand` / `renderEntry`) — the main new machinery.
- **Skeleton reuse:** `BuildCircularSkeleton`
  ([circular_skeleton.go](../../ts-go-runtypes/internal/cachegen/typefunctions/circular_skeleton.go))
  already computes the tracked-node set; only entries for types on cycle paths
  fork — everything acyclic stays shared with the plain variant.
- **Semantics:** assume-true-on-re-entry is coinductive (greatest fixpoint —
  "the cycle is valid if no finite violation exists"; same discipline
  TypeScript's checker uses for recursive type relations). The re-entry memo
  must key per (value, tracked node), NOT per value — the same value can be
  validated at different type nodes, and union arm-trying re-encounters values
  mid-trial. Wants fuzz coverage (test/fuzz harness), not just example tests.
- **Per-call state:** the root allocates the descent stack and threads it down
  (the re-entrancy lesson from `rt::findCycle` — never closure-shared).
  Cross-family `val_` refs from union decoders keep calling arity-1 (no stack):
  the decode path can never see a cycle, so the plain entries stay correct
  there.
- **Axis plumbing** (mechanical; rails exist from the reject change): an `~S`
  canonical suffix + `CircularGuarded`-style flag scoped to val/verr, generated
  `S` variant tokens in `fnHashes.generated.ts`, forced non-noop for cyclable
  types, session-rendered like the armed-reject entries, mode-parity coverage.
- **Scanner:** `extractRejectCircularOption` grows a sibling for
  `supportCircularRefs` + the mutual-exclusion diagnostic.

## Costs

Meaningfully bigger than the reject feature's emitter half (child-entry
forking is new machinery), smaller than the whole reject PR (fnHash, scanner,
skeleton, per-call-state patterns all exist). Cyclable types used in several
modes multiply entries (plain / reject / support are three distinct fnHash
keys).

## Open questions

- Is there a real consumer? (Go/no-go. Parked until yes.)
- Greatest-fixpoint acceptance on unions: is assume-true-on-re-entry ever
  observably wrong for a case a user would care about? Needs a worked
  adversarial example or a fuzzer verdict before the semantics are frozen.
- Signature of forked children: `(v, cyS)` with the root allocating, or a
  defensive `cyS || (cyS = [])` default so an arity-1 call can never recurse
  unbounded even on an impossible path?
- Does `inlineMode` child inlining interact with the forked entries (the
  inlined body must carry the stack check too)?
