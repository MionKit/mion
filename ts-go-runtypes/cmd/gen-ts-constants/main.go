// gen-ts-constants regenerates the TS mirrors of pkg/constants/constants.go, the single source of truth for
// values the Go and JS halves share: the Vite plugin registry and the batch id lookup key `batch()` builds.
// Run via `pnpm miondevx core codegen constants`.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/codegen"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/constants"
)

const vitePluginConstantsPath = "packages/devtools/src/core/go-generated/runtypes-constants.generated.ts"

const batchKeyConstantsPath = "packages/core/src/go-generated/batchKey.generated.ts"

// The header fields of both generated files.
const (
	tool   = "cmd/gen-ts-constants"
	source = "pkg/constants/constants.go"
	regen  = "pnpm miondevx core codegen constants"
)

func main() {
	for path, content := range map[string]string{vitePluginConstantsPath: buildVitePluginConstants(), batchKeyConstantsPath: buildBatchKeyConstants()} {
		if err := os.WriteFile(filepath.Join(codegen.RepoRoot(), path), []byte(content), 0o644); err != nil {
			fmt.Fprintln(os.Stderr, "gen-ts-constants:", err)
			os.Exit(1)
		}
	}
}

// buildBatchKeyConstants mirrors the batch id lookup key format into @mionjs/core, which the client imports.
func buildBatchKeyConstants() string {
	return codegen.Header(tool, source, regen) + "\n" +
		"/** Joins the routes of the key `batch()` picks its id by, when the build injected one id per route combination. */\n" +
		"export const BATCH_KEY_ROUTE_SEPARATOR = " + strconv.Quote(constants.BatchKeyRouteSeparator) + ";\n" +
		"/** Prefixes, after a route id in that key, the index of each argument mapped into the route. */\n" +
		"export const BATCH_KEY_MAPPED_ARG_MARK = " + strconv.Quote(constants.BatchKeyMappedArgMark) + ";\n"
}

