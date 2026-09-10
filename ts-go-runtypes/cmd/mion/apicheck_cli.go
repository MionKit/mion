package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

const apiCheckUsage = `mion api-check — compare a client's bundled API against the server's

Usage:
  mion api-check --server-gen-dir <dir> --client-gen-dir <dir>

Reads <dir>/api/manifest.json from both build outputs (each flag may also name
the manifest file itself) and checks every method the client bundled against
the server: same type ids, compiled-function families, options and middleFn
chain. Two JSON files, no network, no TypeScript: run it in CI before a release
of a split client / server deployment.

Exit codes: 0 every bundled method matches; 1 a mismatch (one line each);
2 a manifest is missing, unreadable, or not the expected kind.
`

// apiCheckExitUsage is the exit code for a missing or unreadable manifest,
// the same one a bad invocation gets.
const apiCheckExitUsage = 2

func runApiCheck(args []string) {
	fs := flag.NewFlagSet("api-check", flag.ExitOnError)
	serverDir := fs.String("server-gen-dir", "", "the server build's gen dir (or its api/manifest.json)")
	clientDir := fs.String("client-gen-dir", "", "the client build's gen dir (or its api/manifest.json)")
	fs.Usage = func() { printUsage(fs, apiCheckUsage) }
	_ = fs.Parse(args)
	if *serverDir == "" || *clientDir == "" {
		fmt.Fprintln(os.Stderr, "api-check: both --server-gen-dir and --client-gen-dir are required")
		fs.Usage()
		os.Exit(apiCheckExitUsage)
	}
	server := readManifestOrExit(*serverDir, apimeta.ManifestKindServer)
	client := readManifestOrExit(*clientDir, apimeta.ManifestKindClient)
	mismatches := apimeta.Compare(client, server)
	for _, mismatch := range mismatches {
		fmt.Fprintln(os.Stderr, "api-check: "+mismatch.String())
	}
	if len(mismatches) > 0 {
		fmt.Fprintf(os.Stderr, "api-check: %d mismatch(es) across %d bundled method(s)\n", len(mismatches), len(client.Methods))
		os.Exit(1)
	}
	fmt.Fprintf(os.Stdout, "api-check: %d bundled method(s) match the server\n", len(client.Methods))
}

// readManifestOrExit reads the manifest a flag names (a gen dir, or the file
// itself) and checks its kind, exiting 2 on any problem.
func readManifestOrExit(arg, kind string) *apimeta.Manifest {
	path := arg
	if !strings.HasSuffix(path, ".json") {
		path = filepath.Join(path, constants.ApiModuleDir, constants.ApiManifestFile)
	}
	manifest, err := apimeta.ReadManifest(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "api-check: %s manifest: %v\n", kind, err)
		os.Exit(apiCheckExitUsage)
	}
	if manifest.Kind != kind {
		fmt.Fprintf(os.Stderr, "api-check: %s is a %s manifest, expected the %s one\n", path, manifest.Kind, kind)
		os.Exit(apiCheckExitUsage)
	}
	return manifest
}
