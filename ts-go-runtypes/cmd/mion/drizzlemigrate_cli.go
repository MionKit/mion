// drizzlemigrate_cli.go — the `mion drizzle-migrate` verb: move files
// authored against drizzle-orm onto the slim @mionjs/drizzle-orm-* packages.
//
// Same CLI shape as `convert` (in place by default, `--out-dir` for a migrated
// copy, `--check` for a write-nothing report) plus `--report`, which writes what
// the run rewrote as JSON. The drizzle-e2e lane crosses that report against the
// manifests, so a migrated builder no vendored suite exercises is caught rather
// than quietly counted as covered.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/drizzlemigrate"
)

// migrateReport is the --report payload: what moved, and what refused.
type migrateReport struct {
	DrizzleOrm string                      `json:"drizzleOrm"`
	Files      []drizzlemigrate.FileResult `json:"files"`
	Used       map[string][]string         `json:"used"`
	Refusals   []drizzlemigrate.Diagnostic `json:"refusals"`
}

func runDrizzleMigrate(args []string) {
	flagSet := flag.NewFlagSet("drizzle-migrate", flag.ExitOnError)
	checkFlag := flagSet.Bool("check", false, "report the files that would change without writing; exit 1 when changes are pending")
	outDirFlag := flagSet.String("out-dir", "", "copy the input directory here and migrate the copy, leaving sources untouched (requires a single directory argument)")
	tsconfigFlag := flagSet.String("tsconfig", "", "project tsconfig path (default: found like tsc, searching upward from the working directory)")
	reportFlag := flagSet.String("report", "", "write a JSON report of what was rewritten and what refused to this path")
	flagSet.Usage = func() {
		printUsage(flagSet, `mion drizzle-migrate — move a drizzle schema onto the slim @mionjs/drizzle-orm-* packages

Usage:
    mion drizzle-migrate src/schema.ts
    mion drizzle-migrate --check src/db/
    mion drizzle-migrate tests/ --out-dir translated/ --report report.json

Each table keeps its original name bound to the REAL drizzle table, so every
query, operator and config reader still works untouched:

    const users$table = pgTable('users', {id: uuid().primaryKey()});
    const users = toDrizzle(users$table);

The recorder half takes a suffixed name (users$table, myView$view, …) and only
references inside a recorder call use it. Imports split by what the slim
packages actually wrap; everything else stays on drizzle. A construct that
cannot be migrated is REPORTED and left as written, so the file stays valid
drizzle; any such refusal makes the exit code non-zero.
`)
	}
	positional, flags := splitArgs(args)
	if parseErr := flagSet.Parse(flags); parseErr != nil {
		fatal("drizzle-migrate: %v", parseErr)
	}
	if len(positional) == 0 {
		flagSet.Usage()
		os.Exit(2)
	}

	rootDir, files := expandConvertArgs(positional, *outDirFlag)
	if *outDirFlag != "" {
		copied, copyErr := copyIntoOutDir(rootDir, *outDirFlag, files)
		if copyErr != nil {
			fatal("drizzle-migrate: %v", copyErr)
		}
		files = copied
	}

	absFiles := make([]string, 0, len(files))
	for _, file := range files {
		absFiles = append(absFiles, tspath.NormalizePath(mustAbs(file)))
	}
	_, parsed := resolveEnrichProject(*tsconfigFlag)
	cwd := filepath.Dir(absFiles[0])
	prog, progErr := program.NewInferred(program.Options{Cwd: cwd, Config: parsed}, program.UnionRoots(absFiles, convertConfigRoots(parsed, rootDir, *outDirFlag)))
	if progErr != nil {
		fatal("drizzle-migrate: build program: %v", progErr)
	}
	session, resolverErr := resolver.New(prog, resolver.Options{Cwd: cwd})
	if resolverErr != nil {
		fatal("drizzle-migrate: build resolver: %v", resolverErr)
	}
	defer session.Close()

	importMap, mapErr := drizzlemigrate.LoadImportMap()
	if mapErr != nil {
		fatal("drizzle-migrate: %v", mapErr)
	}
	report := migrateReport{DrizzleOrm: importMap.DrizzleOrm, Used: map[string][]string{}}
	usedByDialect := map[string]map[string]bool{}
	errorCount := 0
	pendingChanges := 0
	for _, absPath := range absFiles {
		result, migrateErr := drizzlemigrate.MigrateFile(prog, session.Checker(), absPath, drizzlemigrate.Options{})
		if migrateErr != nil {
			fatal("drizzle-migrate: %v", migrateErr)
		}
		for _, diagnostic := range result.Diags {
			if diagnostic.Severity == drizzlemigrate.SeverityError {
				errorCount++
				report.Refusals = append(report.Refusals, diagnostic)
			}
			fmt.Fprintf(os.Stderr, "%s: %s\n", relPath(absPath), diagnostic.Describe())
		}
		for dialect, names := range result.Used {
			if usedByDialect[dialect] == nil {
				usedByDialect[dialect] = map[string]bool{}
			}
			for _, name := range names {
				usedByDialect[dialect][name] = true
			}
		}
		if result.Changed || len(result.Diags) > 0 {
			slim := *result
			slim.Output = ""
			report.Files = append(report.Files, slim)
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
			fatal("drizzle-migrate: write %s: %v", absPath, writeErr)
		}
		fmt.Printf("rewrote %s\n", relPath(absPath))
	}
	report.Used = drizzlemigrate.SortUsed(usedByDialect)
	if *reportFlag != "" {
		encoded, marshalErr := json.MarshalIndent(report, "", "  ")
		if marshalErr != nil {
			fatal("drizzle-migrate: encode report: %v", marshalErr)
		}
		if writeErr := os.WriteFile(*reportFlag, append(encoded, '\n'), 0o644); writeErr != nil {
			fatal("drizzle-migrate: write report %s: %v", *reportFlag, writeErr)
		}
		fmt.Printf("wrote report %s\n", relPath(mustAbs(*reportFlag)))
	}
	if errorCount > 0 {
		os.Exit(1)
	}
	if *checkFlag && pendingChanges > 0 {
		os.Exit(1)
	}
}
