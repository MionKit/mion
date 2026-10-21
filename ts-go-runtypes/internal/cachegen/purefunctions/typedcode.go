package purefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/tsannotate"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// createPureFnTS types the shipped JS: the author's annotations name their own types, which need user-module imports.
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
