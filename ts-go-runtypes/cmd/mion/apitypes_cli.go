package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apitypes"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/batchcompile"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

const apiTypesUsage = `mion api-types — build a types-only package for an API's clients

Usage:
  mion api-types [--out <dir>] [--name <name>] [--version <version>] [--entry <file>] [OPTIONS]

Compiles the API's declarations and keeps only what a client build needs: the
exported API (the value initRoutes returns) and every type it reaches. Private
and raw middlewares, server-only code and their imports are left out. The
package holds the trimmed .d.ts, the server's mion-pure-fns/ when it has one,
.mion/api/manifest.json for mion api-check, the mion-api.json marker a client
checks, and a package.json with no JavaScript entry and the peer dependencies
the types need.

--out defaults to ./api-types and is replaced on every run; a non-empty
directory this command did not write is refused. --name defaults to the server
package name plus -types and --version to the server version. --entry is the
source file exporting the API, needed only when several files export one; by
default the package.json "types" entry, then the one file exporting an API.
`

func runApiTypes(args []string) {
	fs := flag.NewFlagSet("api-types", flag.ExitOnError)
	shared := registerSharedFlags(fs)
	outFlag := fs.String("out", "api-types", "the package directory to write (replaced on every run)")
	nameFlag := fs.String("name", "", "the package name (default: the server package name plus -types)")
	versionFlag := fs.String("version", "", "the package version (default: the server package version)")
	entryFlag := fs.String("entry", "", "the source file exporting the API (default: package.json \"types\", then the one file exporting an API)")
	fs.Usage = func() { printUsage(fs, apiTypesUsage) }
	_ = fs.Parse(args)

	defer startProfiling(shared)()

	cfg := resolveSharedConfig(fs, shared, "", true)
	if cfg.tsconfigPath == "" {
		fatal("api-types: no tsconfig.json found searching upward from %s — pass --tsconfig", cfg.absCwd)
	}
	// Checked before the temp dir exists: printBuildDiagnostics exits on these, and an exit skips the cleanup.
	if _, err := diagnostics.ResolveDowngrade(cfg.opts.TsconfigDowngradeErrors); err != nil {
		fatal("api-types: %v", err)
	}
	if _, err := diagnostics.ResolveLevels(cfg.opts.TsconfigLevels); err != nil {
		fatal("api-types: %v", err)
	}
	genDir, err := os.MkdirTemp("", "mion-api-types-")
	if err != nil {
		fatal("api-types: %v", err)
	}
	defer os.RemoveAll(genDir)
	declarationDir := filepath.Join(cfg.absCwd, ".mion-api-types")
	compileResult, compileErr := batchcompile.Run(batchcompile.Options{
		Cwd: cfg.absCwd, TsconfigPath: cfg.tsconfigPath, GenDir: genDir, ResolverOpts: cfg.opts,
		DeclarationsOnly: true, DeclarationDir: declarationDir,
	})
	if compileErr != nil {
		os.RemoveAll(genDir)
		fatal("api-types: %v", compileErr)
	}
	if printBuildDiagnostics("api-types", cfg, compileResult) > 0 {
		os.RemoveAll(genDir)
		exitAfterProfiling(1)
	}
	if err := buildApiTypes(cfg.absCwd, cfg.tsconfigPath, declarationDir, compileResult, *outFlag, *nameFlag, *versionFlag, *entryFlag); err != nil {
		os.RemoveAll(genDir)
		fatal("api-types: %v", err)
	}
}

