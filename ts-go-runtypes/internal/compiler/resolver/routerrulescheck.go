package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/routerrules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// checkRouterRuleFiles is the Request.CheckRouterRules pass of OpScanFiles (FamilyMionRoute), off by
// default with the lint plugin as its only caller: these are lint findings, a build must never fail on
// one, while `mion compile` does exit non-zero on any Error-severity diagnostic it collects. Sites echo
// the REQUESTED path, as the marker scanner and the enrichment pass do, so the consumer can key each
// finding back to the file it asked about.
func (sess *Session) checkRouterRuleFiles(files []string) []diagnostics.Diagnostic {
	return sess.checkEachFile(files, routerrules.CheckSourceFile)
}

// checkApiTypeImports runs SRV001 on every scan (linter, dev server) and on generate (build). A dependency's own
// source is not the user's to fix, so its findings are dropped by TypeScript's own provenance, not by path.
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
