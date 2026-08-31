package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// readSourceFile reads a file into a string, returning the error from os. It is
// the I/O injected into mirror.Reconcile so the pure package never touches disk.
func readSourceFile(path string) (string, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// updateMirrorFile reconciles an EXISTING committed mirror file against the
// freshly regenerated desired set (the `gen --update` path). Unlike
// writeMirrorFile (create-only — append missing exports, never touch present
// ones), this parses the existing file's AST, matches each existing const to
// its desired counterpart by the `@rtType` structural id, runs a fine-grained
// property merge that PRESERVES authored leaf values + formatting, and applies
// the edits via a descending splicer.
//
// It returns true when it changed the file, false on a byte-identical no-op
// (idempotent re-run). An empty / missing file falls back to the create-only
// fresh-file path so a first `gen --update` seeds the mirror. The pure reconcile
// lives in mirror.Reconcile; this shim owns the disk I/O, the change report, and
// surfacing any index advisories to stderr.
func updateMirrorFile(spec mirror.Spec) bool {
	existingBytes, err := os.ReadFile(spec.MirrorPath)
	if err != nil {
		if !os.IsNotExist(err) {
			fatal("enrich --update: read %s: %v", spec.MirrorPath, err)
		}
		// Missing file → seed it via the ordinary create-only path.
		return writeMirrorFile(spec)
	}
	if len(existingBytes) == 0 {
		return writeMirrorFile(spec)
	}

	// Surface any non-fatal index advisories (e.g. a duplicate @rtType id) to
	// stderr; the pure package collects them rather than printing.
	if index, parseErr := mirror.ParseMirror(spec.MirrorPath, existingBytes); parseErr == nil {
		for _, warning := range index.Warnings {
			fmt.Fprintln(os.Stderr, warning)
		}
	}

	out, changed, err := mirror.Reconcile(spec, existingBytes, readSourceFile)
	if err != nil {
		fatal("enrich --update: %v", err)
	}
	if !changed {
		return false // idempotent no-op
	}
	writeReconciled(spec.MirrorPath, out)
	return true
}

// writeReconciled writes the reconciled bytes back to the mirror file, creating
// parent dirs as needed, and reports the change.
func writeReconciled(mirrorPath string, content []byte) {
	if err := os.MkdirAll(filepath.Dir(mirrorPath), 0o755); err != nil {
		fatal("enrich --update: mkdir %s: %v", filepath.Dir(mirrorPath), err)
	}
	if err := atomicWriteFile(mirrorPath, content, 0o644); err != nil {
		fatal("enrich --update: write %s: %v", mirrorPath, err)
	}
	fmt.Printf("enrich --update: reconciled %s\n", mirrorPath)
}

// atomicWriteFile writes content to path via a same-directory temp file then
// renames it into place, so nothing ever observes a half-written mirror: the
// file flips old→new in one atomic rename, and a failed write leaves the
// original byte-identical. This is the prerequisite for racing reconciles (an
// HMR save and a format-on-save firing together) to stay safe. It mirrors the
// disk-cache writer in internal/cachegen/diskcache.
func atomicWriteFile(path string, content []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(content); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Chmod(tmpPath, perm); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

// runEnrichPrune implements `enrich --prune [<mirror-file-or-dir>]`: it walks the
// mirror file(s) (reusing the shared collectMirrorFiles walk) and strips every
// comment block/line tagged @rtOrphan / @rtOrphanChild, along with the
// commented-out code lines they tag. It reports what was removed. This is the
// only path that truly deletes content. Under --no-emit it LISTS the carcasses
// awaiting a prune and deletes nothing (the dry-run gate).
func runEnrichPrune(positional []string, genDirFlag, tsconfigFlag string, noEmit bool) {
	mirrorFiles := collectPruneTargets(positional, genDirFlag, tsconfigFlag)

	if noEmit {
		total := 0
		for _, mirrorFile := range mirrorFiles {
			count := countOrphanBlocks(mirrorFile)
			total += count
			if count > 0 {
				fmt.Printf("enrich --prune --no-emit: %s — %d orphan block(s)\n", mirrorFile, count)
			}
		}
		fmt.Fprintf(os.Stderr, "enrich --prune --no-emit: %d mirror file(s), %d orphan block(s)\n", len(mirrorFiles), total)
		os.Exit(0)
	}

	var totalRemoved int
	for _, mirrorFile := range mirrorFiles {
		totalRemoved += pruneMirrorFile(mirrorFile)
	}
	fmt.Fprintf(os.Stderr, "enrich --prune: %d mirror file(s), %d orphan block(s) removed\n", len(mirrorFiles), totalRemoved)
	os.Exit(0)
}

// countOrphanBlocks reports how many @rtOrphan / @rtOrphanChild carcasses a mirror
// file carries WITHOUT rewriting it — the read-only twin of pruneMirrorFile behind
// `enrich --prune --no-emit`. A missing / unreadable / unparseable file counts 0.
func countOrphanBlocks(mirrorFile string) int {
	contents, err := os.ReadFile(mirrorFile)
	if err != nil {
		return 0
	}
	_, removed, _, err := mirror.PruneOrphanBlocks(string(contents))
	if err != nil {
		return 0
	}
	return removed
}

// collectPruneTargets resolves the --prune argument: an explicit mirror .ts file
// or a directory to walk, used AS-IS (you point --prune directly at the committed
// file/dir to sweep), or — with no argument — the enrich dir resolved from the
// current directory's tsconfig. Unlike --check, --prune never redirects a path
// through mirrorPath: a file argument is always the thing to prune, so it must not
// depend on gen-dir resolution recognizing it (which broke a mirror in a
// non-default enrich dir pruned without --gen-dir).
func collectPruneTargets(positional []string, genDirFlag, tsconfigFlag string) []string {
	var target string
	if len(positional) > 0 {
		target = tspath.NormalizePath(mustAbs(positional[0]))
	} else {
		cwd := enrichCwd("enrich --prune")
		tsconfigPath, parsed := resolveEnrichProject(tsconfigFlag)
		config := resolveEnrichConfig(tspath.NormalizePath(filepath.Join(cwd, "_")), genDirFlag, tsconfigPath, parsed)
		target = config.EnrichDir
	}
	files, err := collectMirrorFiles(target)
	if err != nil {
		fatal("enrich --prune: %v", err)
	}
	return files
}

// pruneMirrorFile strips every `@rtOrphan` / `@rtOrphanChild` block comment (the
// commented-out carcasses the reconcile left behind) from one mirror file,
// rewriting it in place. It returns the number of blocks removed (0 → file
// untouched, not rewritten). This is the ONLY path that truly deletes content.
// A malformed carcass that mirror.PruneOrphanBlocks refuses to remove (it would
// span a live statement) is reported to stderr so the user fixes it by hand;
// a file that does not PARSE is skipped whole with a warning (prune never
// rewrites bytes it cannot confidently lex — same stance as gen --update).
func pruneMirrorFile(mirrorFile string) int {
	bytes, err := os.ReadFile(mirrorFile)
	if err != nil {
		if os.IsNotExist(err) {
			return 0
		}
		fatal("enrich --prune: read %s: %v", mirrorFile, err)
	}
	pruned, removed, skipped, err := mirror.PruneOrphanBlocks(string(bytes))
	if err != nil {
		fmt.Fprintf(os.Stderr, "enrich --prune: skipping %s: %v\n", mirrorFile, err)
		return 0
	}
	for _, carcass := range skipped {
		fmt.Fprintf(os.Stderr,
			"enrich --prune: skipping a malformed orphan carcass that appears to span a live statement boundary — fix it by hand:\n%.120s…\n",
			carcass)
	}
	if removed == 0 {
		return 0
	}
	if err := atomicWriteFile(mirrorFile, []byte(pruned), 0o644); err != nil {
		fatal("enrich --prune: write %s: %v", mirrorFile, err)
	}
	fmt.Printf("enrich --prune: %s — removed %d orphan block(s)\n", mirrorFile, removed)
	return removed
}
