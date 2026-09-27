---
type: fix
spec: guidelines
status: ready
created: 2026-09-27
---

# `mion compile --no-emit` prints the diagnostic count as the file count

## Intent

`mion compile --no-emit` ends with `mion: checked N file(s), wrote nothing (--no-emit)`, but `N` is the number
of diagnostics, not the number of files checked. A clean project prints `checked 0 file(s)`, and a project with
many warnings looks like it checked many files. The summary line should say how many files were checked.

## Direction

- The line is in `runCompile`, `ts-go-runtypes/cmd/mion/main.go`: it prints `len(compileResult.Diagnostics)`.
  The emit branch just below prints `len(compileResult.EmittedFiles)`, the right shape.
- Find where `batchcompile.Run` (`--no-emit` path) knows the files it scanned, and expose that count on its
  result if it does not already.
- Add a Go test that pins the summary line for a `--no-emit` run with a known number of files and a
  different number of diagnostics, so the two can never be confused again.

The implementer plans the details.

## Docs

None, because no website page quotes this summary line (check with a grep of `container/website/content/`
for `checked` before closing; if a page does quote it, fix that page and run the pass below).

## Done when

- `mion compile --no-emit` reports the number of files it checked, pinned by a Go test.
- The simplify-comments pass ran on every touched source file, committed on its own.
