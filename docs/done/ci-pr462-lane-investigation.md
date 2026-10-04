# PR #462: why the test lanes ran

PR #462 did not contain only comments. Its configuration, CI classifier, contract assertions, script messages and instruction-file paths changed too. CI successfully used token hashing. Ordinary comments were ignored; broad directive markers conservatively retained some comment prose. A separate instruction-path bug amplified the invalidation.

## Evidence pinned to the run

- [PR #462](https://github.com/MionKit/mion/pull/462): base `8bf5b19e9d40f84d168f9307d88700de244b7451`, head `7056f8fbfabae8a4473421f3223abc69d1b3e15d`.
- [CI run 37234802335](https://github.com/MionKit/mion/actions/runs/37234802335): checkout merge `c687eb07eac7cc2577447e4fb373387a82d32716`; its first parent is the base above. The merge and head have the same tree (`b7bd777bb1261e0610dbfcaa211febd217887087`).
- [Decide job 111531663063](https://github.com/MionKit/mion/actions/runs/37234802335/job/111531663063): at 21:07:38 UTC, cache **hit** and restore for `mion-code-digest-linux-x64-58e1738e82ad26986a3a4bdf9141fbd6`; at 21:07:40 and 21:07:43, `code files hash by their code (comments and blank lines ignored) in the tokens lanes`.
- The job passes `--base HEAD^1`. At 21:07:43 UTC it prints RUN for all seven default lanes, with `inputs not proven green yet` (smoke: both items unproven). No relevant green marker or equal-base hash suppressed them.
- Downloaded `lane-decision` artifact **11314793846**, SHA-256 `c0dba1563ebd9d7d54e6cb8563fa5d0089556a3422202e03504d1977f4de1dc6`, contains the exact hashes below. All seven were reproduced byte-for-byte from Git objects using the classifier in the PR head and one shared token-digest map for both trees. Artifact retention is one day; this report preserves its relevant values.
- [Go/fuzz job 111531748884](https://github.com/MionKit/mion/actions/runs/37234802335/job/111531748884) and [JS job 111531748899](https://github.com/MionKit/mion/actions/runs/37234802335/job/111531748899) completed successfully. Go tests, count-based JS fuzz, concurrent CLI race fuzz and time-boxed fuzz actually ran. JS static checks, contract tests, JS tests and the Bun suite actually ran; they were not merely jobs with misleading names.

## Base versus head

These are both computed with the PR head classifier, as CI does. A lane hashes ordered `effective-id path` records with SHA-256, truncated to 32 hex digits. Token lanes prepend `t`; whole-tool raw fallback would prepend `r`. Raw lanes have no prefix.

| Lane | Base hash | Tested head/merge hash | Effective changed paths |
| --- | --- | --- | ---: |
| go | `t695cc8377614ab789956b999b6d67e2c` | `t020addf07276bbd567535ed2073cf3ea` | 25 |
| js-fuzz | `ta88d9ffd329f6279b6f34bad66e7dbfa` | `t7e0d380f4c6ef0fe6adfca5ad706ae5d` | 57 |
| go-tools | `98ff423c1cc2eb5a694c7ae2bbb2ce1c` | `43fcf64f3b133ac6abe4c30e129a316f` | 119 |
| go-static | `66fad84e190eb2efece5ee5f4c7d73c8` | `4fe477d1a767d7910ec640a602e9070d` | 22 |
| js | `ta88d9ffd329f6279b6f34bad66e7dbfa` | `t7e0d380f4c6ef0fe6adfca5ad706ae5d` | 57 |
| js-static | `e1a4b778df35dbd519c30567e49a121b` | `0ca3240875aa9faa22bb00e5267414fa` | 106 |
| smoke | `t98007aaf355b7c7abd389296a5015846` | `t8a4e8d74b6c7b24fe94607d76879f1e7` | 51 |

Smoke item head hashes: website `t8c253fe2be90dec5f6d187f0ebaea9d4`; bench `t310477cd0d6205fd30e2d7f9b5e1f1d5`. Both items ran.

## What changed the hashes

1. **Shared raw configuration:** `package.json` changes the executable preinstall error message from CLAUDE.md to AGENTS.md; `.gitignore` adds Codex state exclusions. Both are REPO_CONFIG inputs of every lane, including Go. JSON and ignore files do not become comment-insensitive because a lane uses tokens. These two changes alone invalidate every lane under the declared policy.
2. **Base-only unknown input:** the PR replaces root `CLAUDE.md` with `AGENTS.md` in FEEDS_NOTHING. The base still has `CLAUDE.md`, so the head classifier calls that base path unclassified and adds it to **every** base hash. The head has no unknown paths, so the CLI prints no unknown-path warning. Thus even a pure root instruction rename could run everything. The classifier is intentionally shared across the two trees; preserving both instruction names fixes classification, rather than using different rules per tree.
3. **Scoped instructions:** root prefixes in FEEDS_NOTHING do not exclude nested files already matched by `packages/`, `ts-go-runtypes/` or `container/`. Renaming or editing scoped instruction Markdown changes those records, including the path component on a content-identical rename. The appendix names each affected file and lane.
4. **Executable and non-code JS inputs:** `scripts/ci/lanes.mjs` changes FEEDS_NOTHING; `scripts/ci/check-tree.mjs` changes a failure-message string; `packages/devtools/test/ci-lane-contracts.test.ts` changes assertions/test setup; `packages/devtools/test/repo-contracts.test.ts` changes tested filename strings. `.github/workflows/pre-publish.yml` and `publish.yml`, `scripts/setup-claude-web.sh`, `scripts/README.md` and `container/website/README.md` hash raw where selected. `container/pre-publish-e2e/build-all.mjs` is deliberately RAW_CODE even in token lanes, so its comment edit changes its blob identity.
5. **Conservative directive preservation:** 12 additional comment-only TS/JS edits change a token digest because a changed line contains `@` or `webpack`. This is the documented `directiveLines` rule, not a lexer failure or raw fallback. It retains the entire trimmed line, including prose.

Of the **78 changed token-eligible code files**, **62 kept identical digests**. All **15 changed Go files** kept identical token digests. The other 16 are the four executable edits in point 4 plus the 12 comments below. Every changed token-eligible file returned a digest; none returned the per-file `-` fallback. The code-digest source and tool version were unchanged.

| Comment-only file with a changed token digest | Retained marker in changed prose |
| --- | --- |
| `container/pre-publish-e2e/apps/mion-next/next.config.mjs` | `@mionjs/platform-vercel` |
| `container/pre-publish-e2e/host-smoke/src/main.ts` | `@mionjs/bin-compiler` |
| `container/pre-publish-e2e/mion-consumer/lint/eslint.config.mjs` | `@mionjs/devtools` |
| `packages/devtools/src/next/index.ts` | `webpack` |
| `packages/devtools/src/runtypes/next/index.ts` | `webpack` |
| `packages/devtools/test/next-broker.test.ts` | `webpack` |
| `packages/private-type-budget/test/modelPipeline.compile.test.ts` | `@typescript/analyze-trace` |
| `packages/rpc-router/test/typeOnlyImports.spec.ts` | `@mionjs/no-type-imports` |
| `packages/run-types/test/features/valueFirstRuntime.test.ts` | `@mionjs/run-types/formats` |
| `packages/run-types/test/fuzz/enrich/enrichModel.ts` | `@rtOrphanChild / @todo` |
| `packages/run-types/test/suites/value-first-define/index.ts` | `@mionjs/run-types/builders / formats` |
| `scripts/core/smoke.mjs` | `@mionjs/devtools` |

For the Go lane specifically, the only changed code-digest inputs are `typeOnlyImports.spec.ts`, `valueFirstRuntime.test.ts`, `enrichModel.ts` and `value-first-define/index.ts` above. All are comment prose retained by `@`. Its remaining triggers are the two shared configs, the root base-only unknown and scoped instruction files. None of the Go source comment changes triggered the token Go suite.

JS and JS-fuzz use identical path sets and hashes. They share all the changed token/raw inputs in the appendix. The JS job additionally invokes `core test-pr --base HEAD^1 --skip-passed`; its log at 21:11:45 UTC reports **227 changed paths** and selects the full suite because **28** are outside workspace packages. Git counts renamed instruction paths as deletion plus addition here. The global triggers start with the two workflow files, `.gitignore`, root `CLAUDE.md`, and container files. Result: **275 test files passed**, one skipped, **7759 tests passed**, 38 skipped; four Bun files reported tests. This second-stage selector does not strip comments.

## Which work can skip ordinary comments

- `go`, `js-fuzz`, `js`, and the container test/build token lanes can skip ordinary code comments when every effective input stays equal to the base or has an accepted green marker. Directives, JS JSDoc, fixture text, snapshots, generated sources and non-code configuration remain significant. Tests that read comments or line numbers must use raw inputs or live in the static checks.
- `go-static` is raw: gofmt and vet read comments/directives. `go-tools` is raw: generators copy comment text, and drift/build-gate checks inspect files. `js-static` is raw: formatting, lint, typecheck, docs checks and contracts read comments. `check-format:js` explicitly checks `packages/**/*.md`, so scoped instruction Markdown must continue to invalidate JS static checks.
- Whole-tree hygiene sweeps run in the always-on gate, independently of lane skips. Commit-message checking is independent too.

## Separate fix

The accompanying change recognizes root and scoped AGENTS.md and CLAUDE.md, keeps both names classified when reading the base, and excludes scoped instructions only from **token** lanes. It also classifies `.agents/` and `.codex/` alongside `.claude/`. Raw lanes retain scoped Markdown inputs for formatting and other readers. Unknown non-instruction files still fail safe.

The checker also stops treating scoped package names such as `@mionjs/devtools` and `@typescript/analyze-trace` as directives in ordinary comment prose. Actual imports remain code, JS JSDoc remains significant, and other `@` tags remain conservative inputs. Reserved tool namespaces are retained even beside slash arguments. The checker version advances from 2 to 3 with updated digest goldens; this rekeys the tool cache and green markers intentionally. A cache miss still hashes raw safely.

The source readers prove that `@mion-expect-error` is not the only semantic tag: `internal/compiler/resolver/expecterror.go` and `internal/diagnostics/expecterror.go` handle expectations and downgrades; `internal/compiler/routerrules/handlers.go` recognizes `@mion:route`, middleware and header tags; `internal/cachegen/runtype/typeid/typeid.go` reads `@nonEnumerable`; enrichment mirror readers consume `@rtType`, `@rtIds`, orphan tags and `@todo`. TypeScript and bundlers have their own directives. Ignoring every other `@` comment would hide those edits.

Regression coverage exercises root/package/Go/container/new scopes, additions and renames, token and raw fallback modes, every token lane and its items, unchanged-base decisions, raw static invalidation, and real configuration/fixture/unknown inputs. The lane contracts and independent TypeScript parser oracle pass **88 tests** together. The full Go code-digest package passes, including corpus/property tests, semantic-tag additions and expectation edits, package-prose skips, real package-import changes, mixed package/directive lines and versioned goldens. Source syntax, TypeScript formatting, gofmt, all eight whole-tree sweeps and Git whitespace checks pass.

Recomputing PR #462 with both fixes removes both trees' unknown instruction paths and makes **eight of the 12 comment-only digest changes equal**. The four retained comments are the three `webpack` prose files and `enrichModel.ts`'s enrichment-tag prose. **All 11 lane hashes still differ**: configuration, scripts, raw inputs and preserved directive prose remain. These fixes prevent instruction-only and scoped-package-prose test reruns; they do not justify skipping #462's tests. No changes were pushed to PR #462.

Matching semantic tag names and `webpack` anywhere in prose remains conservative. Narrowing those further requires syntax-aware directive/JSDoc and bundler coverage; simply dropping the markers would hide semantic comment edits. This fix removes the measured scoped-package false positives while preserving semantic tags.

## Exact effective changed-path inventory

Each row is an input record whose effective ID or presence differs between the base and tested tree under PR #462's classifier. Root AGENTS.md is absent from this table because it is ignored; root CLAUDE.md appears because it is unclassified in the base. Renames have two rows because the path is part of the hash. Changed files absent from this inventory have no effective hash change for any listed lane.

Lane codes: **G** go; **J** js and js-fuzz; **GT** go-tools; **GS** go-static; **S** js-static; **SM** smoke; **W** website; **B** bench; **E** e2e; **D** drizzle. Label-gated lane entries describe hash dependencies, not a claim that every label was enabled.

| Changed input record | Lanes | Hash treatment |
| --- | --- | --- |
| `.github/workflows/pre-publish.yml` | J, GT, S | raw |
| `.github/workflows/publish.yml` | J, GT, S | raw |
| `.gitignore` | G, J, GT, GS, S, SM, W, B, E, D | raw |
| `CLAUDE.md` | G, J, GT, GS, S, SM, W, B, E, D | unclassified |
| `container/pre-publish-e2e/apps/mion-next/next.config.mjs` | J, GT, S, E | raw + tokens |
| `container/pre-publish-e2e/apps/shared/src/minimal.ts` | GT, S | raw |
| `container/pre-publish-e2e/apps/shared/src/reflection.ts` | GT, S | raw |
| `container/pre-publish-e2e/apps/smoke-next/next.config.mjs` | GT, S | raw |
| `container/pre-publish-e2e/apps/smoke-source/src/entry.ts` | GT, S | raw |
| `container/pre-publish-e2e/apps/smoke-types-in-src/src/entry.ts` | GT, S | raw |
| `container/pre-publish-e2e/build-all.mjs` | J, GT, S, E | raw |
| `container/pre-publish-e2e/host-smoke/src/main.ts` | J, GT, S, E | raw + tokens |
| `container/pre-publish-e2e/mion-consumer/lint/eslint.config.mjs` | J, GT, S, E | raw + tokens |
| `container/website/AGENTS.md` | J, GT, S, SM, W | raw |
| `container/website/CLAUDE.md` | J, GT, S, SM, W | raw |
| `container/website/README.md` | J, GT, S, SM, W | raw |
| `package.json` | G, J, GT, GS, S, SM, W, B, E, D | raw |
| `packages/devtools/AGENTS.md` | J, GT, S, SM, W, B, E, D | raw |
| `packages/devtools/CLAUDE.md` | J, GT, S, SM, W, B, E, D | raw |
| `packages/devtools/src/lint/AGENTS.md` | J, GT, S, SM, W, B, E, D | raw |
| `packages/devtools/src/lint/CLAUDE.md` | J, GT, S, SM, W, B, E, D | raw |
| `packages/devtools/src/next/index.ts` | J, GT, S, SM, W, B, E, D | raw + tokens |
| `packages/devtools/src/runtypes/next/AGENTS.md` | J, GT, S, SM, W, B, E, D | raw |
| `packages/devtools/src/runtypes/next/CLAUDE.md` | J, GT, S, SM, W, B, E, D | raw |
| `packages/devtools/src/runtypes/next/broker.ts` | GT, S | raw |
| `packages/devtools/src/runtypes/next/index.ts` | J, GT, S, SM, W, B, E, D | raw + tokens |
| `packages/devtools/test/ambient-declarations.test.ts` | GT, S | raw |
| `packages/devtools/test/atomic.test.ts` | GT, S | raw |
| `packages/devtools/test/ci-lane-contracts.test.ts` | J, GT, S, SM, W, B, E, D | raw + tokens |
| `packages/devtools/test/circular.test.ts` | GT, S | raw |
| `packages/devtools/test/collections.test.ts` | GT, S | raw |
| `packages/devtools/test/eslint/plugin.test.ts` | GT, S | raw |
| `packages/devtools/test/eslint/tsconfig-resolution.test.ts` | GT, S | raw |
| `packages/devtools/test/esnext-lib-buffer.test.ts` | GT, S | raw |
| `packages/devtools/test/extends.test.ts` | GT, S | raw |
| `packages/devtools/test/functions.test.ts` | GT, S | raw |
| `packages/devtools/test/intersection.test.ts` | GT, S | raw |
| `packages/devtools/test/members.test.ts` | GT, S | raw |
| `packages/devtools/test/mion-presets.test.ts` | GT, S | raw |
| `packages/devtools/test/next-broker.test.ts` | J, GT, S, SM, W, B, E, D | raw + tokens |
| `packages/devtools/test/reflectionShape.test.ts` | GT, S | raw |
| `packages/devtools/test/repo-contracts.test.ts` | J, GT, S, SM, W, B, E, D | raw + tokens |
| `packages/devtools/test/test-batch-contracts.test.ts` | GT, S | raw |
| `packages/devtools/test/tsconfig-alignment.test.ts` | GT, S | raw |
| `packages/devtools/test/wrapping.test.ts` | GT, S | raw |
| `packages/drizzle-orm-mysql-core/AGENTS.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/drizzle-orm-mysql-core/CLAUDE.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/drizzle-orm-mysql-core/src/views.ts` | GT, S | raw |
| `packages/drizzle-orm-pg-core/AGENTS.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/drizzle-orm-pg-core/CLAUDE.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/drizzle-orm-pg-core/src/views.ts` | GT, S | raw |
| `packages/drizzle-orm-sqlite-core/AGENTS.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/drizzle-orm-sqlite-core/CLAUDE.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/drizzle-orm-sqlite-core/src/views.ts` | GT, S | raw |
| `packages/drizzle-orm/AGENTS.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/drizzle-orm/CLAUDE.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/drizzle-orm/src/view.ts` | GT, S | raw |
| `packages/private-test-router-fuzz/AGENTS.md` | J, GT, S, SM, W, B, E | raw |
| `packages/private-test-router-fuzz/CLAUDE.md` | J, GT, S, SM, W, B, E | raw |
| `packages/private-test-server/AGENTS.md` | J, GT, S, SM, W, B, E | raw |
| `packages/private-test-server/CLAUDE.md` | J, GT, S, SM, W, B, E | raw |
| `packages/private-type-budget/test/modelPipeline.compile.test.ts` | J, GT, S, SM, W, B, E | raw + tokens |
| `packages/rpc-client/AGENTS.md` | J, GT, S, SM, W, B, E | raw |
| `packages/rpc-client/CLAUDE.md` | J, GT, S, SM, W, B, E | raw |
| `packages/rpc-router/AGENTS.md` | G, J, GT, S, SM, W, B, E | raw |
| `packages/rpc-router/CLAUDE.md` | G, J, GT, S, SM, W, B, E | raw |
| `packages/rpc-router/test/typeOnlyImports.spec.ts` | G, J, GT, S, SM, W, B, E | raw + tokens |
| `packages/run-types/src/builders/AGENTS.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/run-types/src/builders/CLAUDE.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/run-types/src/builders/compose.ts` | GT, S | raw |
| `packages/run-types/src/builders/static.ts` | GT, S | raw |
| `packages/run-types/src/createRTFunctions.ts` | GT, S | raw |
| `packages/run-types/src/runtypes/builderTypes.ts` | GT, S | raw |
| `packages/run-types/src/runtypes/dataOnly.ts` | GT, S | raw |
| `packages/run-types/test/features/boundAliases.test.ts` | GT, S | raw |
| `packages/run-types/test/features/classSerializer.test.ts` | GT, S | raw |
| `packages/run-types/test/features/classSerializerGenerics.test.ts` | GT, S | raw |
| `packages/run-types/test/features/classSerializerNoGraph.test.ts` | GT, S | raw |
| `packages/run-types/test/features/classSerializerSubclass.test.ts` | GT, S | raw |
| `packages/run-types/test/features/classSerializerUnion.test.ts` | GT, S | raw |
| `packages/run-types/test/features/createStandardSchema.test.ts` | GT, S | raw |
| `packages/run-types/test/features/createValidate.test.ts` | GT, S | raw |
| `packages/run-types/test/features/getFnHash.test.ts` | GT, S | raw |
| `packages/run-types/test/features/jsonShapeWire.test.ts` | GT, S | raw |
| `packages/run-types/test/features/jsonValueFactories.test.ts` | GT, S | raw |
| `packages/run-types/test/features/mockSoundness.test.ts` | GT, S | raw |
| `packages/run-types/test/features/modelTypes.test.ts` | GT, S | raw |
| `packages/run-types/test/features/valueFirstRuntime.test.ts` | G, J, GT, S, SM, W, B, E, D | raw + tokens |
| `packages/run-types/test/fuzz/enrich/enrichFuzz.integration.test.ts` | GT, S | raw |
| `packages/run-types/test/fuzz/enrich/enrichModel.ts` | G, J, GT, S, SM, W, B, E, D | raw + tokens |
| `packages/run-types/test/suites/serialization/AGENTS.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/run-types/test/suites/serialization/CLAUDE.md` | G, J, GT, S, SM, W, B, E, D | raw |
| `packages/run-types/test/suites/serialization/Objects.ts` | GT, S | raw |
| `packages/run-types/test/suites/validation/types.ts` | GT, S | raw |
| `packages/run-types/test/suites/value-first-define/index.ts` | G, J, GT, S, SM, W, B, E, D | raw + tokens |
| `scripts/README.md` | J, GT, S, SM, W, B, E, D | raw |
| `scripts/ci/check-tree.mjs` | J, GT, S, SM, W, B, E, D | raw + tokens |
| `scripts/ci/lanes.mjs` | J, GT, S, SM, W, B, E, D | raw + tokens |
| `scripts/core/smoke.mjs` | J, GT, S, SM, W, B, E, D | raw + tokens |
| `scripts/setup-claude-web.sh` | J, GT, S, SM, W, B, E, D | raw |
| `ts-go-runtypes/AGENTS.md` | G, J, GT, GS, S, SM, W, B, E, D | raw |
| `ts-go-runtypes/CLAUDE.md` | G, J, GT, GS, S, SM, W, B, E, D | raw |
| `ts-go-runtypes/cmd/gen-drizzle-manifest/main.go` | GT, GS | raw |
| `ts-go-runtypes/internal/cachegen/purefunctions/AGENTS.md` | G, J, GT, GS, S, SM, W, B, E, D | raw |
| `ts-go-runtypes/internal/cachegen/purefunctions/CLAUDE.md` | G, J, GT, GS, S, SM, W, B, E, D | raw |
| `ts-go-runtypes/internal/cachegen/runtype/typeid/libglobal.go` | GT, GS, S | raw |
| `ts-go-runtypes/internal/compiler/resolver/apigen_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/atomic_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/check_unknowns_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/circular_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/collection_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/format_param_validation_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/function_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/intersection_collapse_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/member_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/notsupported_flag_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/provenance_scope_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/compiler/resolver/typedeps_test.go` | GT, GS | raw |
| `ts-go-runtypes/internal/drizzlemigrate/migrate.go` | GT, GS, S | raw |

Token treatment means a digest changed; raw means blob/path identity changed; unclassified means the base-only fail-safe input. A row can use tokens in test lanes and raw in static lanes.
