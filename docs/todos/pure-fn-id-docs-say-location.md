---
type: docs
spec: guidelines
status: ready
created: 2026-09-25
---

# Pure-fn id docs and errors still describe location-based ids

## Intent

A pure function's id is `<package>#pf_<hash of its shipped body>` (`IDFor` in `ts-go-runtypes/internal/cachegen/purefunctions/id.go`, the hash in `hash.go`). Renaming the binding or moving the file leaves the id alone; changing the body moves it.

Three places still describe the old scheme, where an id named the package, the file and the binding:

- `packages/run-types/src/markers.ts:205-207`, the `InjectPureFnId` doc comment: "its package, its file and the name it is bound to (`@acme/text/src/slug#slugify`). A registration bound to no name is identified by a hash of its body instead".
- `ts-go-runtypes/internal/diagnostics/messages.go` PFE9012 detail: "An id names the package, the file and the binding a pure fn was registered under, so a miss means that file is outside the scan set, or the registration moved or was renamed."
- The same file, PFE9014 headline and detail: "does not match this registration's location", "A pure function's id is computed from where it lives: the package, the file and the name it is bound to", and "left behind by a move or a rename".

PFE9014's advice is now wrong for a user: a rename does not change the id, but an edited body does.

## Where to look

- Rewrite the three texts to match `id.go` and `purefunctions/CLAUDE.md` (which already states the hash scheme).
- Search the rest for the old wording: `grep -rn "file and the name\|bound to\|#slugify\|registration's location" packages ts-go-runtypes/internal container/website/content`, including the website's pure-functions page.
- Diagnostic messages may be pinned by golden tests or generated files; regenerate with the repo's tooling, never by hand.

## Done when

- No doc, comment or diagnostic describes a location-based pure-fn id.
- Tests that pin diagnostic text pass (`go -C ts-go-runtypes test ./internal/... ./cmd/...` and the affected vitest projects).
