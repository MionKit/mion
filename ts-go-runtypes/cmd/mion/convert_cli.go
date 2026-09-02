// convert_cli.go — the `mion convert` verb: rewrite files between the
// two authoring forms (type-first / builders) over the shared
// reflection graph. CLI-only by design (a migration, not a build step):
// a one-shot migration tool, in place by default, `--out-dir` for a converted
// copy, `--check` for a write-nothing report.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
)

func runConvert(args []string) {
	flagSet := flag.NewFlagSet("convert", flag.ExitOnError)
	toFlag := flagSet.String("to", "", "target form: type | builders (required)")
	checkFlag := flagSet.Bool("check", false, "report the files that would change without writing; exit 1 when changes are pending")
	outDirFlag := flagSet.String("out-dir", "", "copy the input directory here and convert the copy, leaving sources untouched (requires a single directory argument)")
	tsconfigFlag := flagSet.String("tsconfig", "", "project tsconfig path (default: found like tsc, searching upward from the working directory)")
	reportFlag := flagSet.String("report", "", "write a JSON report of what converted and what refused to this path")
	flagSet.Usage = func() {
		printUsage(flagSet, `mion convert — rewrite type declarations between the two authoring forms

Usage:
    mion convert --to builders src/models.ts src/api.ts
    mion convert --to type --check src/models/
    mion convert --to builders src/models/ --out-dir converted/

Files convert as a set: declarations that reference each other stay name
references, cycles close at the root, imports are managed, and a reference to
a convertible declaration outside the run errors (CNV004) instead of inlining.
Declarations already in the target form are left byte-identical. A declaration
the converter cannot express reports a CNV diagnostic and stays untouched;
any error makes the exit code non-zero.
`)
	}
	positional, flags := splitArgs(args)
	if parseErr := flagSet.Parse(flags); parseErr != nil {
		fatal("convert: %v", parseErr)
	}
	target, targetErr := convert.ParseTarget(*toFlag)
	if targetErr != nil {
		fatal("convert: %v", targetErr)
	}
	if len(positional) == 0 {
		flagSet.Usage()
		os.Exit(2)
	}

	rootDir, files := expandConvertArgs(positional, *outDirFlag)
	if *outDirFlag != "" {
		copied, copyErr := copyIntoOutDir(rootDir, *outDirFlag, files)
		if copyErr != nil {
			fatal("convert: %v", copyErr)
		}
		files = copied
	}

	absFiles := make([]string, 0, len(files))
	for _, file := range files {
		absFiles = append(absFiles, tspath.NormalizePath(mustAbs(file)))
	}
	_, parsed := resolveEnrichProject(*tsconfigFlag)
	cwd := filepath.Dir(absFiles[0])
	// Root the WHOLE config file list beside the conversion targets (one-shot
	// tool, so the parse cost is paid once): ambient declarations the project
	// includes then resolve exactly as tsc sees them, instead of silently
	// checking as `any` and being cemented into the rewritten source. The
	// conversion SET below stays absFiles — only what the checker sees widens.
	prog, progErr := program.NewInferred(program.Options{Cwd: cwd, Config: parsed}, program.UnionRoots(absFiles, convertConfigRoots(parsed, rootDir, *outDirFlag)))
	if progErr != nil {
		fatal("convert: build program: %v", progErr)
	}
	session, resolverErr := resolver.New(prog, resolver.Options{Cwd: cwd})
	if resolverErr != nil {
		fatal("convert: build resolver: %v", resolverErr)
	}
	defer session.Close()

	options := convert.Options{Target: target}
	conversionSet, setErr := convert.BuildSet(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absFiles)
	if setErr != nil {
		fatal("convert: %v", setErr)
	}
	errorCount := 0
	pendingChanges := 0
	// The report is the measurement the drizzle-e2e lane crosses against the
	// manifests: what a run actually converted, and every refusal with its
	// reason, rather than a count someone reads off the console.
	report := convertReport{Target: *toFlag}
	for _, absPath := range absFiles {
		result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath, options, conversionSet)
		if convertErr != nil {
			fatal("convert: %v", convertErr)
		}
		for _, diagnostic := range result.Diags {
			severity := "warning"
			if diagnostic.Severity == convert.SeverityError {
				severity = "error"
				errorCount++
				diagnostic.File = relPath(absPath)
				report.Refusals = append(report.Refusals, diagnostic)
			}
			fmt.Fprintf(os.Stderr, "%s: %s %s [%s]: %s\n", relPath(absPath), diagnostic.Code, severity, diagnostic.Decl, diagnostic.Message)
		}
		if result.Changed || len(result.Diags) > 0 {
			report.Files = append(report.Files, convert.FileResult{Path: relPath(absPath), Changed: result.Changed, Converted: result.Converted, Diags: result.Diags})
		}
		if !result.Changed {
			continue
		}
		pendingChanges++
		if *checkFlag {
			fmt.Printf("would rewrite %s\n", relPath(absPath))
			continue
		}
		if writeErr := os.WriteFile(absPath, []byte(result.Output), 0o644); writeErr != nil {
			fatal("convert: write %s: %v", absPath, writeErr)
		}
		fmt.Printf("rewrote %s\n", relPath(absPath))
	}
	if *reportFlag != "" {
		encoded, marshalErr := json.MarshalIndent(report, "", "  ")
		if marshalErr != nil {
			fatal("convert: encode report: %v", marshalErr)
		}
		if writeErr := os.WriteFile(*reportFlag, append(encoded, '\n'), 0o644); writeErr != nil {
			fatal("convert: write report %s: %v", *reportFlag, writeErr)
		}
	}
	if errorCount > 0 {
		os.Exit(1)
	}
	if *checkFlag && pendingChanges > 0 {
		os.Exit(1)
	}
}

