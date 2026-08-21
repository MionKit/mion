# Fn-key contract: kill the dead constants, make marker ↔ destructure one source of truth

**Status:** done — shipped in PR #128
**Type:** fix
**Spec:** full-plan
**Created:** 2026-07-27

Surfaced by PR #128 review comments
[r3634351431](https://github.com/MionKit/mion/pull/128#discussion_r3634351431) and
[r3634352805](https://github.com/MionKit/mion/pull/128#discussion_r3634352805): *"all this
constants that reference jit function ids should be gone from here and use whatever is there in
ts-runtypes."*

## Problem

Three separate things were conflated under "fn id constants". Only one is a real defect, and it is
worse than a duplicate — it is an **unenforced contract**.

### 1. `JIT_FUNCTION_IDS` is already correct — no action

`packages/core/src/constants.ts:92` is **already derived**, not hardcoded: every entry is a
`getFnHash('val')` / `getFnHash('verr')` … call, and the header comment at `:82` states it
explicitly (*"DERIVED from @ts-runtypes' `getFnHash` (no hardcoding)"*). Nothing to do.

### 2. `MION_FN_KEYS` / `MION_HEADER_FN_KEYS` have ZERO functional readers

`packages/core/src/runtypes/mionAdapter.ts:38,41` declare and export both constants. A repo-wide
grep finds **no code that reads either one** — only two prose mentions
(`mionAdapter.ts:143`, `router/src/lib/handlers.ts:29`).

The contract they appear to enforce is actually held by two hand-written, unconnected places:

- **the marker spelling** in `packages/router/src/lib/handlers.ts` —
  `InjectTypeFnArgs<T, 'val', 'verr', 'pj', 'rj', 'sj', …>` (must be spelled literally; a type
  alias over the marker is not recognised by the ts-runtypes scanner)
- **the positional destructure** in `packages/core/src/runtypes/mionAdapter.ts:152` —
  `const [valT, verrT, pjT, rjT, sjT, hukT, ukeT, tbT, fbT] = injected;`
  and `:321` — `const [valT, verrT] = injected;`

They are kept in sync by a comment — **and that comment has already drifted**: `handlers.ts:29`
lists seven keys (`val, verr, pj, rj, sj, huk, uke`) while `MION_FN_KEYS` lists nine (`+ tb, fb`).
Add a key to the marker without editing the destructure and the payload silently misaligns: every
fn shifts one slot, so `prepareForJson` gets called where `restoreFromJson` was meant. No test
catches it, because the arrays still have entries at every index.

### 3. Upstream DOES export the fn ids (the review comment was right)

`@ts-runtypes/core` 0.11.0 root-exports **`FnHashKey = keyof typeof FN_HASHES`**, verified by
compile probe — a bogus key fails with:

```
Type '"notAFnId"' is not assignable to type '"ces" | "cj" | "cjr" | "fb" | "fmt" | "huk"
 | "jsonDecoder" | "jsonEncoder" | "pj" | "pjs" | "rj" | "sj" | "tb" | "uke" | "ukuw" | "val" | "verr"'
```

So key *validity* can come from upstream today, with no upstream change. Note the `FN_HASHES`
const itself is **not** root-exported (unlike `runTypeKind.generated` and `typeFormats.generated`),
so runtime enumeration is unavailable — not needed here.

## Plan

The reviewer's framing ("why access by index at all — we want a dictionary") is the right one. The
injected payload arrives from the resolver as a positional array, so *something* must map position
→ key; the fix is to make that mapping the single source of truth instead of a comment.

1. **`packages/core/src/runtypes/mionAdapter.ts:38,41`** — keep the two key lists but bind them to
   upstream and make them load-bearing:
   ```ts
   export const MION_FN_KEYS = ['val','verr','pj','rj','sj','huk','uke','tb','fb'] as const satisfies readonly FnHashKey[];
   ```
   `satisfies` (not `:`) preserves the literal tuple type while still rejecting a non-existent key.
   Import `FnHashKey` as a type from `@ts-runtypes/core`.
2. **Replace both positional destructures** (`:152`, `:321`) with a keyed projection driven by the
   constant, e.g. `Object.fromEntries(MION_FN_KEYS.map((k, i) => [k, injected[i]]))` typed as
   `Partial<Record<(typeof MION_FN_KEYS)[number], unknown>>`, then read `byKey.val`, `byKey.verr` …
   Adding a key to the constant then automatically extends the projection, and the existing
   fail-closed check (`val/verr/pj/rj/sj` required, `:156`) keeps working on named fields.
3. **`packages/router/src/lib/handlers.ts:29`** — rewrite the comment to stop restating the key
   list (that is what drifted). Point at `MION_FN_KEYS` as the authority and keep only the
   non-obvious warning: the marker must be spelled literally.
4. Consider asserting the marker/constant relationship at build time if cheap; if not, the drifted
   comment being removed is already the main win.

## Tests

`packages/core/src/runtypes/mionAdapter.spec.ts`:

- **Ordering pin** — build a marker payload whose entries are distinguishable, run it through
  `buildJitFnsFromMarker`, and assert each key maps to its own entry (not just that nine came
  back). This is the test that would have caught a shifted destructure.
- **Partial payload still fails closed** — keep/extend the existing assertion that a short array
  throws rather than silently disabling validation.
- **Header side** — same for `MION_HEADER_FN_KEYS` via the two-key path at `:321`.
- The `satisfies` binding needs no runtime test; it is a compile-time guarantee (`pnpm run lint`
  runs the typecheck).

## Out of scope

- `JIT_FUNCTION_IDS` — already derived (see above).
- Asking upstream to root-export the `FN_HASHES` const. mion does not need runtime enumeration;
  file separately if the generated-module export asymmetry is worth fixing for its own sake.

## Done when

- Neither `MION_FN_KEYS` nor `MION_HEADER_FN_KEYS` is dead: both are read by the projection.
- Neither positional destructure remains.
- A bogus fn key fails `tsc` rather than at runtime (see the correction below).
- No comment restates the key list.
- Full suite + lint + format green.

## What shipped

- Both key lists are now `as const satisfies readonly FnHashKey[]`, bound to upstream's fn-id union.
- `byFnKey(injected, keys)` projects the positional payload onto its keys; both destructures
  (`:152`, `:321`) are gone, so the key lists are load-bearing instead of decorative.
- `handlers.ts` no longer restates the key list — that restatement is what had drifted.

### ⚠️ Correction to this spec's own claim

The "Done when" bar originally said a bogus key would fail `pnpm run lint`. **It does not.**
Verified by negative control: with `'notAFnId'` in `MION_FN_KEYS`, `pnpm exec eslint src` reports
**0 errors** — eslint reports rule violations, not TypeScript compile errors. The guard only bites
under `tsc`:

```
src/runtypes/mionAdapter.ts(39,37): error TS2322: Type '"notAFnId"' is not assignable to type
  '"ces" | "cj" | "cjr" | "fb" | "fmt" | "huk" | "jsonDecoder" | ... | "val" | "verr"'
```

At the time this was written mion had **no green tsc gate**, so the binding was real but only caught
a mistake when someone ran `tsc` by hand. That gate now exists: `pnpm run check-types-examples` runs
in CI and typechecks the `@mionjs/*` source alongside the examples (see
[examples-precompile-debt.md](examples-precompile-debt.md)).
