package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// migrateFixture lays down a project with a pre-split combined mirror and
// returns the config + source path. The combined file holds an authored
// friendly value and an authored mock pool so the test can assert both carry.
func migrateFixture(t *testing.T) (enrichConfig, string) {
	t.Helper()
	dir := t.TempDir()
	t.Chdir(dir)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"),
		`{ "compilerOptions": { "rootDir": "src" } }`)
	source := filepath.Join(dir, "src", "models.ts")
	writeTestFile(t, source, "export interface User { name: string }\n")
	writeTestFile(t, filepath.Join(dir, "src", "__runtypes", "enriched", "models.ts"),
		"import type { User } from '../../models';\n"+
			"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n\n"+
			"/** @rtType User#u1 @rtIds {name: n1} */\n"+
			"export const friendlyUser: FriendlyType<User> = {\n"+
			"  rt$label: 'The user',\n"+
			"  rt$errors: {type: ''},\n"+
			"  name: {rt$label: 'Full name', rt$errors: {type: ''}},\n"+
			"};\n\n"+
			"/** @rtType User#u1 @rtIds {name: n1} */\n"+
			"export const mockUser: MockData<User> = {\n"+
			"  name: {pool: ['Alice']},\n"+
			"};\n")
	return resolveEnrichConfigTest(source, ""), source
}

// TestMigrateLegacyMirror_SplitsAndDeletes: the combined mirror splits into the
// two family files (authored values verbatim, breadcrumb recomputed) and the
// legacy file is deleted; a second run is a no-op.
func TestMigrateLegacyMirror_SplitsAndDeletes(t *testing.T) {
	config, source := migrateFixture(t)
	legacyPath := config.LegacyMirrorPath(source)

	migrateLegacyMirror(config, source)

	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Errorf("legacy combined mirror should be deleted after migration; stat err = %v", err)
	}
	friendlyBytes, err := os.ReadFile(config.MirrorPath(familyFriendly, source))
	if err != nil {
		t.Fatalf("friendly mirror not written: %v", err)
	}
	mockBytes, err := os.ReadFile(config.MirrorPath(familyMock, source))
	if err != nil {
		t.Fatalf("mock mirror not written: %v", err)
	}
	friendly, mock := string(friendlyBytes), string(mockBytes)

	if !strings.Contains(friendly, "rt$label: 'Full name'") || strings.Contains(friendly, "mockUser") {
		t.Errorf("friendly mirror wrong:\n%s", friendly)
	}
	if !strings.Contains(mock, "pool: ['Alice']") || strings.Contains(mock, "friendlyUser") {
		t.Errorf("mock mirror wrong:\n%s", mock)
	}
	// Breadcrumb re-anchored one level deeper.
	if !strings.Contains(friendly, "from '../../../models'") {
		t.Errorf("friendly breadcrumb not recomputed:\n%s", friendly)
	}

	// Second run: nothing to migrate, both files byte-identical.
	migrateLegacyMirror(config, source)
	friendlyAgain, _ := os.ReadFile(config.MirrorPath(familyFriendly, source))
	mockAgain, _ := os.ReadFile(config.MirrorPath(familyMock, source))
	if string(friendlyAgain) != friendly || string(mockAgain) != mock {
		t.Errorf("second migrateLegacyMirror run must be a byte-identical no-op")
	}
}

// TestMigrateLegacyMirror_NeverClobbers: a family file already present blocks
// the migration (half-migrated state is surfaced, never overwritten).
func TestMigrateLegacyMirror_NeverClobbers(t *testing.T) {
	config, source := migrateFixture(t)
	friendlyPath := config.MirrorPath(familyFriendly, source)
	writeTestFile(t, friendlyPath, "// hand-made friendly file\n")

	migrateLegacyMirror(config, source)

	if _, err := os.Stat(config.LegacyMirrorPath(source)); err != nil {
		t.Errorf("legacy mirror must survive a blocked migration; stat err = %v", err)
	}
	kept, _ := os.ReadFile(friendlyPath)
	if string(kept) != "// hand-made friendly file\n" {
		t.Errorf("existing family file must not be clobbered; got:\n%s", kept)
	}
}

// TestMigrateLegacyMirror_ForeignFileUntouched: a file at the legacy path whose
// breadcrumb resolves to a DIFFERENT source (e.g. the mirror of a source under a
// literal friendly/ dir) is left alone.
func TestMigrateLegacyMirror_ForeignFileUntouched(t *testing.T) {
	config, source := migrateFixture(t)
	legacyPath := config.LegacyMirrorPath(source)
	foreign := "import type { Other } from '../../src/other';\n" +
		"import type { FriendlyType } from '@ts-runtypes/core';\n\n" +
		"export const friendlyOther: FriendlyType<Other> = {rt$label: '', rt$errors: {type: ''}};\n"
	writeTestFile(t, legacyPath, foreign)

	migrateLegacyMirror(config, source)

	kept, err := os.ReadFile(legacyPath)
	if err != nil || string(kept) != foreign {
		t.Errorf("foreign file at the legacy path must be untouched; err=%v got:\n%s", err, kept)
	}
}
