package resolver

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// The lib guard closes the one hole the silent-`any` family cannot see: array SUGAR writes no name,
// so with no base ECMAScript edition in `lib` the checker resolves `number[]` to an ordinary empty
// object instead of the error type, nothing fires and the emitted validator accepts any value. The
// test is "did the Program load a base edition", never a list of blessed lib selections: such a list
// would have to grow with every TypeScript release and catches nothing our own lib matrix does not.

// libSelectionDiagnostic returns the CFG002 finding for a Program whose standard library cannot
// support reflection. The cause is the tsconfig, but a diagnostic needs a location a host can render.
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

// appendLibSelectionDiagnostic adds the CFG002 finding to a response; both per-file lanes (the linter's
// scan and the bundler's transform) call it, so the build stops wherever the consumer meets it first.
func (sess *Session) appendLibSelectionDiagnostic(into []diagnostics.Diagnostic, files []string) []diagnostics.Diagnostic {
	if len(files) == 0 {
		return into
	}
	if libDiagnostic := sess.libSelectionDiagnostic(files[0]); libDiagnostic != nil {
		return append(into, *libDiagnostic)
	}
	return into
}
