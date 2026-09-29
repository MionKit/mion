package resolver

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apiimports"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// checkApiImports runs on every scan (linter, dev server) and on generate (build); sites echo the REQUESTED path.
func (sess *Session) checkApiImports(files []string) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	if sess.Program == nil || sess.checker == nil {
		return out
	}
	for _, file := range files {
		if strings.Contains(file, "/node_modules/") {
			continue
		}
		sourceFile, err := sess.sourceFile(file)
		if err != nil || sourceFile == nil {
			continue
		}
		out = append(out, apiimports.CheckSourceFile(sess.checker, sess.marker, sourceFile, file)...)
	}
	return out
}
