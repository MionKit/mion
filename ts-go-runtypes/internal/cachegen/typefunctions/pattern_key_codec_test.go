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

// A template-literal index signature is open on every codec road, exactly like a plain one: the
// pattern selects the value transform for the keys it matches and a key matching no pattern is
// carried as is. Validation is the only place that refuses it. cloneExactShape is neither an
// encoder nor a decoder: its clone must never share a value with its input, so it keeps dropping
// a key matching no pattern.
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
		entry := familyEntry(t, fixture, "cloneExactShape", id)
		if !strings.Contains(entry, "if (reIdx0.test(k0)) { _r[k0] = v[k0]; continue; }}") || strings.Contains(entry, "continue; }_r[k0]") {
			t.Errorf("[cloneExactShape/%s] a key matching no pattern must be dropped, not shared by reference; got:\n%s", id, entry)
		}
	}
	// The direct road writes it the way native JSON would, after the pattern arm.
	direct := familyEntry(t, fixture, "stringifyJson", "rec")
	if !strings.Contains(direct, "if (reIdx0.test(k0)) {if (v[k0] !== undefined) ls0.push(JSON.stringify(k0) + ':' + v[k0]); continue;}const s0 = JSON.stringify(v[k0]); if (s0 !== undefined) ls0.push(JSON.stringify(k0) + ':' + s0);") {
		t.Errorf("[stringifyJson] a key matching no pattern must be written as native JSON writes it; got:\n%s", direct)
	}
	// A bare pattern signature at the root copies it too.
	root := familyEntry(t, fixture, "prepareForJsonClone", "idx")
	if !strings.Contains(root, "if (!reIdx0.test(k0)) {_r[k0] = v[k0]; continue;}") {
		t.Errorf("[prepareForJsonClone] the root pattern sweep must copy a non-matching key; got:\n%s", root)
	}
}

// The strip pre-pass (uku through its wire variant) and the mutate decoders leave a non-matching
// key alone: only the value arm is gated by the pattern, and an atomic value has nothing to sweep.
func TestPatternKey_DecodersLeaveANonMatchingKeyAlone(t *testing.T) {
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	atomic := patternRecordFixture("num", num)
	keyed := patternRecordFixture("inner", str, propA, inner)

	blanking := familyEntry(t, atomic, "stripUnknownKeysWire", "rec")
	if strings.Contains(blanking, "= undefined") || !strings.Contains(blanking, ",,true") {
		t.Errorf("[stripUnknownKeysWire] a pattern over atomic values has nothing to blank; got:\n%s", blanking)
	}
	gated := familyEntry(t, keyed, "stripUnknownKeysWire", "rec")
	if !strings.Contains(gated, "if (!reIdx0.test(k0)) continue;") || strings.Contains(gated, "v[k0] = undefined") {
		t.Errorf("[stripUnknownKeysWire] the pattern must gate the value arm only; got:\n%s", gated)
	}
	for _, family := range []string{"restoreFromJsonMutate", "compactFromJson", "restoreFromJsonClone"} {
		entry := familyEntry(t, keyed, family, "rec")
		if !strings.Contains(entry, "if (!reIdx0.test(k0)) continue;") || strings.Contains(entry, "= undefined") || strings.Contains(entry, "delete ") {
			t.Errorf("[%s] a key matching no pattern must be left as is; got:\n%s", family, entry)
		}
	}
}

// An object runs ONE key sweep for all its index signatures under the direct encoder: the string
// and number halves of a split key used to sweep once each and write every key twice, and a plain
// signature beside a pattern one did the same.
func TestStringifyJson_OneSweepForEveryIndexSignature(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	byString := &reflection.RunType{ID: "idxS", Kind: reflection.KindIndexSignature, Index: makeRef("str"), Child: makeRef("num")}
	byNumber := &reflection.RunType{ID: "idxN", Kind: reflection.KindIndexSignature, Index: makeRef("num"), Child: makeRef("num")}
	split := &reflection.RunType{ID: "rec", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idxS"), makeRef("idxN")}}
	// The entry line carries the code string and its closure twin, so the sweeps are counted on the
	// code string alone.
	codeString := func(entry string) string { return entry[:strings.Index(entry, "function g_")] }
	entry := codeString(familyEntry(t, []*reflection.RunType{str, num, byString, byNumber, split}, "stringifyJson", "rec"))
	if strings.Count(entry, "for (const") != 1 || !strings.Contains(entry, "'{'+[ctxFn0(v)].filter(Boolean).join(',')+'}'") {
		t.Errorf("a split key must sweep once; got:\n%s", entry)
	}
	plusPattern := &reflection.RunType{ID: "rec", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idxS"), makeRef("idx")}}
	entry = codeString(familyEntry(t, append([]*reflection.RunType{str, num, byString, plusPattern}, templateKeyIndex("idx", "d_", "num")...), "stringifyJson", "rec"))
	if strings.Count(entry, "for (const") != 1 || strings.Contains(entry, "reIdx0") {
		t.Errorf("a plain signature admits every key, so the pattern one after it adds no arm; got:\n%s", entry)
	}
}
