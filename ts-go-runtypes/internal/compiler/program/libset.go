package program

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// bundledLibDir is the directory the bundled tsgo standard library lives in.
// Membership of that directory is the only trustworthy "this file is part of
// the standard library" test — a basename check alone (`lib.` + `.d.ts`) also
// matches a consumer's own `src/lib.d.ts`. Same rule the projection's
// "is this type standard library" test uses
// (internal/cachegen/runtype/typeid.LibDeclaredGlobalOf).
//
// A var, not a const, so tests can stage a lib directory. Nothing in
// production ever assigns it.
var bundledLibDir = tspath.NormalizePath(bundled.LibPath())

// LibSet is the standard library a Program actually loaded: the resolved lib
// file basenames, sorted and deduped.
//
// It is read from the Program's own source files rather than re-derived from
// `lib` / `target`, because only the loaded set accounts for what a `full` lib
// pulls in, what one lib's `/// <reference>` chain adds, and the target's
// implicit default when no `lib` is written. Those three make the tsconfig
// spelling a poor stand-in for what the checker actually saw.
type LibSet struct {
	// Files are the lib basenames ("lib.es2022.d.ts", …), sorted.
	Files []string
}

// Empty reports whether the Program loaded no standard library at all
// (`lib: []`, `noLib`). Nothing can be reflected soundly in that state: with
// no `Array` global, `number[]` checks as an empty object and the emitted
// validator accepts anything, with no diagnostic anywhere.
func (set LibSet) Empty() bool { return len(set.Files) == 0 }

// baseEditionFile is the standard library's base ECMAScript edition. Every
// later edition builds on it through its reference chain, `dom` depends on it,
// and a bare `target` selects a `full` lib that includes it, so its presence is
// what separates a real lib selection from one that cannot support reflection.
//
// It is what declares `Array`, `Object`, `String`, `Number`, `Boolean` and
// `Function` — TypeScript's own required globals.
const baseEditionFile = "lib.es5.d.ts"

// HasBaseEdition reports whether the loaded set declares the required globals.
//
// False means reflection is UNSOUND and silently so. With no `Array` global the
// checker resolves `number[]` to an empty object instead of an array, and the
// emitted validator accepts any value with no diagnostic anywhere. Only three
// selections reach that state: `lib: []`, `noLib`, and a by-feature lib such as
// `["esnext.disposable"]` used without a base edition (a by-feature entry ADDS
// to an edition, it cannot replace one).
func (set LibSet) HasBaseEdition() bool {
	for _, file := range set.Files {
		if strings.EqualFold(file, baseEditionFile) {
			return true
		}
	}
	return false
}

// Fingerprint is a short stable digest of the loaded lib set, used to keep
// compiled artifacts from one lib selection being reused under another. Folded
// into the type-id hash salt and the disk-cache fingerprint, exactly as
// constants.Version is: the lib decides what a type MEANS, so it belongs on the
// same footing as the binary version. Bare `Uint8Array` is the plain example —
// its default argument `ArrayBufferLike` is `ArrayBuffer` up to es2016 and
// `ArrayBuffer | SharedArrayBuffer` from es2017, so the same source text names
// two different types depending on the consumer's tsconfig.
//
// An empty set fingerprints as "" so a no-lib Program is not silently given a
// well-formed salt; callers reject it before it gets that far.
func (set LibSet) Fingerprint() string {
	if len(set.Files) == 0 {
		return ""
	}
	digest := sha256.Sum256([]byte(strings.Join(set.Files, "\n")))
	return hex.EncodeToString(digest[:])[:12]
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
