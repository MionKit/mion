package resolver

import (
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/enrichment/enrichgen"
)

// checkEnrichFiles is the Request.CheckEnrich pass of OpScanFiles: the
// enrichment-health diagnostics (FamilyEnrich) for every requested file that
// looks like an enrichment mirror. It delegates to the shared enrichgen.CheckFile
// — the ONE implementation the CLI `enrich <file> --no-emit` lane uses too, so the
// editor lint surface and the command can never disagree — resolving each
// requested path against the Program's current directory for the breadcrumb-drift
// source link. Sites echo the REQUESTED path, matching the marker scanner's
// convention, so the consumer can key diagnostics back to the file it asked about.
func (sess *Session) checkEnrichFiles(files []string) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	if sess.Program == nil {
		return out
	}
	currentDir := sess.Program.TS.GetCurrentDirectory()
	for _, file := range files {
		sourceFile, err := sess.sourceFile(file)
		if err != nil || sourceFile == nil {
			continue
		}
		absolutePath := tspath.ResolvePath(currentDir, file)
		out = append(out, enrichgen.CheckFile(sourceFile, sess.checker, sess.cache, sess.Program.FS, file, absolutePath)...)
	}
	return out
}
