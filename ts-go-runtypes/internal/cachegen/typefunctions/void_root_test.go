package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TestVoidRoot_ReturnsUndefinedWithoutWritingTheParam: a void / undefined root returns `undefined` directly, so the
// parameter is never write-only (TypeScript's noUnusedParameters rejects one in emitMode ts).
func TestVoidRoot_ReturnsUndefinedWithoutWritingTheParam(t *testing.T) {
	for _, kind := range []reflection.ReflectionKind{reflection.KindVoid, reflection.KindUndefined} {
		dump := protocol.Dump{RunTypes: []*reflection.RunType{{ID: "root", Kind: kind}}}
		for _, family := range []string{"restoreFromJsonMutate", "compactFromJson"} {
			module := renderModule(t, dump, family)
			if strings.Contains(module, "v = undefined") {
				t.Errorf("%s over kind %d writes its parameter:\n%s", family, kind, module)
			}
		}
	}
}
