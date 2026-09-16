---
type: fix
spec: guidelines
status: ready
created: 2026-09-16
---

# On a union, the codecs and the strict validator answer the unknown-key question differently

## Intent

Every family that decides "is this key declared" agrees on every shape except one. On a UNION they
split into two readings, and the split is measured, reproducible and currently pinned as correct by
a test. Pinning it was the right first move, it stopped the behaviour drifting while the work
landed, but a pinned divergence is still a divergence, and this is exactly the class of thing the
serialization work set out to remove.

The two readings:

- **The pooled list.** Every codec collects the property names of ALL members into one list and
  keeps any key on it. It never validates, so it never learns which member the value matched.
  `hasUnknownKeys` and `unknownKeyErrors` read the same pooled list.
- **The matched branch.** `createValidateFn({checkUnknowns: true})` inherits validate's branch
  chain, so it asks whether the member that ACTUALLY matched declares the key.

Measured on a plain discriminated union:

```ts
type Cat = {kind: 'cat'; meows: boolean};
type Dog = {kind: 'dog'; barks: number};
type Pet = Cat | Dog;
```

| value | `hasUnknownKeys` | clone / direct / compact / strip / rjs | `validate({checkUnknowns: true})` |
| --- | --- | --- | --- |
| `{kind:'cat', meows:true, barks:3}` | `false` | keep `barks` | `false` |
| `{kind:'cat', meows:true, zzz:9}` | `true` | drop `zzz` | `false` |

The second row is fine: a key belonging to no member is undeclared everywhere and every stripping
road drops it. The first row is the problem. A cat carrying a dog's `barks` survives serialization
untouched, and the standalone check reports nothing wrong, while the strict validator refuses it.

The pinned tests are `keeps a key belonging to ANOTHER member of a union, the same answer
hasUnknownKeys gives` and `drops a key belonging to NO member of a union, on every road that strips`
in `packages/run-types/test/features/unknownKeyFamiliesAgree.test.ts`, plus `is STRICTER than
validate + hasUnknownKeys on a mixed-member value` in
`packages/run-types/test/features/checkUnknowns.test.ts`.

## Why it costs something

The branch reading looks like the more correct one. `{kind:'cat', meows:true, barks:3}` is not a
`Cat` and it is not a `Dog`, so calling `barks` declared is only true of a type nobody wrote.

But the branch reading is also the one the codecs cannot implement, and that is the whole knot:

- A codec never validates, by design. It has no matched member to ask. Making it ask would mean
  running validation inside every encoder and decoder, which is a different function with a
  different cost, and the split walk is why the compiled codecs are fast.
- So a consumer who wants the branch answer cannot get it from serialization at all. They must set
  `{checkUnknowns: true}` and validate, even on a road where a rebuilding encoder already dropped
  every key it could. The flag stops being an option and becomes mandatory on any union, which is a
  worse story than "encoding strips, validation checks".

Whoever picks this up should decide which of those two costs is the one worth paying, rather than
leaving two answers standing.

## Direction

Investigate first, then decide. The question is genuinely open and the answer should come from
measurement, not preference.

Things worth establishing before choosing:

- How far the pooled reading actually reaches. A discriminated union is the clearest case; check a
  union of object literals with no discriminant, a union where one member's key is optional, and a
  union nested inside an array or a tuple slot, since each could behave differently.
- What a branch-aware codec would cost. Sketch it: the encoder would need a member test before it
  picks the key list. For a discriminated union that test is one property compare, which may be
  cheap enough to change the answer entirely. For an undiscriminated one it is a full validate.
- Whether the answer can be made per-shape rather than global. "Branch-aware when the union has a
  readable discriminant, pooled otherwise" is a real option, and it would fix the case that actually
  shows up in application code while leaving the expensive case alone.
- What an index-signature member does under each option. A union carrying a record member declares
  every key, so it must keep every key whatever else is decided. That rule is settled and is not up
  for renegotiation here.

Candidate outcomes, in no order:

1. Teach the codecs the branch, at least where a discriminant makes it cheap. The divergence goes
   away and serialization gets stricter.
2. Keep the pooled reading everywhere and make `createValidateFn({checkUnknowns: true})` pooled too,
   so the whole library gives one answer. Cheaper, but it accepts a value no member matches.
3. Keep both, and document them as two different questions with two different names, so a consumer
   picks deliberately rather than by accident.

Option 2 and option 3 both need a hard look at what the strict validator promises today, since it is
the one family whose current answer would change.

## The second question: what `strictTypes` means in the router

The router builds its strict check from the pooled family, and it runs AFTER a separate validate
(`packages/router/src/dispatch.ts:307`):

```ts
function rejectUnknownKeysOrThrow(params: any[], executable: RemoteMethod): void {
  if (!executable.options.strictTypes) return;
  const hasUnknownKeys = executable.paramsJitFns.hasUnknownKeys;
  if (!hasUnknownKeys || hasUnknownKeys.isNoop) return;
  if (hasUnknownKeys.fn(params)) { /* throws */ }
}
```

So a `strictTypes` route today answers the two-step way: validate loosely, then check the pooled
list. On a union that accepts a value the library's own strict validator rejects. It also walks the
params twice, which is what the fused validator exists to avoid.

Decide which one `strictTypes` should mean, and say so in the route docs either way:

- **Two-step, as today.** Cheap to keep, and it matches what the codecs do, but a `strictTypes`
  route is then measurably looser than `createValidateFn({checkUnknowns: true})` on a union, which
  will surprise anyone who reads `strictTypes` as "strict".
- **The fused validator.** One walk instead of two, and the router's strictness matches the
  library's. It is a behaviour change for existing routes: a union param that passes today would
  start failing. Weigh that as a breaking change and check whether the compiled-function plumbing
  can select the fused family per route, since the adapter currently resolves the plain validator
  and the pooled check as separate entries.

Whichever way it goes, the router should use ONE family rather than composing two, or it keeps
paying for two walks to get an answer neither family gives on its own.

## Done when

The union case has one decided answer per family, written down with the reasoning; the pinned tests
say what was decided rather than merely what happens; `strictTypes` names which check it runs and
the router runs exactly that one; and if the two readings both survive on purpose, they have
different names and the docs say which question each one answers.
