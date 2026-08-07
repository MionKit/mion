# JSON Schema — what it cost, measured

**Status: decision support.** This is not a design document. It answers one question with numbers: what did adopting JSON Schema actually cost us in code, binary size, runtime speed and correctness, and how much of that we would have paid anyway.

Measured on 2026-08-07 against the tree at `0a7317c`.

## Method, and why the baseline is where it is

JSON Schema landed twice. A first-class authoring form shipped, was reverted at `872c8302` (2026-07-31), and an extended version was re-applied at `c4b02e37` (2026-08-02). The honest baseline is therefore **not** the first JSON Schema commit but the clean post-revert tree:

| | Commit | Date |
| --- | --- | --- |
| BASE | `10145c36` — the last commit before the re-apply | 2026-08-01 |
| HEAD | `0a7317c` | 2026-08-07 |

BASE carries zero JSON Schema source (verified: no matching path in the tree apart from one unrelated `docs/done/` filename). The window is **83 commits, 380 files, +40,301 / -974 lines**.

Every commit in the window was assigned to a bucket, and each file's net line delta was attributed to whichever bucket contributed most of its added lines. The single squashed re-apply commit was split by path instead. The buckets reconcile exactly to the 40,301 total, so nothing is hand-waved into or out of the count.

The four buckets:

- **JSON Schema proper** — the translation layer, the conformance lane, keyword semantics, and the JSON-Schema-specific docs, benchmarks, website and e2e material. Dies with the feature.
- **Formats core** — structural brands, the shared format machinery, mocking support. **We would have built this anyway for type formats**, so it is excluded from the cost below.
- **Formats spec tail** — named format implementations carried to spec depth: IDNA host names, RFC 5321 email, strict IPv4/IPv6, RFC 3339 time, regex. These live in the formats tree but exist at this depth *because the JSON Schema `format` vocabulary names them*.
- **Unrelated** — work that happened to land in the same window.

## 1. Code size

Total tracked code (`.go`, `.ts`, `.mjs`, `.js`, `.vue`, excluding `third_party/`):

**240,527 → 270,688 lines (+30,161, +12.5%)**

Attribution of the +40,301 added lines:

| Bucket | Added | Share |
| --- | ---: | ---: |
| JSON Schema proper | +30,988 | 76.9% |
| Formats core (would have built anyway) | +5,265 | 13.1% |
| Formats spec tail | +2,489 | 6.2% |
| Unrelated to JSON Schema | +1,559 | 3.9% |

**Avoidable cost = 33,477 lines (83%)** — JSON Schema proper plus the spec tail. The "we needed it anyway" concession accounts for 13% of the window, not the bulk of it.

Where the JSON Schema proper bucket actually went:

| Kind | Added |
| --- | ---: |
| Tests | +14,894 |
| Docs (specs, reconciliations, investigation) | +4,571 |
| Shipped Go source | +3,190 |
| Benchmarks | +2,857 |
| Shipped JS source | +2,844 |
| Scripts | +678 |
| Website / e2e / examples | +498 |

**Shipped source is +6,034 lines.** The other 25,000 are tests, docs, benchmark scaffolding and tooling. That ratio is the real story: the feature is small, the *obligation* around it is large. Conformance to a published standard means a conformance lane, a divergence ledger, spec-corpus fixtures and a triage script, and all of it has to keep working forever.

### The Go side did not stay out of it

The investigation README records "**Zero Go-side changes** — held as designed for the translation itself." That premise did not survive:

| Window | Go source delta |
| --- | ---: |
| BASE → re-apply (`c4b02e37`) | +2,651 / -62 |
| re-apply → HEAD | +3,025 / -294 |

The extension phase added *more* Go than the original rollout did. Tracing the largest files, every commit that touched `tuplemerge.go` and both `intersection_collapse.go` files is a JSON Schema commit — that machinery exists to fold `allOf` and the `unevaluated*` evaluated-set semantics into the type model. `validate.go` (+491) and `unknownkeys_shared.go` (+117) are likewise entirely JSON-Schema-driven.

This is the clearest evidence for the concern that prompted this report: the standard did not stay in a translation layer at the edge. It reached into the compiler's type-identity and collapse machinery, which every user pays for whether or not they ever write a schema.

## 2. Binary size

Built at both commits with identical `-ldflags`, the same tsgolint pin (`5a37e89`), same version, same Go 1.26.0 toolchain.

| | Bytes | |
| --- | ---: | --- |
| BASE | 32,175,910 | |
| HEAD | 32,493,523 | **+317,613 (+0.99%)** |

**Binary size is not an argument against JSON Schema.** The resolver is dominated by the vendored tsgo checker, so a 1% total change is close to noise.

The honest framing is narrower. Symbol bytes belonging to our own `internal/` packages:

**1,459,899 → 1,596,145 bytes (+136,246, +9.3%)**

and `.text` (machine code) grew +145,216 bytes (+1.9%). Our share of the binary grew nearly ten times faster than the binary did.

## 3. Runtime performance

Quick mode (`--quick`, 20 ms samples) across the shared cases present in both trees (266 of them; HEAD adds 11 JSON Schema cases with no BASE counterpart):

| Metric | geomean HEAD/BASE |
| --- | ---: |
| `validate` (accept/sec) | 0.9915 |
| `validationErrors` (accept/sec) | 0.9614 |

