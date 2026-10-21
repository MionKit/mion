package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// familyEntry renders one family for a dump and returns the entry for id, with the code string's
// escaped quotes unescaped so assertions read as the emitted JS.
func familyEntry(t *testing.T, runTypes []*reflection.RunType, family, id string) string {
	t.Helper()
	out := renderModule(t, protocol.Dump{RunTypes: runTypes}, family)
	line := extractInitLine(out, operations.PlainHash(family)+"_"+id)
	if line == "" {
		t.Fatalf("no %s entry for %s in:\n%s", family, id, out)
	}
	return strings.ReplaceAll(line, `\'`, "'")
}

// patternRecordFixture is `{[k: \`d_${string}\`]: <value>}` as the object `rec`, over the value
// node(s) given.
func patternRecordFixture(valueID string, values ...*reflection.RunType) []*reflection.RunType {
	rec := &reflection.RunType{ID: "rec", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idx")}}
	return append(append(values, templateKeyIndex("idx", "d_", valueID)...), rec)
}

// A template-literal index signature is open on every codec road; only validation refuses a key matching no pattern.
// removeUnknownKeys still drops that key: its clone must never share a value with its input.
func TestPatternKey_EncodersCopyANonMatchingKey(t *testing.T) {
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	fixture := patternRecordFixture("num", num)
	// The clone road and the compact road (keyed through the same clone) share the sweep: the
	// pattern arm first, then the untouched copy.
	for _, family := range []string{"prepareForJsonClone", "compactForJson"} {
		entry := familyEntry(t, fixture, family, "rec")
		if !strings.Contains(entry, "if (reIdx0.test(k0)) { _r[k0] = v[k0]; continue; }_r[k0] = v[k0];}") {
			t.Errorf("[%s] a key matching no pattern must be copied after the pattern arm; got:\n%s", family, entry)
		}
	}
	for _, id := range []string{"rec", "idx"} {
		entry := familyEntry(t, fixture, "removeUnknownKeys", id)
		if !strings.Contains(entry, "if (reIdx0.test(k0)) { _r[k0] = v[k0]; continue; }}") || strings.Contains(entry, "continue; }_r[k0]") {
			t.Errorf("[removeUnknownKeys/%s] a key matching no pattern must be dropped, not shared by reference; got:\n%s", id, entry)
		}
	}
	// A bare pattern signature at the root copies it too.
	root := familyEntry(t, fixture, "prepareForJsonClone", "idx")
	if !strings.Contains(root, "if (!reIdx0.test(k0)) {_r[k0] = v[k0]; continue;}") {
		t.Errorf("[prepareForJsonClone] the root pattern sweep must copy a non-matching key; got:\n%s", root)
	}
}

// The decoders leave a non-matching key alone: only the value arm is gated by the pattern.
func TestPatternKey_DecodersLeaveANonMatchingKeyAlone(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	keyed := patternRecordFixture("inner", str, propA, inner)

	for _, family := range []string{"restoreFromJsonMutate", "compactFromJson", "restoreFromJsonClone"} {
		entry := familyEntry(t, keyed, family, "rec")
		if !strings.Contains(entry, "if (!reIdx0.test(k0)) continue;") || strings.Contains(entry, "= undefined") || strings.Contains(entry, "delete ") {
			t.Errorf("[%s] a key matching no pattern must be left as is; got:\n%s", family, entry)
		}
	}
}
