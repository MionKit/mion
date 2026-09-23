---
type: chore
spec: full-plan
status: done
created: 2026-09-23
---

# Remove `createParseFn` and the parse function family

## Problem

`createParseFn<T>()` restores a `JSON.parse` output and validates it in one call, throwing `RTParseError`. It shipped for two reasons:

1. Be faster than a decoder plus a validator. It is not: the Go emitter just chains the existing restore and validate functions, and a real single-walk version would need a large refactor.
2. Ease a move from zod (`schema.parse(x)`). A same-named function does not make that move realistic; an AI rewrite of the call sites does it better.

So it is extra public API, a Go family, a CLI flag, a plugin option and a pile of tests for no gain. Remove all of it. Users call a decoder, then a validator:

    const decode = createJsonDecoderFn<User>();
    const isUser = createValidateFn<User>();
    const user = decode(body); if (!isUser(user)) throw ...

This is a breaking public API removal: commit it as `refactor!:` (or with a `BREAKING CHANGE:` footer) so git-cliff lists it in the changelog.

## Plan

Land Go and JS together: the JS side passes `--parse-strategy` to the binary, and four JS files are generated from the Go registry.

### 1. Go resolver (`ts-go-runtypes/`)

- Delete `internal/cachegen/typefunctions/parse.go` (whole file). It only chains `ukuw` / `rj` / `val` / `vst`; every helper it calls is shared and stays (`jsonWireSupports`, `isNoopForRestoreJson`, `ctx.registerRTLookup`).
- `internal/cachegen/typefunctions/families.go:70-74`: delete the three `parse*` rows. `families_test.go:14-20`: count 25 → 22, drop the comment.
- `internal/cachegen/operations/operations.go:79-89`: delete the `parse` / `parseStrip` / `parseFail` rows (`prs`, `prss`, `prsf`); fix the comment at `:125`. fnHashes are not positional (`QuickHash("op|"+name)`), so no other hash or typeID moves.
- `operations/fnhash_test.go`: drop the `+3` at `:26-31`, delete `"prs": "parse"` at `:229` and `"prs"` from the retired-tag list.
- `internal/compiler/resolver/scan.go`: delete the `op.Name == "parse"` block (`:981-993`) and `parseStrategyOperation` (`:1262-1285`); drop the `defaultParseStrategy` parameter of `computeSiteFn` (`:963`) and its two callers (`:776`, `:875`); fix comments at `:995` and `:1294`. KEEP `extractStrategyOption` (json strategy routing uses it).
- `resolver.go:128-129, 148-153`: delete `Options.ParseDefaults` and the `ParseDefaults` type.
- `internal/constants/constants.go:62-77`: delete the three `CacheModules` entries; `:246-256`: delete the `ParseStrategy*` consts.
- `cmd/mion/main.go`: delete `--parse-strategy` (usage `:68`, field `:152`, flag `:201-202`, copy `:332`, check `:361-366`, `ParseDefaults` `:465`). `buildconfig.go:36, 61, 93, 164-167` and `config.go:139-141, 193-204`: delete the `parse` tsconfig key and its type.
- Tests: delete `resolver/parse_test.go`. Before deleting `resolver/parse_strategy_default_test.go`, move its `wantParseFnId` helper (`:24-31`) into `json_value_strategy_test.go` under a neutral name (it is called at `:108`), and fix that file's comments at `:10`, `:94`.
- KEEP: `apigen.go` `parserStrategies` / `parseModes` (router body parser, unrelated), `AxisJsonStrategy`, `ValidateDefaults`, the strip / unknown-key emitters.

### 2. Regenerate the Go mirrors (never hand-edit)

`pnpm miondevx core codegen constants fnhashes fncatalog pluginkeys` rewrites:
- `packages/run-types/src/go-generated/fnHashes.generated.ts`
- `packages/core/src/go-generated/jitFunctionIds.generated.ts`
- `packages/devtools/src/core/go-generated/runtypes-constants.generated.ts`
- `packages/devtools/src/core/go-generated/tsconfig-plugin-keys.generated.ts`
- `container/website/app/components/content/go-generated/functions-catalog.json` (drops the three rows from the docs catalog table)

Then `pnpm miondevx core codegen all --check` must be clean.

### 3. `packages/run-types/src`

- `createRTFunctions.ts`: delete `ParseRestoreFn` / `ParseFn` / `ParseStrategy` / `ParseOptions` (`:283-311`, keep `JsonDecoderFn` above), the whole `createParseFn` block incl. `messageOf` and `parseNoPluginFallback` (`:603-695`), the `RTFunctionByKey` rows `parse*` (`:722-725`), the import at `:8` and the now-unused `entryTupleAt` import at `:7`. Rewrite the `createRestoreFromJsonFn` doc at `:491-493` so it no longer points to parse.
- Delete `runtypes/parseError.ts` (whole file: `RTParseError`, `ParseMismatch`, `RTSerializationError`, `isSerializationError`, `parseErrorMessage`, all parse-only).
- `runtypes/rtUtils.ts`: delete the import at `:30` and `parseMismatch()` at `:199-203`.
- `runtypes/entryTuple.ts`: delete `parseArgs` / `parseDefaults` / `parseShaped` (`:370-379`) and the `familyMeta` rows `prs` / `prsf` / `prss` (`:413-415`), in the same commit as the regenerated `FAMILY_TAG_TO_FN_KEY` (`test/features/familyMetaCoverage.test.ts` checks they agree).
- `runtypes/dataView.ts:25-26`: rewrite the `BinaryDecodeError` doc line.
- `index.ts:153-157, 250-251`: delete the parse exports.
- Fix the stray wording in `createRTFunctions.ts:227, 267` and the `RTSerializationError` mention in `packages/router/src/dispatch.ts:265` (comment only).

