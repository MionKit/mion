// Dialects and paths come only from --config; drizzle-dialects.json is hand-owned.
// Only manifest status and reason fields are hand-edited; all other fields come from drizzle declarations.
// Format mappings belong to .agents/skills/drizzle-slim-schemas/; this generator records migration status.
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
