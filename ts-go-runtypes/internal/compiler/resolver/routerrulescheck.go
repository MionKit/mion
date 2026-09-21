package resolver

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/routerrules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// checkRouterRuleFiles is the Request.CheckRouterRules pass of OpScanFiles (FamilyMionRoute), off by
// default with the lint plugin as its only caller: these are lint findings, a build must never fail on
// one, while `mion compile` does exit non-zero on any Error-severity diagnostic it collects. Sites echo
// the REQUESTED path, as the marker scanner and the enrichment pass do, so the consumer can key each
// finding back to the file it asked about.
func (sess *Session) checkRouterRuleFiles(files []string) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	if sess.Program == nil || sess.checker == nil {
		return out
	}
	for _, file := range files {
		sourceFile, err := sess.sourceFile(file)
		if err != nil || sourceFile == nil {
			continue
		}
		out = append(out, routerrules.CheckSourceFile(sess.checker, sess.marker, sourceFile, file)...)
	}
	return out
}
