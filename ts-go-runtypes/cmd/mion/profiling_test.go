package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// TestCompile_ErrorExitStillWritesCPUProfile: a compile that reports a TypeScript error exits 1, and the CPU
// profile it was asked for still lands on disk. Only a real child process shows what os.Exit skips.
func TestCompile_ErrorExitStillWritesCPUProfile(t *testing.T) {
	if dir := os.Getenv("MION_PPROFEXIT_DIR"); dir != "" {
		runCompile([]string{"--tsconfig", filepath.Join(dir, "tsconfig.json"), "--gen-dir", filepath.Join(dir, "gen"), "--pprof-cpu", filepath.Join(dir, "cpu.prof")})
		return
	}

	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{"compilerOptions": {"strict": true, "outDir": "out"}, "include": ["src"]}`)
	writeTestFile(t, filepath.Join(dir, "src", "broken.ts"), "export const count: number = 'not a number';\n")

	cmd := exec.Command(os.Args[0], "-test.run=TestCompile_ErrorExitStillWritesCPUProfile")
	cmd.Env = append(os.Environ(), "MION_PPROFEXIT_DIR="+dir)
	output, err := cmd.CombinedOutput()
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) || exitErr.ExitCode() != 1 {
		t.Fatalf("a compile with a TypeScript error must exit 1; got err=%v, output:\n%s", err, output)
	}
	info, statErr := os.Stat(filepath.Join(dir, "cpu.prof"))
	if statErr != nil || info.Size() == 0 {
		t.Errorf("the CPU profile must be written before exiting; stat err=%v, output:\n%s", statErr, output)
	}
}
