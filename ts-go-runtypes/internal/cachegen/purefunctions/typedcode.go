package purefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/tsannotate"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// createPureFnTS is createPureFnJS for emitMode ts. It types the shipped JS rather than keeping the author's
// annotations, which name the author's own types and would need imports from user modules.
func createPureFnTS(code string, paramNames []string) string {
	return tsannotate.Function(createPureFnJS(code, paramNames))
}

// ambientNames are the free names a typed module must declare for code's `typeof` checks; none outside emitMode ts.
func ambientNames(code string, emitMode constants.EmitMode) []string {
	if !emitMode.EmitsTypes() {
		return nil
	}
	return tsannotate.TypeofOnlyNames("function(){" + code + "}")
}
