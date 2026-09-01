package resolver

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// The lib guard closes the one hole the silent-`any` family cannot see.
//
// MKR007 / MKR013 / TMP001 all key on a type that resolved to the checker's
// ERROR type, and MKR013 additionally on a written type NAME. That covers a
// missing standard-library type well: on `lib: []` a `Set<string>` field raises
// MKR013 and the build stops.
//
// Array SUGAR writes no name. With no base ECMAScript edition in `lib`,
// TypeScript never declares the `Array` global, and the checker resolves
// `number[]` to an ordinary empty object rather than to the error type. Nothing
// is flagged: the build succeeds and the emitted validator accepts any value.
// That is the worst shape of failure this project has, so it is refused here.
//
// The test is "did the Program load a base edition", not a list of blessed lib
// selections. A maintained list would have to grow with every TypeScript
// release and would turn a routine tsgo bump into a broken build for consumers,
// while catching nothing our own lib matrix does not.

// libSelectionDiagnostic returns the CFG002 finding for a Program whose
// standard library cannot support reflection, or nil when the selection is
// sound. Anchored at the given file: the cause is the tsconfig, but a
// diagnostic needs a location a host can render, and every lane that reports
// this is reporting it about the files it was asked to scan.
func (sess *Session) libSelectionDiagnostic(anchorFile string) *diagnostics.Diagnostic {
	if sess.Program == nil {
		return nil
	}
	libSet := sess.Program.LoadedLibSet()
	if libSet.HasBaseEdition() {
		return nil
	}
	diagnostic := diagnostics.New(
		diagnostics.CodeUnsupportedLibSelection,
		diagnostics.Site{FilePath: anchorFile, StartLine: 1, StartCol: 1},
		libSet.String(),
	)
	return &diagnostic
}

// appendLibSelectionDiagnostic adds the CFG002 finding to a response's
// diagnostics when the project's standard library cannot support reflection.
// Both lanes that report per-file findings call it — the scan the linter drives
// and the transform the bundler drives — so the build stops wherever the
// consumer meets it first.
func (sess *Session) appendLibSelectionDiagnostic(into []diagnostics.Diagnostic, files []string) []diagnostics.Diagnostic {
	if len(files) == 0 {
		return into
	}
	if libDiagnostic := sess.libSelectionDiagnostic(files[0]); libDiagnostic != nil {
		return append(into, *libDiagnostic)
	}
	return into
}
