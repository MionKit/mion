package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func compositeBodyForKind(t *testing.T, kind reflection.ReflectionKind, tag string) string {
	t.Helper()
	composite, ok := constants.JsonCompositeByTag(tag)
	if !ok {
		t.Fatalf("unknown composite tag %q", tag)
	}
	rt := &reflection.RunType{ID: "r1", Kind: kind}
	entry := collectJsonCompositeEntry(rt, tag, composite, RenderOpts{EmitMode: constants.EmitBoth}, nil, nil, false)
	if entry == nil {
		t.Fatalf("no composite entry for kind=%d tag=%s", kind, tag)
	}
	return entry.ArgsText
}

// Root undefined / void have no top-level JSON form: every encoder strategy must
// wrap the value in a one-element array so encode yields the valid document
// "[null]" instead of the bare JS value `undefined` (which JSON.parse rejects).
func TestRootWrap_UndefinedVoidEncodersWrap(t *testing.T) {
	for _, kind := range []reflection.ReflectionKind{reflection.KindUndefined, reflection.KindVoid} {
		for _, tag := range []string{"jeCL", "jeMU", "jeDI"} {
			body := compositeBodyForKind(t, kind, tag)
			if !strings.Contains(body, "JSON.stringify([") {
				t.Errorf("kind=%d %s encoder must array-wrap (JSON.stringify([…])); got:\n%s", kind, tag, body)
			}
		}
	}
}

// Decoders are deliberately unchanged: restoreFromJson for undefined/void is
// `return v = undefined`, so it yields undefined for ANY parsed input — the
// wrapped document round-trips with no decode-side unwrap.
func TestRootWrap_UndefinedDecodersUnchanged(t *testing.T) {
	for _, tag := range []string{"jdST", "jdPR"} {
		body := compositeBodyForKind(t, reflection.KindUndefined, tag)
		if !strings.Contains(body, "rjFn(") {
			t.Errorf("%s decoder should still call restoreFromJson; got:\n%s", tag, body)
		}
		if strings.Contains(body, "[0]") {
			t.Errorf("%s decoder should not need to unwrap [0]; got:\n%s", tag, body)
		}
	}
}

// A normal root type (plain object) must NOT be wrapped — its encode already
// produces a valid JSON document.
func TestRootWrap_NonWrapTypeUnchanged(t *testing.T) {
	for _, tag := range []string{"jeCL", "jeMU"} {
		body := compositeBodyForKind(t, reflection.KindObjectLiteral, tag)
		if strings.Contains(body, "JSON.stringify([") {
			t.Errorf("%s for a plain object must not array-wrap; got:\n%s", tag, body)
		}
	}
}
