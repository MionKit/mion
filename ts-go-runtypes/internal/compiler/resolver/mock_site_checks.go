package resolver

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// mockRelevantFormatCodes are the format findings that make a mock throw or come out invalid. The validate walk
// raises them at validate sites; a createMockDataFn site demands no validator, so it gets them here instead.
// Validator-only findings (an unsafe or unreadable pattern) stay with the sites that compile a validator.
var mockRelevantFormatCodes = map[string]bool{
	diagnostics.CodeFMTInvalidParams:    true,
	diagnostics.CodeFMTSampleBounds:     true,
	diagnostics.CodeFMTSampleMismatch:   true,
	diagnostics.CodeFMTSampleGenFailed:  true,
	diagnostics.CodeFMTPatternTimeout:   true,
	diagnostics.CodeFMTMissingJsRuntime: true,
}

// mockSiteFormatDiagnostics checks every format reachable from each createMockDataFn-only site, at any depth (union
// members, Map / Set entries included), with the same emitter checks a validate walk runs. Must run after
// enrichPatternSamples, so a generated sample pool counts. One diagnostic per site per distinct finding.
func (sess *Session) mockSiteFormatDiagnostics(sites []protocol.Site) []diagnostics.Diagnostic {
	if sess == nil || sess.cache == nil {
		return nil
	}
	refTable := sess.cache.NodesView()
	var out []diagnostics.Diagnostic
	for _, site := range sites {
		if !isMockOnlySite(site) {
			continue
		}
		root := refTable[site.ID]
		if root == nil {
			continue
		}
		recorder := &formatProblemRecorder{sess: sess}
		reflection.WalkGraph(root, refTable, func(node *reflection.RunType) reflection.WalkAction {
			recorder.check(node)
			return reflection.WalkContinue
		})
		if len(recorder.findings) == 0 {
			continue
		}
		diagSite := sess.mockDiagSite(site)
		for _, finding := range recorder.findings {
			out = append(out, diagnostics.New(finding.code, diagSite, finding.args...))
		}
	}
	return out
}

// isMockOnlySite is a site whose only demand is the fmt entry a mock-shaped signature adds (scan.go
// mockFormatTransformDemand): no fnId, so no validator is compiled for it.
func isMockOnlySite(site protocol.Site) bool {
	if site.ID == "" || site.FnId != "" || len(site.FnIds) != 0 || len(site.Demand) != 1 {
		return false
	}
	return site.Demand[0].FamilyTag == mockFormatTransformDemand()[0].FamilyTag
}

func (sess *Session) mockDiagSite(site protocol.Site) diagnostics.Site {
	diagSite := diagnostics.Site{FilePath: site.File}
	if sourceFile, err := sess.sourceFile(site.File); err == nil && sourceFile != nil {
		diagSite.StartLine, diagSite.StartCol = textpos.LineCol(sourceFile, site.Pos)
	}
	return diagSite
}

type formatFinding struct {
	code string
	args []string
}

// formatProblemRecorder runs a format's param checks and its validate emit for their diagnostics only: the emitted
// code and every hoisted declaration are discarded.
type formatProblemRecorder struct {
	sess     *Session
	findings []formatFinding
	seen     map[string]bool
	vars     int
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
	if !mockRelevantFormatCodes[code] {
		return
	}
	key := code + "\x00" + strings.Join(args, "\x00")
	if recorder.seen == nil {
		recorder.seen = map[string]bool{}
	}
	if recorder.seen[key] {
		return
	}
	recorder.seen[key] = true
	recorder.findings = append(recorder.findings, formatFinding{code: code, args: args})
}

func (*formatProblemRecorder) AddPureFnDependency(string)         {}
func (*formatProblemRecorder) UsePureFn(id string) string         { return "pf_" + id }
func (*formatProblemRecorder) HasContextItem(string) bool         { return false }
func (*formatProblemRecorder) SetContextItem(string, string)      {}
func (recorder *formatProblemRecorder) JSEngine() jsengine.Engine { return recorder.sess.opts.JSEngine }
func (recorder *formatProblemRecorder) PatternSampleCount() int {
	return recorder.sess.opts.PatternSampleCount
}

func (recorder *formatProblemRecorder) PatternGenFailure(source, flags string) formats.PatternGenFailure {
	return recorder.sess.patternGenFailures[source+"\x00"+flags]
}

func (recorder *formatProblemRecorder) NextLocalVar(prefix string) string {
	recorder.vars++
	return prefix + "_" + strconv.Itoa(recorder.vars)
}
