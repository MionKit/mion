package resolver

import (
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// virtualImportRE captures the basename in `from 'rtmod:/<basename>.js'`; generated module sources and the
// injected import block share that exact single-quoted shape, so one pattern relativizes both.
var virtualImportRE = regexp.MustCompile(
	`from '` + regexp.QuoteMeta(constants.EntryModulePrefix) + `([^']+)` + regexp.QuoteMeta(constants.EntryModuleSuffix) + `'`,
)

// rpcImportRE captures the file under <outDir>/rpc in the batch transport's `import 'rtrpc:/<file>'`, appended
// to a router-init module; a side-effect import has no `from`, hence its own pattern.
var rpcImportRE = regexp.MustCompile(
	`import '` + regexp.QuoteMeta(constants.RpcModulePrefix) + `([^']+)'`,
)

// apiImportRE captures the basename under <outDir>/api in a dispatch site's `from 'rtapi:/<basename>.js'`.
var apiImportRE = regexp.MustCompile(
	`from '` + regexp.QuoteMeta(constants.ApiModulePrefix) + `([^']+)` + regexp.QuoteMeta(constants.EntryModuleSuffix) + `'`,
)

// apiSideEffectImportRE captures `import 'rtapi:/lane.js'`, appended to a module calling `initClient`: the twin
// of rpcImportRE, a side-effect import has no `from`.
var apiSideEffectImportRE = regexp.MustCompile(
	`import '` + regexp.QuoteMeta(constants.ApiModulePrefix) + `([^']+)` + regexp.QuoteMeta(constants.EntryModuleSuffix) + `'`,
)

// relativizeModuleImports rewrites a generated module's rtmod: imports relative to that module, applied when
// modules are materialized to disk so they resolve natively in any bundler. Both modules live under
// <outDir>/types, so this is pure basename arithmetic, no outDir or filesystem access needed.
func relativizeModuleImports(moduleBasename, source string) string {
	return virtualImportRE.ReplaceAllStringFunc(source, func(match string) string {
		dep := virtualImportRE.FindStringSubmatch(match)[1]
		return "from '" + relWithinTypes(moduleBasename, dep) + "'"
	})
}

// RelativizeUserImports is exported for the compile CLI ([internal/compiler/batchcompile]), which relativizes
// the EMITTED .js against its OUTPUT location, not the source location the plugin uses; rtmod: specifiers
// survive tsgo emit unresolved, so one pass fixes them.
func RelativizeUserImports(filePath, outDir, code string) string {
	return relativizeUserImports(filePath, outDir, code)
}

// relativizeUserImports rewrites a transformed USER file's injected import block relative to that file. The
// block is a single physical line, so rewriting only the specifier text (never adding newlines) keeps the
// transform's source map valid. A specifier whose bases can't be related (mismatched abs/rel) is left alone.
func relativizeUserImports(filePath, outDir, code string) string {
	code = virtualImportRE.ReplaceAllStringFunc(code, func(match string) string {
		dep := virtualImportRE.FindStringSubmatch(match)[1]
		rel := relUserToType(filePath, outDir, dep)
		if rel == "" {
			return match
		}
		return "from '" + rel + "'"
	})
	code = rpcImportRE.ReplaceAllStringFunc(code, func(match string) string {
		file := rpcImportRE.FindStringSubmatch(match)[1]
		rel := relUserToRpc(filePath, outDir, file)
		if rel == "" {
			return match
		}
		return "import '" + rel + "'"
	})
	code = apiSideEffectImportRE.ReplaceAllStringFunc(code, func(match string) string {
		basename := apiSideEffectImportRE.FindStringSubmatch(match)[1]
		rel := relUserToApi(filePath, outDir, basename)
		if rel == "" {
			return match
		}
		return "import '" + rel + "'"
	})
	return apiImportRE.ReplaceAllStringFunc(code, func(match string) string {
		basename := apiImportRE.FindStringSubmatch(match)[1]
		rel := relUserToApi(filePath, outDir, basename)
		if rel == "" {
			return match
		}
		return "from '" + rel + "'"
	})
}

// relUserToApi is the bundled-API twin of relUserToType, empty when the two paths cannot be related.
func relUserToApi(filePath, outDir, basename string) string {
	target := filepath.Join(outDir, constants.ApiModuleDir, filepath.FromSlash(basename))
	rel, err := filepath.Rel(filepath.Dir(filePath), target)
	if err != nil {
		return ""
	}
	return ensureDotPrefix(filepath.ToSlash(rel)) + moduleFileExt
}

// relUserToRpc is the batch-transport twin of relUserToType, empty when the two paths cannot be related.
func relUserToRpc(filePath, outDir, file string) string {
	target := filepath.Join(outDir, constants.RpcModuleDir, filepath.FromSlash(file))
	rel, err := filepath.Rel(filepath.Dir(filePath), target)
	if err != nil {
		return ""
	}
	return ensureDotPrefix(filepath.ToSlash(rel))
}

// relWithinTypes is the specifier from one module to a sibling dep under the same types/ root.
func relWithinTypes(fromBasename, depBasename string) string {
	return ensureDotPrefix(relPosix(path.Dir(fromBasename), depBasename)) + moduleFileExt
}

// relUserToType is the specifier from a user file to <outDir>/types/<dep>.js, empty when filepath.Rel can't
// relate the two (mismatched abs/rel bases) and the caller then keeps the original specifier.
func relUserToType(filePath, outDir, depBasename string) string {
	target := filepath.Join(outDir, typesSubdir, filepath.FromSlash(depBasename))
	rel, err := filepath.Rel(filepath.Dir(filePath), target)
	if err != nil {
		return ""
	}
	return ensureDotPrefix(filepath.ToSlash(rel)) + moduleFileExt
}

// relPosix returns target relative to baseDir, both slash-separated POSIX paths.
func relPosix(baseDir, target string) string {
	if baseDir == "." || baseDir == "" {
		return target
	}
	baseParts := strings.Split(baseDir, "/")
	targetParts := strings.Split(target, "/")
	common := 0
	for common < len(baseParts) && common < len(targetParts) && baseParts[common] == targetParts[common] {
		common++
	}
	segments := make([]string, 0, len(baseParts)-common+len(targetParts)-common)
	for i := common; i < len(baseParts); i++ {
		segments = append(segments, "..")
	}
	segments = append(segments, targetParts[common:]...)
	if len(segments) == 0 {
		return "."
	}
	return strings.Join(segments, "/")
}

// ensureDotPrefix makes a relative specifier import-resolvable. The check is on the `./` / `../` segment, not
// the first byte: a dot-folder target like `.mion/types/x.js` starts with a dot yet is BARE until prefixed.
func ensureDotPrefix(rel string) string {
	if rel == "." || rel == ".." || strings.HasPrefix(rel, "./") || strings.HasPrefix(rel, "../") {
		return rel
	}
	return "./" + rel
}