func buildApiTypes(cwd, tsconfigPath, declarationDir string, compileResult *batchcompile.Result, outFlag, name, version, entryFlag string) error {
	_, serverRoot := marker.PackageOfFile(filepath.Join(cwd, "package.json"), nil)
	if serverRoot == "" {
		return fmt.Errorf("no package.json found from %s upward: the types package takes its name and versions from it", cwd)
	}
	entry, err := entryDeclaration(cwd, serverRoot, declarationDir, compileResult.Declarations, entryFlag)
	if err != nil {
		return err
	}
	input := apitypes.Input{Cwd: cwd, TsconfigPath: tsconfigPath, DeclarationDir: declarationDir, Declarations: compileResult.Declarations, Entry: entry}
	trimmed, err := apitypes.Trim(input)
	if err != nil && entryFlag == "" && entry != "" {
		// The package.json "types" entry is only a hint: fall back to the one file exporting an API.
		input.Entry = ""
		trimmed, err = apitypes.Trim(input)
	}
	if err != nil {
		return err
	}
	problems, trimmedVersion, err := apitypes.Check(input, trimmed)
	if err != nil {
		return err
	} else if len(problems) > 0 {
		return fmt.Errorf("the trimmed declarations do not type-check on their own:\n%s", strings.Join(problems, "\n"))
	}
	for _, warning := range trimmed.Warnings {
		fmt.Fprintf(os.Stderr, "mion: warning: %s\n", warning)
	}
	serverManifest, err := apimeta.ReadManifest(filepath.Join(compileResult.GenDir, constants.ApiModuleDir, constants.ApiManifestFile))
	if err == nil && serverManifest.Kind != apimeta.ManifestKindServer {
		err = fmt.Errorf("it is a %s manifest", serverManifest.Kind)
	}
	if err != nil {
		return fmt.Errorf("the build wrote no API manifest: does the program call initRoutes from @mionjs/router? (%v)", err)
	}
	if serverManifest.BuildVersion != trimmedVersion {
		return fmt.Errorf("the trimmed API type carries build version %q but the manifest %q: export the value initRoutes returns, unannotated", trimmedVersion, serverManifest.BuildVersion)
	}
	manifest := serverManifest.Render()
	files, warnings, err := apitypes.BuildPackage(apitypes.PackageInput{
		ServerRoot: serverRoot, Name: name, Version: version, Trimmed: trimmed,
		PureFnArtifact: compileResult.PureFnArtifact, Manifest: string(manifest), Compiler: constants.Version,
	})
	if err != nil {
		return err
	}
	outDir := outFlag
	if !filepath.IsAbs(outDir) {
		outDir = filepath.Join(cwd, outDir)
	}
	if err := apitypes.WritePackage(outDir, files); err != nil {
		return err
	}
	for _, warning := range warnings {
		fmt.Fprintf(os.Stderr, "mion: warning: %s\n", warning)
	}
	fmt.Fprintf(os.Stderr, "mion: wrote %s (%d declaration file(s), %s, build version %s)\n",
		relPath(outDir), len(trimmed.Files), strings.Join(trimmed.ApiExports, ", "), trimmed.BuildVersion)
	return nil
}

// entryDeclaration maps --entry, else package.json "types", to the emitted .d.ts; "" lets the trimmer find it.
func entryDeclaration(cwd, serverRoot, declarationDir string, declarations map[string]string, entryFlag string) (string, error) {
	hint, fromFlag := entryFlag, entryFlag != ""
	if !fromFlag {
		hint = packageTypesEntry(serverRoot)
		if hint == "" {
			return "", nil
		}
	}
	base := cwd
	if !fromFlag {
		base = serverRoot
	}
	abs := hint
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(base, hint)
	}
	stem := filepath.ToSlash(tspath.RemoveFileExtension(abs))
	best, bestLength := "", -1
	for declaration := range declarations {
		rel, err := filepath.Rel(declarationDir, declaration)
		if err != nil {
			continue
		}
		candidate := filepath.ToSlash(tspath.RemoveFileExtension(rel))
		if (stem == candidate || strings.HasSuffix(stem, "/"+candidate)) && len(candidate) > bestLength {
			best, bestLength = declaration, len(candidate)
		}
	}
	if best == "" && fromFlag {
		names := make([]string, 0, len(declarations))
		for declaration := range declarations {
			rel, _ := filepath.Rel(declarationDir, declaration)
			names = append(names, filepath.ToSlash(rel))
		}
		sort.Strings(names)
		return "", fmt.Errorf("--entry %s matches no emitted declaration (%s)", entryFlag, strings.Join(names, ", "))
	}
	return best, nil
}

// packageTypesEntry reads package.json `types`, `typings` or `exports["."].types`.
func packageTypesEntry(root string) string {
	content, err := os.ReadFile(filepath.Join(root, "package.json"))
	if err != nil {
		return ""
	}
	var pkg struct {
		Types   string          `json:"types"`
		Typings string          `json:"typings"`
		Exports json.RawMessage `json:"exports"`
	}
	if json.Unmarshal(content, &pkg) != nil {
		return ""
	}
	if pkg.Types != "" {
		return pkg.Types
	}
	if pkg.Typings != "" {
		return pkg.Typings
	}
	var exports map[string]json.RawMessage
	if json.Unmarshal(pkg.Exports, &exports) != nil {
		return ""
	}
	var dot struct {
		Types string `json:"types"`
	}
	if json.Unmarshal(exports["."], &dot) == nil {
		return dot.Types
	}
	return ""
}
