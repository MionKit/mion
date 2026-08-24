package resolver

import (
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/constants"
)

// virtualImportRE matches an entry-module import specifier in generated code —
// `from 'rtmod:/<basename>.js'` — capturing the basename. Both the
// inter-module imports baked into generated module sources and the import block
// the transform injects into user files use this exact single-quoted shape, so
// one pattern relativizes both.
var virtualImportRE = regexp.MustCompile(
	`from '` + regexp.QuoteMeta(constants.EntryModulePrefix) + `([^']+)` + regexp.QuoteMeta(constants.EntryModuleSuffix) + `'`,
)

// relativizeModuleImports rewrites every rtmod: import inside a generated
// module's source into a path relative to that module. Both modules live under
// <outDir>/types, so this is pure basename arithmetic — no outDir / filesystem
// access needed. Applied when materializing modules to disk so the files
// resolve natively in any bundler.
func relativizeModuleImports(moduleBasename, source string) string {
	return virtualImportRE.ReplaceAllStringFunc(source, func(match string) string {
		dep := virtualImportRE.FindStringSubmatch(match)[1]
		return "from '" + relWithinTypes(moduleBasename, dep) + "'"
	})
}

// RelativizeUserImports rewrites the rtmod: specifiers in `code` into paths
// relative to filePath, pointing at <outDir>/types/<basename>.js. Exported for
// the compile CLI ([internal/compile]), which relativizes the EMITTED .js
// against its OUTPUT location (not the source location the plugin uses); the
// rtmod: specifiers survive tsgo emit unresolved, so one pass fixes them.
func RelativizeUserImports(filePath, outDir, code string) string {
	return relativizeUserImports(filePath, outDir, code)
}

// relativizeUserImports rewrites the rtmod: specifiers in a transformed
// USER file's injected import block into paths relative to that file, pointing
// at <outDir>/types/<basename>.js. The import block is a single physical line,
// so rewriting only the specifier text (never adding newlines) keeps the source
// map the transform generated valid. A specifier whose bases can't be related
// (mismatched abs/rel) is left untouched.
func relativizeUserImports(filePath, outDir, code string) string {
	return virtualImportRE.ReplaceAllStringFunc(code, func(match string) string {
		dep := virtualImportRE.FindStringSubmatch(match)[1]
		rel := relUserToType(filePath, outDir, dep)
		if rel == "" {
			return match
		}
		return "from '" + rel + "'"
	})
}

// relWithinTypes is the specifier from one module (fromBasename) to a sibling
// dep (depBasename) under the same types/ root: POSIX-relative, `./`-prefixed,
// with the module extension.
func relWithinTypes(fromBasename, depBasename string) string {
	return ensureDotPrefix(relPosix(path.Dir(fromBasename), depBasename)) + moduleFileExt
}

// relUserToType is the specifier from a user file to <outDir>/types/<dep>.js.
// Empty when filepath.Rel can't relate the two (e.g. mismatched abs/rel bases),
// in which case the caller keeps the original specifier.
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

// ensureDotPrefix makes a relative specifier import-resolvable: a bare
// `foo/bar` becomes `./foo/bar`; `../x` and `./x` are left alone.
func ensureDotPrefix(rel string) string {
	if strings.HasPrefix(rel, ".") {
		return rel
	}
	return "./" + rel
}
