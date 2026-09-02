// gen-drizzle-manifest maintains the per-dialect drizzle column manifests
// (one <dialect>.manifest.json inside each dialect package), the committed
// record of every value export of the configured drizzle-orm dialect modules
// and the migration status of each column builder in the
// @mionjs/drizzle-orm-<dialect>-core root modules. Everything the tool needs
// - the dialects, their drizzle modules, package dirs, proxy files and
// manifest paths - comes from the REQUIRED --config file
// (drizzle-dialects.json at the repo root, hand-owned); nothing is
// hardcoded here.
//
// The generator decides WHAT needs migrating; the drizzle-slim-schemas
// skill (.claude/skills/drizzle-slim-schemas/) decides HOW each column maps
// to a runtype format. Humans hand-edit ONLY `status` and `reason` on column
// and function entries; every other field is regenerated from drizzle-orm's
// d.ts through the embedded tsgo checker (internal/compiler/program).
//
// Run (from the repo root, via miondevx):
//
//	pnpm miondevx core drizzle-manifest            # regenerate / refresh in place
//	pnpm miondevx core drizzle-manifest --check    # CI gate: read-only drift + pending + coverage
//	pnpm miondevx core drizzle-manifest --pending  # read-only: list every entry awaiting review, with params + reason
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
	pending := flags.Bool("pending", false, "read-only: list every entry awaiting review (kind, params, reason); never writes, always exits 0")
	configPath := flags.String("config", "", "REQUIRED: path to the dialects.json config (repo-root-relative or absolute); each row names its package dir and manifest path")
	repoRoot := flags.String("repo-root", "", "monorepo root (defaults to walking up from cwd)")
	if err := flags.Parse(os.Args[1:]); err != nil {
		log.Fatal(err)
	}
	if *configPath == "" {
		log.Fatal("--config is required (path to dialects.json)")
	}
	root := *repoRoot
	if root == "" {
		found, err := findRepoRoot()
		if err != nil {
			log.Fatal(err)
		}
		root = found
	}
	resolvedConfig := *configPath
	if !filepath.IsAbs(resolvedConfig) {
		resolvedConfig = filepath.Join(root, filepath.FromSlash(resolvedConfig))
	}
	if err := run(root, resolvedConfig, *check, *pending); err != nil {
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
