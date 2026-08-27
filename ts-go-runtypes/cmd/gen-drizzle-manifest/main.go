// gen-drizzle-manifest maintains packages/drizzle/manifests/ (one
// <dialect>.manifest.json per supported dialect plus an index.json naming
// them), the committed record of every value export of drizzle-orm's pg-core /
// mysql-core / sqlite-core modules and the migration status of each column
// builder in the @mionjs/drizzle proxy modules (src/proxies/<dialect>.ts).
//
// The generator decides WHAT needs migrating; the drizzle-proxy-migration
// skill (.claude/skills/drizzle-proxy-migration/) decides HOW each column maps
// to a runtype format. Humans hand-edit ONLY `status` and `reason` on column
// entries; every other field is regenerated from drizzle-orm's d.ts through
// the embedded tsgo checker (internal/compiler/program).
//
// Run (from the repo root, via rtx):
//
//	pnpm rtx core drizzle-manifest            # regenerate / refresh in place
//	pnpm rtx core drizzle-manifest --check    # CI gate: read-only drift + pending + coverage
package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"
)

func main() {
	log.SetFlags(0)
	log.SetPrefix("gen-drizzle-manifest: ")
	flags := flag.NewFlagSet("gen-drizzle-manifest", flag.ExitOnError)
	check := flags.Bool("check", false, "read-only gate: fail on drift, pending entries, or coverage holes")
	repoRoot := flags.String("repo-root", "", "monorepo root (defaults to walking up from cwd)")
	if err := flags.Parse(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
	root := *repoRoot
	if root == "" {
		found, err := findRepoRoot()
		if err != nil {
			log.Fatal(err)
		}
		root = found
	}
	if err := run(root, *check); err != nil {
		log.Fatal(err)
	}
}

// findRepoRoot walks up from the working directory to the pnpm workspace root.
func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, statErr := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); statErr == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", os.ErrNotExist
		}
		dir = parent
	}
}
