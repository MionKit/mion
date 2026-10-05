package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/routerrules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// checkRouterRuleFiles runs only for the lint plugin (Request.CheckRouterRules): a build must never stop on these.
// Sites echo the REQUESTED path so the consumer can key each finding back to the file it asked about.
func (sess *Session) checkRouterRuleFiles(files []string) []diagnostics.Diagnostic {
	return sess.checkEachFile(files, routerrules.CheckSourceFile)
}

// checkApiTypeImports drops findings in dependency sources (not the user's to fix) by TypeScript's provenance, not path.
func (sess *Session) checkApiTypeImports(files []string) []diagnostics.Diagnostic {
	return sess.dropExternalLibraryDiagnostics(sess.checkEachFile(files, apimeta.ApiTypeImports))
}

// checkEachFile runs a per-file check over files, skipping any the Program does not hold.
func (sess *Session) checkEachFile(files []string, check func(*checker.Checker, marker.Options, *ast.SourceFile, string) []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	if sess.Program == nil || sess.checker == nil {
		return out
	}
	for _, file := range files {
		sourceFile, err := sess.sourceFile(file)
		if err != nil || sourceFile == nil {
			continue
		}
		out = append(out, check(sess.checker, sess.marker, sourceFile, file)...)
	}
	return out
}

func (sess *Session) checkDrizzleFiles(files []string) []diagnostics.Diagnostic {
	if sess.Program == nil || sess.checker == nil {
		return nil
	}
	var out []diagnostics.Diagnostic
	for _, file := range files {
		sourceFile, err := sess.sourceFile(file)
		// Dependency findings are discarded anyway; avoid instantiating their implementation types.
		if err != nil || sourceFile == nil || sess.Program.TS.IsSourceFileFromExternalLibrary(sourceFile) {
			continue
		}
		out = append(out, routerrules.CheckDrizzleSourceFile(sess.checker, sess.marker, sourceFile, file)...)
	}
	return sess.dropExternalLibraryDiagnostics(out)
}
