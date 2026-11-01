---
type: fix
spec: guidelines
status: ready
created: 2026-10-31
---

# String formats accept values their format forbids

## Intent

Found by the benchmark fairness review (mion reference sheet for the STRING_FORMAT cases). Three string formats
in `@mionjs/run-types` accept values the format name promises to reject. This is a correctness bug, and it also
makes mion do slightly less work than competitors that check the full format.

1. **Date parts checked with `Number()`, not as digits.**
   `packages/run-types/src/formats/datetime/dateTime-pure-fns.ts:43-52` checks only each part's LENGTH and
   `Number(part)`, so `'0x1F-01-01'`, `'1e03-01-01'`, `'2024-+1-01'`, `'2024- 1-01'`, `'2024-01-1.'` pass as
   `YYYY-MM-DD`. Hits every date / dateTime format (ISO, DMY, YM, MD, min/max, custom).
2. **UUIDv4 / UUIDv7 skip the variant character.** `string-formats-pure-fns.ts:29-46` (`_isUUID`) checks
   dashes, version char and hex only; char 19 may be any hex. Its own comment says it matches the canonical
   patterns, which require `[89ab]` there.
3. **IP with port accepts a missing port.** `string-formats-pure-fns.ts:494` (`if (portS && …)`) lets
   `'1.2.3.4:'` and `'1.2.3.4'` pass `IPv4WithPort`; the IPv6 port regexp (`:501`) also makes the port optional.
   IPv4 also accepts leading zeros (`[01]?\d\d?`): decide whether that is intended.

## Direction

- Digits-only parts (no `Number()` leniency), the UUID variant nibble, and a required port. Keep the fast paths.
- Add the bad values above as invalid samples in the run-types format test suites
  (`packages/run-types/test/suites/format-validation/StringFormat.ts`, DateTime) and mirror them into the bench
  copies under `container/benchmarks/shared/cases/format-validation/` so every library is checked on them.
- Check the format docs page states the strict behavior. The implementer plans the details.

## Docs

`container/website/content/02.runtypes/` format page(s) for date, UUID and IP: existing sections, only if they
describe the accepted shapes (a sentence at most).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The listed bad values are rejected, tests pin them, the bench shared samples carry them.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.

## Plan: strict date parts, UUID variant, required port (approved 2026-11-01, automatic mode)

Delegated session, automatic mode: no human in the loop, decisions recorded here.

- **Dates**: `isDateString` reads each part as exactly N ASCII digits (charCode loop, no `Number()`).
  An empty part (`'2024-02-'`, `'-02-29'`) now fails: `undefined` means "the layout has no such part",
  `''` means "missing". Added per the parent session's follow-up message.
- **UUID**: pinned versions (`4`, `7`) check the variant character (index 19) is `[89abAB]`.
  `version: 'any'` stays layout-only so the Nil / Max UUIDs keep passing (JSON Schema `format: uuid`).
- **IP**: `allowPort` now REQUIRES a port (`'1.2.3.4'`, `'1.2.3.4:'`, `'[::1]'`, `'[::1]:'` fail with
  `errorType: 'port'`). IPv6 port gets the same digits check as IPv4.
- **Leading zeros (decided)**: rejected, in plain IPv4 and in an IPv6 embedded dotted quad.
  Ambiguous (some parsers read `010` as octal), and ajv, zod and typia reject them too.
- Mock fix: the IPv6 loopback mock with `allowPort` now carries a port.
- Pure-fn ids are content hashes: regenerated with `pnpm miondevx core codegen builtinpurefns`.
- Tests: bad values added to `StringFormat.ts` suite (date ISO / DMY / YM / MD, dateTime, UUID v4 / v7,
  IPv4, IPv6, both WithPort) with format-error expectations; missing-port `errorType` cases in
  `formatErrorType.test.ts`. Same values mirrored into the bench shared samples.
- Bench: TypeBox's hand-written IPv4 octet regex accepted leading zeros; tightened to match.
- Docs: `02.string.md` IP section states the no-leading-zeros rule and that `WithPort` requires a port.
  Date page and UUID line describe no accepted shape: unchanged.
