package program

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// bundledLibDir membership is the only trustworthy "this file is a standard library file" test: a basename
// check (`lib.` + `.d.ts`) also matches a consumer's own `src/lib.d.ts`. Same rule as
// internal/cachegen/runtype/typeid.LibDeclaredGlobalOf. A var, not a const, so tests can stage a lib dir.
var bundledLibDir = tspath.NormalizePath(bundled.LibPath())

// LibSet is the standard library a Program actually loaded, read from its source files rather than from
// `lib` / `target`: only the loaded set accounts for what a `full` lib pulls in, what a `/// <reference>`
// chain adds, and the target's implicit default when no `lib` is written.
type LibSet struct {
	// Files are the lib basenames ("lib.es2022.d.ts", …), sorted.
	Files []string
}

// Empty means no standard library at all (`lib: []`, `noLib`), where nothing can be reflected soundly:
// with no `Array` global, `number[]` checks as an empty object and its validator accepts anything.
func (set LibSet) Empty() bool { return len(set.Files) == 0 }

// baseEditionFile is the base ECMAScript edition every later one builds on, and it declares TypeScript's
// required globals (`Array`, `Object`, `String`, `Number`, `Boolean`, `Function`).
const baseEditionFile = "lib.es5.d.ts"

// HasBaseEdition reports whether the loaded set declares the required globals; false means reflection is
// silently UNSOUND. Only `lib: []`, `noLib` and a by-feature lib without a base edition reach that state
// (a by-feature entry ADDS to an edition, it cannot replace one).
func (set LibSet) HasBaseEdition() bool {
	for _, file := range set.Files {
		if strings.EqualFold(file, baseEditionFile) {
			return true
		}
	}
	return false
}

// String renders the set for a diagnostic message.
func (set LibSet) String() string {
	if len(set.Files) == 0 {
		return "(none)"
	}
	return strings.Join(set.Files, ", ")
}

// LoadedLibSet reads the standard-library files the Program resolved.
func (prog *Program) LoadedLibSet() LibSet {
	seen := make(map[string]struct{})
	files := make([]string, 0, 8)
	for _, sourceFile := range prog.TS.SourceFiles() {
		if sourceFile == nil {
			continue
		}
		fileName := tspath.NormalizePath(sourceFile.FileName())
		if !strings.HasPrefix(fileName, bundledLibDir) {
			continue
		}
		base := fileName
		if i := strings.LastIndexByte(base, '/'); i >= 0 {
			base = base[i+1:]
		}
		if _, ok := seen[base]; ok {
			continue
		}
		seen[base] = struct{}{}
		files = append(files, base)
	}
	sort.Strings(files)
	return LibSet{Files: files}
}
