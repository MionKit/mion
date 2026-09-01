---
type: chore
spec: guidelines
status: ready
created: 2026-09-01
---

# Move the generated cache out of the user's repo, and rename the enrichment half

## Intent

`__runtypes/` is the last consumer-facing piece of the old name, and it is doing
two unrelated jobs under one directory:

- **`__runtypes/types/`** is a machine-generated cache. It has no business
  sitting in the user's source tree at all: it should live where other tools put
  caches (`node_modules/.cache/…` or similar), still importable from generated
  code, but outside anything the user commits or has to gitignore.
- **`__runtypes/enriched/`** is the opposite: hand-authored, committed
  FriendlyText and MockData maps that the user owns. That half stays in the
  repo, and its name should say what it is, e.g. `__ai_enrich/`.

Splitting them is the point; the rename is a consequence of it.

This is deliberately NOT part of the namespace migration. It is the **only
breaking change** in the whole set: every existing consumer has committed files
under `__runtypes/enriched/` and a matching `.gitignore` entry, so it needs its
own PR, its own release note, and probably a migration path.

## Direction

Verified on 2026-09-01, after the namespace migration landed:

- **The two halves are already separate directories**, which is what makes the
  split tractable: `typesSubdir = "types"` and a sibling `enriched/`
  (`ts-go-runtypes/internal/compiler/resolver/generate.go`).
- **The name has two independent definitions in Go and they must move together:**
  `DefaultGenDirName` in `internal/enrichment/enrichgen/config.go:23` and
  `outputDirName` in `internal/compiler/resolver/generate.go`. 271 sites across
  123 files reference the directory.
- **`genDir` is already configurable** (tsconfig `genDir`, the `--gen-dir` flag);
  `__runtypes` is only the convention when nothing supplies one. The enrichment
  paths UNDER it are convention, not configurable (see the enrich skill), so the
  enriched half's new name is a real decision, not a setting.
- **The cache half has a real constraint:** generated code imports it by relative
  path today. Moving it under `node_modules/.cache/` means those imports become
  package-ish or absolute, which touches the rewrite that injects them. Prove
  that road before committing to it.
- The resolver already keeps a separate disk cache at
  `node_modules/.cache/ts-runtypes` (`internal/compiler/resolver/resolver.go`),
  which is a precedent for where the generated half could go, and is itself
  still on the old name.

The implementer decides: where exactly the cache lands, how generated imports
address it, the new name for the enriched half, and whether consumers get an
automatic migration or a release note telling them to move the directory.

## Done when

- The generated cache lives outside the user's source tree and nothing asks them
  to gitignore it.
- The committed enrichment half has a name that says what it is, and the enrich
  CLI, the lint rules and the docs all use it.
- An existing project with a populated `__runtypes/enriched/` has a documented
  way forward that does not lose authored labels or mock pools.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/...` and
  `pnpm rtx release e2e` pass; the e2e is what proves a real consumer install
  still finds its generated modules.
