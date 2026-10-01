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

// ErrorKeysForParams runs the registered emitter's validation-errors code for params and scans it.
// Params the emitter cannot handle yield no keys rather than a panic: enrichment must never crash on them.
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
	return ScanErrorKeys(emitter.EmitValidationErrorsCheck(annotation, "v", "pth", "er", newKeyCollectCtx()))
}

// keyCollectCtx is the EmitContext for a throwaway emit whose only use is the error keys it names.
type keyCollectCtx struct {
	items    map[string]bool
	counters map[string]int
}

func newKeyCollectCtx() *keyCollectCtx {
	return &keyCollectCtx{items: map[string]bool{}, counters: map[string]int{}}
}

func (*keyCollectCtx) AddPureFnDependency(string)                      {}
func (*keyCollectCtx) UsePureFn(id string) string                      { return "pf_" + id }
func (ctx *keyCollectCtx) HasContextItem(key string) bool              { return ctx.items[key] }
func (ctx *keyCollectCtx) SetContextItem(key, _ string)                { ctx.items[key] = true }
func (*keyCollectCtx) EmitDiagnostic(string, ...string)                {}
func (*keyCollectCtx) JSEngine() jsengine.Engine                       { return nil }
func (*keyCollectCtx) PatternSampleCount() int                         { return 0 }
func (*keyCollectCtx) PatternGenFailure(_, _ string) PatternGenFailure { return PatternGenFailure{} }

func (ctx *keyCollectCtx) NextLocalVar(prefix string) string {
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

// HasErrorKeySamples reports whether a format has at least one entry in errorKeySamples.
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