Flat overall. But quick mode's 20 ms window is too noisy to trust per-case, and it showed alarming outliers (some datetime cases at 0.04x). Those were re-measured properly.

**Re-run at 300 ms, with `ATOMIC` as an untouched control group:**

| Group | geomean | slower >10% | faster >10% |
| --- | ---: | ---: | ---: |
| `ATOMIC` (control) | 1.02 | 0 / 52 | 4 |
| `DATETIME` | 1.05 | 4 / 88 | 28 |
| `STRING_FORMAT` | 1.03 | **21 / 94** | 26 |

The control group is clean, which validates the harness. The dramatic datetime drops were quick-mode noise. **The string-format regressions are real.**

**Confirmed at 1,000 ms samples** (accept/sec unless noted):

| Case | BASE | HEAD | Change |
| --- | ---: | ---: | --- |
| `string_minLength` · validate | 48.75M | 29.11M | **1.67× slower** |
| `string_minLength` · validationErrors | 41.92M | 25.20M | 1.66× slower |
| `ipv6` · validate | 6.57M | 3.20M | **2.05× slower** |
| `ipv6` · validate (reject path) | 14.61M | 3.79M | **3.86× slower** |
| `ipv6` · validationErrors | 6.30M | 3.32M | 1.90× slower |
| `time_HHmmss` · validate | 8.89M | 6.46M | 1.38× slower |
| `time_HHmmss_ms` · validate | 6.07M | 4.23M | 1.44× slower |

These trace to the spec-conformance commits: strict IPv4/IPv6 parsing, RFC 3339 time, and spec semantics for length bounds and `pattern`.

The one that should sting is **`string_minLength`**. A minimum-length check on a string is the most ordinary constraint in the library, it has nothing to do with JSON Schema, and it now runs at 60% of its former speed for every user, because the bound keywords were re-specified to match the standard's semantics.

## 4. Correctness

Shared-case coverage from the same benchmark run:

| | Cases | ok | fail | not supported |
| --- | ---: | ---: | ---: | ---: |
| BASE | 266 | 263 | **0** | 3 |
| HEAD | 277 | 273 | **1** | 3 |

The single failure is in the JSON Schema lane itself:

```
ts-runtypes / JSON_SCHEMA.string_email [validate]:          fail — invalid[1] accepted
ts-runtypes / JSON_SCHEMA.string_email [validationErrors]:  fail — invalid[1] accepted
```

`invalid[1]` is `'missing@tld'`. The case requires a dotted TLD, and its comment records that this was verified against `addFormats(ajv, {mode: 'full'})` by running it. So `{type: 'string', format: 'email'}` through the schema door now accepts an address that both the native `Email` brand and AJV in full mode reject.

The likely cause is the move to RFC 5321 email semantics, which permits a bare TLD-less domain. Chasing letter-of-the-RFC correctness made the practical default worse, and the two doors into the same concept now disagree. **This is a live defect, not a known limitation** — it is not recorded in `docs/todos/`, and it needs a decision about which semantics `format: email` should map to before it can be fixed.

## 5. What the numbers say

Reading them together:

1. **The feature is cheap; the standard is expensive.** 6,034 lines of shipped source against roughly 25,000 lines of tests, docs, benchmarks and tooling. Conformance to somebody else's published spec is a permanent obligation, and it is most of the bill.
2. **It did not stay at the edge.** The design premise was that translation is a JS-side concern with zero Go changes. In practice `allOf`, `unevaluated*` and `additionalProperties` scoping pushed into type-identity, tuple merging and intersection collapse, and the extension phase added more Go than the rollout did.
3. **Everyone pays, not just schema users.** The measured slowdowns are on shared paths. `string_minLength` at 0.60× is the clearest case: an ordinary constraint got slower to satisfy a standard most users of that constraint are not using.
4. **The spec pulled a real bug into a non-spec path.** The `format: email` divergence is exactly the failure mode of adapting to an external standard: two doors to one concept, drifting apart under pressure to match a document rather than to be right.
5. **Binary size is a non-issue.** It should not appear in the argument either way.

What this does *not* say: the work is not low quality, and none of the above argues the feature is broken. Conformance genuinely improved, the fuzz and official-suite lanes are real assets, and the formats core (13% of the window) is reusable regardless of what happens next. The question this report supports is narrower and worth stating plainly: whether **83% of a 40,000-line window, a permanent conformance obligation, measurable slowdowns on shared paths, and pressure on the compiler's type-identity machinery** is a price worth paying for adoption — and whether the standard should be allowed to keep reaching inward, or be held behind a boundary that the core cannot feel.

## Caveats

- Benchmarks ran on a 4-core cloud container. Absolute throughput is not comparable to the published numbers; only the BASE/HEAD ratios measured in the same environment are meaningful, and only the 300 ms / 1,000 ms figures are quoted as findings.
- `typia` was excluded from both runs (its native plugin could not pre-compile in this environment). It is a competitor column, so it does not affect the BASE/HEAD comparison.
- The `zod` lane reports failures in both trees; that is the pre-existing issue tracked in [zod-bench-lane-permanently-reports-failed.md](../../todos/zod-bench-lane-permanently-reports-failed.md), unrelated to this window.
- Bucket attribution is per-file, by dominant contributing commit. Files touched by several buckets land wholly in one. The totals reconcile exactly, but individual file placement is a judgement call.
