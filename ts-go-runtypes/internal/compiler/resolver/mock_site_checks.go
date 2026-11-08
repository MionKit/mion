package resolver

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// mockRelevantFormatCodes make a mock throw or come out invalid; a mock-only site has no validator to raise them.
var mockRelevantFormatCodes = map[string]bool{
	diagnostics.CodeFMTInvalidParams:    true,
	diagnostics.CodeFMTSampleBounds:     true,
	diagnostics.CodeFMTSampleMismatch:   true,
	diagnostics.CodeFMTSampleGenFailed:  true,
	diagnostics.CodeFMTPatternTimeout:   true,
	diagnostics.CodeFMTMissingJsRuntime: true,
	diagnostics.CodeFMTGeneratorInvalid: true,
}

// mockSiteFormatDiagnostics must run after enrichPatternSamples, so a generated sample pool counts.
// No family walker covers a mock-only site, and the mock walks the whole graph, so every reachable format is checked.
func (sess *Session) mockSiteFormatDiagnostics(sites []protocol.Site) []diagnostics.Diagnostic {
	if sess == nil || sess.cache == nil {
		return nil
	}
	refTable := sess.cache.NodesView()
	var out []diagnostics.Diagnostic
	for _, site := range sites {
		root := refTable[site.ID]
		if !isMockOnlySite(site) || root == nil {
			continue
		}
		recorder := &formatProblemRecorder{ScratchEmitContext: formats.NewScratchEmitContext(), sess: sess, seen: map[string]bool{}}
		reflection.WalkGraph(root, refTable, func(node *reflection.RunType) reflection.WalkAction {
			recorder.check(node)
			return reflection.WalkContinue
		})
		if len(recorder.findings) == 0 {
			continue
		}
		diagSite := diagnostics.Site{FilePath: site.File}
		if sourceFile, err := sess.sourceFile(site.File); err == nil && sourceFile != nil {
			diagSite.StartLine, diagSite.StartCol = textpos.LineCol(sourceFile, site.Pos)
		}
		for _, finding := range recorder.findings {
			out = append(out, diagnostics.New(finding.Code, diagSite, finding.Args...))
		}
	}
	return out
}

// isMockOnlySite is a site demanding only scan.go's mockFormatTransformDemand: no validator is compiled for it.
func isMockOnlySite(site protocol.Site) bool {
	if site.ID == "" || site.FnId != "" || len(site.FnIds) != 0 || len(site.Demand) != 1 {
		return false
	}
	return site.Demand[0].FamilyTag == mockFormatTransformDemand()[0].FamilyTag
}

// formatProblemRecorder keeps only diagnostics: the scratch context discards emitted code and hoisted declarations.
type formatProblemRecorder struct {
	*formats.ScratchEmitContext
	sess     *Session
	findings []diskcache.CachedDiagnostic
	seen     map[string]bool
}

func (recorder *formatProblemRecorder) check(node *reflection.RunType) {
	emitter, ok := formats.LookupForRunType(node)
	if !ok {
		return
	}
	if validator, ok := emitter.(formats.ParamValidator); ok {
		for _, message := range validator.ValidateParams(node.FormatAnnotation) {
			recorder.EmitDiagnostic(diagnostics.CodeFMTInvalidParams, message)
		}
	}
	emitter.EmitValidateCheck(node.FormatAnnotation, "v", recorder)
}

func (recorder *formatProblemRecorder) EmitDiagnostic(code string, args ...string) {
	key := code + "\x00" + strings.Join(args, "\x00")
	if !mockRelevantFormatCodes[code] || recorder.seen[key] {
		return
	}
	recorder.seen[key] = true
	recorder.findings = append(recorder.findings, diskcache.CachedDiagnostic{Code: code, Args: args})
}

func (recorder *formatProblemRecorder) JSEngine() jsengine.Engine { return recorder.sess.opts.JSEngine }
func (recorder *formatProblemRecorder) PatternSampleCount() int {
	return recorder.sess.opts.PatternSampleCount
}

func (recorder *formatProblemRecorder) PatternGenFailure(source, flags string) formats.PatternGenFailure {
	return recorder.sess.patternGenFailures[source+"\x00"+flags]
}