// convertReport is the --report payload: one entry per file the run touched,
// plus every refusal, flat, so a consumer never has to walk the files to find
// what did not convert.
type convertReport struct {
	Target   string               `json:"target"`
	Files    []convert.FileResult `json:"files,omitempty"`
	Refusals []convert.Diagnostic `json:"refusals,omitempty"`
}

// convertConfigRoots returns the config's file list adjusted for --out-dir:
// members under the copied rootDir are re-rooted into the copy (which contains
// them — copyIntoOutDir copies the whole tree), so the original and the copy of
// the same file are never both rooted (duplicate ambient value declarations
// would otherwise collide); members outside rootDir ride along as-is.
func convertConfigRoots(parsed *program.InferredConfig, rootDir, outDir string) []string {
	configFiles := parsed.FileNames()
	if outDir == "" || rootDir == "" {
		return configFiles
	}
	absRoot := tspath.NormalizePath(mustAbs(rootDir))
	absOut := tspath.NormalizePath(mustAbs(outDir))
	rerooted := make([]string, 0, len(configFiles))
	for _, configFile := range configFiles {
		if rel := strings.TrimPrefix(configFile, absRoot+"/"); rel != configFile {
			rerooted = append(rerooted, absOut+"/"+rel)
			continue
		}
		rerooted = append(rerooted, configFile)
	}
	return rerooted
}

// expandConvertArgs resolves the positional arguments to the file set. A
// single directory argument expands to every .ts/.tsx under it (node_modules
// and .d.ts excluded) and becomes the --out-dir copy root.
func expandConvertArgs(positional []string, outDir string) (string, []string) {
	if len(positional) == 1 && isDirArg(positional[0]) {
		rootDir := positional[0]
		var files []string
		walkErr := filepath.WalkDir(rootDir, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				// Skip dependencies and DOT directories. A dot directory is
				// generated or tool-owned by convention (`.tmp` scratch trees,
				// `.cache`, `.git`), so rewriting one edits something whose
				// author is a program — and it is usually gitignored, so the
				// rewrite is invisible until it breaks the generator.
				if entry.Name() == "node_modules" || strings.HasPrefix(entry.Name(), ".") {
					return filepath.SkipDir
				}
				return nil
			}
			if isConvertibleSource(path) {
				files = append(files, path)
			}
			return nil
		})
		if walkErr != nil {
			fatal("convert: %v", walkErr)
		}
		if len(files) == 0 {
			fatal("convert: no .ts/.tsx files under %s", rootDir)
		}
		return rootDir, files
	}
	if outDir != "" {
		fatal("convert: --out-dir requires a single directory argument")
	}
	for _, file := range positional {
		if isDirArg(file) {
			fatal("convert: pass either one directory or a list of files, not both (%s is a directory)", file)
		}
		if !isConvertibleSource(file) {
			fatal("convert: %s is not a .ts/.tsx source file", file)
		}
	}
	return "", positional
}

// isConvertibleSource accepts .ts/.tsx sources, excluding declaration files.
func isConvertibleSource(path string) bool {
	if strings.HasSuffix(path, ".d.ts") {
		return false
	}
	return strings.HasSuffix(path, ".ts") || strings.HasSuffix(path, ".tsx")
}

// copyIntoOutDir copies the whole input tree into outDir (assets and
// non-converted files ride along so relative imports keep resolving) and
// returns the file list re-rooted into the copy.
func copyIntoOutDir(rootDir, outDir string, files []string) ([]string, error) {
	if mkdirErr := os.MkdirAll(outDir, 0o755); mkdirErr != nil {
		return nil, mkdirErr
	}
	if copyErr := os.CopyFS(outDir, os.DirFS(rootDir)); copyErr != nil {
		return nil, fmt.Errorf("copy %s into %s: %w", rootDir, outDir, copyErr)
	}
	rerooted := make([]string, 0, len(files))
	for _, file := range files {
		relative, relErr := filepath.Rel(rootDir, file)
		if relErr != nil {
			return nil, relErr
		}
		rerooted = append(rerooted, filepath.Join(outDir, relative))
	}
	return rerooted, nil
}

// relPath renders a path relative to the working directory when possible.
func relPath(absPath string) string {
	cwd, cwdErr := os.Getwd()
	if cwdErr != nil {
		return absPath
	}
	if relative, relErr := filepath.Rel(cwd, absPath); relErr == nil && !strings.HasPrefix(relative, "..") {
		return relative
	}
	return absPath
}
