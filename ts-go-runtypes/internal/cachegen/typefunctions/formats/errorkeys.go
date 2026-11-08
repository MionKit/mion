package formats

import (
	"regexp"
	"sort"
	"strconv"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// errorKeyPattern matches the `formatPath:['<key>']` segment FormatErrCallWith writes; a test pins the pairing.
var errorKeyPattern = regexp.MustCompile(`formatPath:\['([^']*)'\]`)

// ScanErrorKeys returns every error key the emitted validation-errors code can push, sorted and deduped.
func ScanErrorKeys(code string) []string {
	seen := map[string]bool{}
	for _, match := range errorKeyPattern.FindAllStringSubmatch(code, -1) {
		seen[match[1]] = true
	}
	return sortedKeys(seen)
}

// ErrorKeysFor returns the error keys a format-annotated RunType can produce, read from its own emitted code.
func ErrorKeysFor(rt *reflection.RunType) []string {
	if rt == nil || rt.FormatAnnotation == nil {
		return nil
	}
	return ErrorKeysForParams(rt.Kind, rt.FormatAnnotation.Name, rt.FormatAnnotation.Params)
}

// ErrorKeysForParams scans the emitter's validation-errors code; a panic yields no keys, so enrichment never crashes.
func ErrorKeysForParams(kind reflection.ReflectionKind, name string, params map[string]any) (keys []string) {
	emitter, ok := Lookup(kind, name)
	if !ok {
		return nil
	}
	defer func() {
		if recover() != nil {
			keys = nil
		}
	}()
	annotation := &reflection.FormatAnnotation{Name: name, Params: params}
	return ScanErrorKeys(emitter.EmitValidationErrorsCheck(annotation, "v", "pth", "er", NewScratchEmitContext()))
}

// ScratchEmitContext is the EmitContext for a throwaway emit whose code is discarded: hoists and pure-fn uses are
// dropped, diagnostics ignored. The error-key scan uses it as is; a caller that wants the diagnostics embeds it.
type ScratchEmitContext struct {
	items    map[string]bool
	counters map[string]int
}

// NewScratchEmitContext returns an empty ScratchEmitContext.
func NewScratchEmitContext() *ScratchEmitContext {
	return &ScratchEmitContext{items: map[string]bool{}, counters: map[string]int{}}
}

func (*ScratchEmitContext) AddPureFnDependency(string)         {}
func (*ScratchEmitContext) UsePureFn(id string) string         { return "pf_" + id }
func (ctx *ScratchEmitContext) HasContextItem(key string) bool { return ctx.items[key] }
func (ctx *ScratchEmitContext) SetContextItem(key, _ string)   { ctx.items[key] = true }
func (*ScratchEmitContext) EmitDiagnostic(string, ...string)   {}
func (*ScratchEmitContext) JSEngine() jsengine.Engine          { return nil }
func (*ScratchEmitContext) PatternSampleCount() int            { return 0 }
func (*ScratchEmitContext) PatternGenFailure(_, _ string) PatternGenFailure {
	return PatternGenFailure{}
}

func (ctx *ScratchEmitContext) NextLocalVar(prefix string) string {
	ctx.counters[prefix]++
	return prefix + strconv.Itoa(ctx.counters[prefix])
}

func sortedKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// AllErrorKeys returns every error key a format can produce: the union over its errorKeySamples.
func AllErrorKeys(name string) []string {
	emitter, ok := emitterByName(name)
	if !ok {
		return nil
	}
	seen := map[string]bool{}
	for _, params := range errorKeySamples[name] {
		for _, key := range ErrorKeysForParams(emitter.Kind(), name, params) {
			seen[key] = true
		}
	}
	return sortedKeys(seen)
}

// HasErrorKeySamples reports whether errorKeySamples covers the format.
func HasErrorKeySamples(name string) bool {
	return len(errorKeySamples[name]) > 0
}

// SampledParams returns the params a format's samples set, plus the ones excluded on purpose.
func SampledParams(name string) []string {
	seen := map[string]bool{}
	for _, params := range errorKeySamples[name] {
		for key := range params {
			seen[key] = true
		}
	}
	for key := range excludedParams[name] {
		seen[key] = true
	}
	return sortedKeys(seen)
}

// ExcludedParams returns a format's deliberately unsampled params, keyed to the reason.
func ExcludedParams(name string) map[string]string {
	return excludedParams[name]
}

func emitterByName(name string) (Emitter, bool) {
	for _, emitter := range Registered() {
		if emitter.Name() == name {
			return emitter, true
		}
	}
	return nil, false
}

// EveryErrorKey returns the union of AllErrorKeys over every registered format.
func EveryErrorKey() []string {
	seen := map[string]bool{}
	for _, emitter := range Registered() {
		for _, key := range AllErrorKeys(emitter.Name()) {
			seen[key] = true
		}
	}
	return sortedKeys(seen)
}

// SampledFormatNames returns every format name errorKeySamples or excludedParams mentions.
func SampledFormatNames() []string {
	seen := map[string]bool{}
	for name := range errorKeySamples {
		seen[name] = true
	}
	for name := range excludedParams {
		seen[name] = true
	}
	return sortedKeys(seen)
}
