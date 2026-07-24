package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment/mirror"
)

// migrateLegacyMirror splits a pre-family-split COMBINED mirror (one file
// holding both friendly* and mock* consts at the legacy no-family path) into
// the per-family files, then deletes the legacy file — the one-shot migration
// behind the friendly/ + mock/ path segments. It runs before every gen pass
// over a source file and is a silent no-op when there is nothing to migrate.
//
// Guards (all conservative — when in doubt, migrate nothing and let `check`
// flag the drift):
//   - the legacy file must exist and carry a source breadcrumb that resolves
//     back to THIS source file (an unrelated file that happens to sit at the
//     legacy path — e.g. the mirror of a source living under a literal
//     `friendly/` source dir — is left alone);
//   - neither family file may already exist (a half-migrated state is
//     surfaced, never clobbered).
func migrateLegacyMirror(config enrichConfig, declFile string) {
	legacyPath := config.legacyMirrorPath(declFile)
	legacyBytes, err := os.ReadFile(legacyPath)
	if err != nil {
		return // no legacy combined mirror — nothing to migrate
	}

	breadcrumb, ok := mirror.ParseBreadcrumb(string(legacyBytes))
	if !ok {
		return // no source breadcrumb — not one of our generated mirrors
	}
	resolvedSource := mirror.ResolveBreadcrumb(legacyPath, breadcrumb.Spec)
	if tspath.NormalizePath(resolvedSource) != tspath.NormalizePath(declFile) {
		return // some other source's file — not this mirror's legacy home
	}

	friendlyPath := config.mirrorPath(familyFriendly, declFile)
	mockPath := config.mirrorPath(familyMock, declFile)
	for _, familyPath := range []string{friendlyPath, mockPath} {
		if _, statErr := os.Stat(familyPath); statErr == nil {
			fmt.Fprintf(os.Stderr,
				"gen: legacy combined mirror %s NOT migrated: %s already exists — merge them by hand (or delete one), then re-run\n",
				legacyPath, familyPath)
			return
		}
	}

	friendlyOut, mockOut, err := mirror.SplitCombined(legacyPath, legacyBytes, friendlyPath, mockPath, declFile)
	if err != nil {
		fatal("gen: migrate legacy mirror %s: %v", legacyPath, err)
	}
	if friendlyOut == nil && mockOut == nil {
		return // nothing worth carrying — leave the legacy file for the user
	}
	if friendlyOut != nil {
		writeMigratedFamily(friendlyPath, friendlyOut)
	}
	if mockOut != nil {
		writeMigratedFamily(mockPath, mockOut)
	}
	if err := os.Remove(legacyPath); err != nil {
		fatal("gen: migrate legacy mirror: remove %s: %v", legacyPath, err)
	}
	fmt.Printf("gen: migrated combined mirror %s into %s + %s\n", legacyPath, friendlyPath, mockPath)
}

// writeMigratedFamily writes one family's migrated content, creating parent
// dirs as needed.
func writeMigratedFamily(familyPath string, content []byte) {
	if err := os.MkdirAll(filepath.Dir(familyPath), 0o755); err != nil {
		fatal("gen: migrate legacy mirror: mkdir %s: %v", filepath.Dir(familyPath), err)
	}
	if err := atomicWriteFile(familyPath, content, 0o644); err != nil {
		fatal("gen: migrate legacy mirror: write %s: %v", familyPath, err)
	}
}
