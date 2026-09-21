package resolver

import (
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/enrichgen"
)

// checkEnrichFiles is the Request.CheckEnrich pass of OpScanFiles (FamilyEnrich), over every requested
// file that looks like an enrichment mirror. It delegates to enrichgen.CheckFile, the ONE implementation
// the CLI `enrich <file> --no-emit` lane uses too, so editor lint and the command can never disagree;
// the resolved absolute path is what the breadcrumb-drift source link needs. Sites echo the REQUESTED
// path, as the marker scanner does, so the consumer can key each diagnostic back to the file it asked about.
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
		out = append(out, enrichgen.CheckFile(sourceFile, sess.checker, sess.cache, sess.marker, file, absolutePath)...)
	}
	return out
}
