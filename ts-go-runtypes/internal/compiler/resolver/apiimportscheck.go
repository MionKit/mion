package resolver

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apiimports"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// checkApiImports runs the `initClient` API type import check over files, on every scan (the linter and the dev
// server) and on generate (the build). Sites echo the REQUESTED path, as the other per-file passes do.
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