### 4. `packages/devtools`

- `src/core/unplugin.ts:107-110, 358`: delete the `parse` option and its forwarding.
- `src/core/resolver-client.ts:48-50, 510`: delete `parseStrategy` and the `--parse-strategy` push.
- `src/core/plugin-option-keys.ts:16`: delete `parse: true`.
- Update `test/__snapshots__/cli-surface.test.ts.snap` (`--parse-strategy` help text) after the Go flag is gone (`test/runtype-diagnostics.test.ts` had no parse case).
- Rebuild the devtools dist after the edit (consumers and lint read it).

### 5. Examples

`packages/examples/src/guide/all-factories.ts`: delete the import (`:8`), the comment and three `parseUser*` consts (`:46-49`, inside the shown region), and the three names in the export list (`:93-94, 103`).

## Tests

Delete the parse-only tests: `test/suites/parse/` (whole dir) and `test/features/parse.test.ts`.

In the mixed files, drop the parse cases where the decoder cases in the same file already cover the input, and rewrite the rest as decoder + validator. Parse's "junk only ever throws `RTParseError`" promises have no two-step twin (decoders throw raw errors by design): drop those assertions, do not port them.

| File (`packages/run-types/test/`) | Change |
|---|---|
| `features/generatedCodeAudit.test.ts` | drop `:20, :106, :212` (strip decoder at `:210-211` covers the round trip) |
| `features/jsonDecodeArrayGuard.test.ts` | drop `:38, :56-58`, fix import `:11` |
| `features/jsonDecodeBadContent.test.ts` | drop the totality tests `:97-105, :132, :157-167`, the parse assert at `:148`, `:90` (covered by `:91`); fix imports and header `:10-25` |
| `features/jsonDecodeWireForm.test.ts` | drop `:34, :60`; rewrite `:97-104` to `decoders[1](JSON.stringify(valid))`; fix `:4-15` |
| `features/prototypeKeys.test.ts` | drop `:69-70, :80-92, :102, :165, :369`; `:111` → `decodeBag('{"a":1}')`; fix imports |
| `features/stripInsideMapSet.test.ts` | drop `:43-48`, fix import |
| `features/transformIsolation.test.ts` | drop `:34, :38`; remove "parse" from header and titles |
| `features/unionEnvelopeIndex.test.ts` | drop `:15, :35-45`, fix import |
| `fuzz/security/securityHarness.ts`, `jsonDecodeRunner.ts` | remove the `parse` fixture, field and wiring (the `verr` compile only existed for parse) |
| `fuzz/security/securityOracle.ts`, `securityOracle.unit.test.ts` | remove the SJ-PARSE oracle and its tests, and the parse arm of SJ-REJECT; SJ-REJECT / SJ-PROTO / SJ-TOTAL stay on the decoders. `checkJsonDecode` no longer takes the re-parsed `tree` (only parse read it) |
| `fuzz/value/fuzzOracle.ts`, `fuzzRunner.ts`, `fuzz.integration.test.ts` | remove oracles O19 and O20, the 12 `parse:` lines, and `restoreFromJsonMutate` (only O19 read it) with its pin test; keep the other ids unchanged, O5 still covers the JSON round trip |
| `fuzz/security/jsonDecodeFuzz.integration.test.ts`, `attackDictionary.ts`, `treeMutations.ts` | comment and title wording only |

No new tests: this removes a feature. The guard is that `grep -rniE "createParseFn|RTParseError|ParseMismatch|parseStrategy|parse-strategy|'prs'|prsf|prss"` over `packages/ ts-go-runtypes/{cmd,internal} container/website` returns nothing, and every suite below passes.

## Docs

- Website: no page or section is about parse. Two things change on `container/website/content/02.runtypes/02.guide/11.all-compiled-functions.md` without editing its text: the `all-factories.ts` code-import loses the parse lines, and the regenerated `functions-catalog.json` drops the three rows. Check the rendered page.
- `packages/run-types/test/fuzz/README.md`: remove parse from `:387, :406, :453`, delete the SJ-PARSE paragraph (`:462-464`) and oracle row (`:705`), fix `:682` ("JSON decoders + parse") and the SJ-REJECT row; update the oracle ranges at `:56, :168` for the removed O19 / O20. Leave `GC-PARSE` and "parse-safety" (unrelated).
- Leave `docs/done/*` alone (history). Leave the zod `.parse` mentions on the about and benchmark pages (they are zod's own API).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- A new faster single-walk "restore and check" function.
- A zod migration guide or tool.
- The router's `parser` body strategies (`PARSE_MODES`, `apigen.go` `parseModes`): same word, different feature, keep.
- Renumbering the fuzz oracle ids.

## Done when

- The grep above is empty and `createParseFn` is gone from the public exports.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run check-format` and `pnpm miondevx core codegen all --check` all pass.
- The all-compiled-functions page renders with no parse rows.
- PR labelled `pre-publish-e2e` (public API removal) and `website` (example and catalog changed).
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## What shipped

Everything above, plus one related fix: `pnpm miondevx core codegen` used to run only the FIRST target it was given and silently skip the rest, so step 2's four-target command regenerated one file. It now runs every named target and refuses an unknown one, pinned in `packages/devtools/test/devx-registry.test.ts`.