// buildVitePluginConstants returns the full TS module body the Vite plugin
// consumes — cache modules, reflection sub kinds, and the non-serializable
// globals list.
func buildVitePluginConstants() string {
	out := &strings.Builder{}
	out.WriteString(codegen.Header(tool, source, regen))
	out.WriteString("\n")

	out.WriteString("export interface CacheModuleSettings {\n")
	out.WriteString("  readonly name: string;\n")
	out.WriteString("  readonly varPrefix: string;\n")
	out.WriteString("  readonly tag: string;\n")
	out.WriteString("}\n")
	out.WriteString("\n")

	keys := make([]string, 0, len(constants.CacheModules))
	for key := range constants.CacheModules {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	out.WriteString("export const CACHE_MODULES = {\n")
	for _, key := range keys {
		setting := constants.CacheModules[key]
		out.WriteString(fmt.Sprintf("  %s: {name: %q, varPrefix: %q, tag: %q},\n", tsKey(key), setting.Name, setting.VarPrefix, setting.Tag))
	}
	out.WriteString("} as const satisfies Record<string, CacheModuleSettings>;\n")
	out.WriteString("\n")

	// Convenience exports per module — `RUNTYPES_VAR_PREFIX` etc. — so
	// callers don't have to dereference CACHE_MODULES at every use site.
	for _, key := range keys {
		setting := constants.CacheModules[key]
		upper := strings.ToUpper(key)
		out.WriteString(fmt.Sprintf("export const %s_VAR_PREFIX = %q;\n", upper, setting.VarPrefix))
		out.WriteString(fmt.Sprintf("export const %s_MODULE_NAME = %q;\n", upper, setting.Name))
		out.WriteString(fmt.Sprintf("export const %s_TAG = %q;\n", upper, setting.Tag))
	}

	out.WriteString("\n")
	writeEntryModuleConstants(out)

	return out.String()
}

// writeEntryModuleConstants emits the internal render-format names. In
// files-mode they key the entry modules the resolver writes to disk and the
// rewrite's import injection consumes; rtmod:/ survives only as the
// render specifier, relativized to on-disk paths at the resolver boundary.
func writeEntryModuleConstants(out *strings.Builder) {
	out.WriteString("// Internal render-format names (rtmod:/<basename>.js) the resolver\n")
	out.WriteString("// writes to disk and relativizes to on-disk paths — see pkg/compiler/entrymodules.\n")
	fmt.Fprintf(out, "export const ENTRY_MODULE_PREFIX = %q;\n", constants.EntryModulePrefix)
	fmt.Fprintf(out, "export const ENTRY_MODULE_SUFFIX = %q;\n", constants.EntryModuleSuffix)
	fmt.Fprintf(out, "export const ENTRY_BINDING_PREFIX = %q;\n", constants.EntryBindingPrefix)
	fmt.Fprintf(out, "export const PURE_FN_MODULE_DIR = %q;\n", constants.PureFnModuleDir)
	out.WriteString("// Joins a pure-fn id's package half to its hash half.\n")
	fmt.Fprintf(out, "export const PURE_FN_HASH_PREFIX = %q;\n", constants.PureFnHashPrefix)
	out.WriteString("// The directory every build syncs into the bundler's output dir: the package's own pure-fn cache modules plus the index below, which a consumer's compiler serves from.\n")
	fmt.Fprintf(out, "export const PURE_FN_ARTIFACT_DIR = %q;\n", constants.PureFnArtifactDir)
	fmt.Fprintf(out, "export const PURE_FN_ARTIFACT_INDEX = %q;\n", constants.PureFnArtifactIndexFile)
	out.WriteString("// The batch transport the SERVER build generates under <genDir>/rpc — see pkg/compiler/resolver/rpcgen.go.\n")
	fmt.Fprintf(out, "export const RPC_MODULE_DIR = %q;\n", constants.RpcModuleDir)
	fmt.Fprintf(out, "export const BATCHES_MODULE_FILE = %q;\n", constants.BatchesModuleFile)
	fmt.Fprintf(out, "export const RUNTYPES_BUNDLE_BASENAME = %q;\n", constants.RunTypesBundleBasename)
	fmt.Fprintf(out, "export const RUNTYPES_FILE_MODULE_DIR = %q;\n", constants.RunTypesFileModuleDir)
	fmt.Fprintf(out, "export const FNS_BUNDLE_DIR = %q;\n", constants.FnsBundleDir)
	out.WriteString("// Module-mode values for the --module-mode flag / plugin moduleMode option.\n")
	fmt.Fprintf(out, "export const MODULE_MODE_DEFAULT = %q;\n", constants.ModuleModeDefault)
	fmt.Fprintf(out, "export const MODULE_MODE_ALL_SINGLE = %q;\n", constants.ModuleModeAllSingle)
	fmt.Fprintf(out, "export const MODULE_MODE_ALL_MODULES = %q;\n", constants.ModuleModeAllModules)
	out.WriteString("export type ModuleMode = typeof MODULE_MODE_DEFAULT | typeof MODULE_MODE_ALL_SINGLE | typeof MODULE_MODE_ALL_MODULES;\n")
	out.WriteString("// Client-routes values for the --client-routes flag / plugin clientRoutes option.\n")
	fmt.Fprintf(out, "export const CLIENT_ROUTES_BUNDLE = %q;\n", constants.ClientRoutesBundle)
	fmt.Fprintf(out, "export const CLIENT_ROUTES_FETCH = %q;\n", constants.ClientRoutesFetch)
	out.WriteString("export type ClientRoutes = typeof CLIENT_ROUTES_BUNDLE | typeof CLIENT_ROUTES_FETCH;\n")
}

// tsKey wraps a key in quotes if it isn't a bare JS identifier. Keeps the
// generated object literal small for the common alphanumeric case.
func tsKey(key string) string {
	if isIdent(key) {
		return key
	}
	return fmt.Sprintf("%q", key)
}

func isIdent(s string) bool {
	if s == "" {
		return false
	}
	for i, char := range s {
		isLetter := char == '_' || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
		isDigit := char >= '0' && char <= '9'
		if i == 0 && !isLetter {
			return false
		}
		if !isLetter && !isDigit {
			return false
		}
	}
	return true
}
