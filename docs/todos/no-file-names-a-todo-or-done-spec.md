---
type: chore
spec: guidelines
status: ready
created: 2026-09-02
---

# Drop every reference to a specific todo or done spec from the rest of the tree, and enforce it

## Intent

The root CLAUDE.md (PR readiness section) now says: no file outside `docs/todos/` and `docs/done/` may name a document in those two directories. Those specs get deleted eventually, so every such reference rots into a dangling pointer, and the reader loses the reasoning that was parked behind the link. The reasoning belongs in the file that needs it.

The rule is written down, but the tree does not follow it yet. Found while renaming the dev CLI: a sweep for `docs/(todos|done)/<name>.md` outside the two directories (and outside `CHANGELOG.md`, `third_party/`, `_deps/`, `node_modules/`) returns about 20 hits that predate that change:

- Workflow comments: `.github/workflows/fuzz-soak.yml` (two), `.github/workflows/release-gate.yml` (one).
- Docs: `docs/FUZZING.md`, `docs/WEBSITE-DOCGEN.md`, `container/website/CLAUDE.md`, `docs/maybe/binary-as-opt-in-data.md`, `docs/maybe/data-only-standard-library-globals.md`.
- Code comments: `container/benchmarks/shared/cases/strict/index.ts`, `packages/core/src/binary/bufferPool.ts`, `packages/core/src/binary/options.ts`, `packages/core/src/binary/sizeStats.ts`, `packages/devtools/src/core/type-deps.ts`, `packages/devtools/src/options.ts`, `packages/devtools/src/vite/serverMappersBuild.spec.ts`, `packages/devtools/src/vite/sfcTransform.spec.ts`, `packages/devtools/test/ambient-declarations.test.ts`.

Re-run the sweep before starting; the list above is a snapshot.

## Direction

- For each hit, keep the explanation and drop the document name: say in one or two sentences what the referenced spec established (the constraint, the bug shape, the decision) right where the comment sits. Read the referenced spec first when it still exists so the paraphrase is accurate. Where the spec is already gone, say what the code enforces instead.
- `docs/maybe/` specs count as "other files" for this rule: they are not the todos or done lane, and they outlive the specs they point at.
- Enforce it: add a contract to `packages/devtools/test/repo-contracts.test.ts` (next to the env registry and the `rtx` sweep) that walks the tracked tree, skips `docs/todos/`, `docs/done/`, `CHANGELOG.md`, `ts-go-runtypes/third_party/`, every `_deps/` and `node_modules/`, and fails on any `docs/(todos|done)/[a-z0-9-]+\.md` match. Prefer `git ls-files` over a directory walk so ignored build output never trips it.
- Do not touch `CHANGELOG.md` (history) and do not rewrite the specs under `docs/todos/` or `docs/done/` themselves.
- The implementer plans the details: the exact wording per site, and whether the contract also catches bare `<name>.md` mentions that clearly point at a spec.

## Done when

- The sweep returns nothing outside the exempt paths, and the new contract test proves it and fails when a reference is added.
- Each former reference site still explains its reasoning in place.
- `pnpm run lint`, `pnpm run check-format` and `pnpm test` are green.
