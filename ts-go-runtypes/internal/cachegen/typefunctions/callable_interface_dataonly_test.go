package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// F2: a callable interface (an object literal carrying a call signature) is
// function-like everywhere — DataOnly strips it to `never`. validate guards it
// with `typeof === 'function'` at the ROOT; the serializers alwaysThrow at the
// root and drop it at a property, exactly like a bare function. Before the fix
// the serializers walked it as a plain object and serialized its data props,
// disagreeing with validate (the cross-family inconsistency the fuzzer found).

func callableInterface(id string, withProp bool) []*reflection.RunType {
	csig := &reflection.RunType{ID: id + "_csig", Kind: reflection.KindCallSignature}
	children := []*reflection.RunType{makeRef(id + "_csig")}
	out := []*reflection.RunType{csig}
	if withProp {
		prop := &reflection.RunType{ID: id + "_pp", Kind: reflection.KindPropertySignature, Name: "p", Child: makeRef("str")}
		out = append(out, prop)
		children = append(children, makeRef(id+"_pp"))
	}
	out = append(out, &reflection.RunType{ID: id, Kind: reflection.KindObjectLiteral, Children: children})
	return out
}

func TestCallableInterface_FunctionLikeAtRoot(t *testing.T) {
	parts := callableInterface("cal", true)
	dump := protocol.Dump{RunTypes: append([]*reflection.RunType{mkStr()}, parts...)}

	// Every serializer treats a root callable interface as function-like →
	// alwaysThrow (no real `_cal(` factory body).
	for _, fam := range []string{"prepareForJson", "prepareForJsonSafe", "stringifyJson", "restoreFromJson", "toBinary", "fromBinary"} {
		out := renderModule(t, dump, fam)
		if strings.Contains(out, "_cal(") {
			t.Errorf("[%s] a root callable interface should alwaysThrow (function-like), not render an object factory; got:\n%s", fam, out)
		}
	}

	// validate treats it as a function — same as a bare function at the root.
	if out := renderModule(t, dump, "validate"); !strings.Contains(out, "=== 'function'") {
		t.Errorf("validate of a root callable interface should use a typeof-function guard; got:\n%s", renderModule(t, dump, "validate"))
	}
}

// At a PROPERTY position the callable interface must NOT make the containing
// object alwaysThrow — it is dropped (absorbed) like a function-valued property.
// (The deeper "x is dropped, not serialized as an object" behavior is exercised
// end-to-end by the non-data fuzz lane.)
func TestCallableInterface_PropertyDoesNotFailObject(t *testing.T) {
	parts := callableInterface("cal", true)
	propX := &reflection.RunType{ID: "px", Kind: reflection.KindPropertySignature, Name: "x", Child: makeRef("cal")}
	propY := &reflection.RunType{ID: "py", Kind: reflection.KindPropertySignature, Name: "y", Child: makeRef("str")}
	outer := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("px"), makeRef("py")}}
	dump := protocol.Dump{RunTypes: append(append([]*reflection.RunType{mkStr()}, parts...), propX, propY, outer)}

	for _, fam := range []string{"validate", "prepareForJson", "prepareForJsonSafe", "stringifyJson", "restoreFromJson", "toBinary", "fromBinary"} {
		out := renderModule(t, dump, fam)
		// alwaysThrow renders the object entry as `_obj','<kind>',,,,,,'<message>'`
		// (typeName then five holes, then a quoted `Cannot …` message); a dropped
		// property leaves the object a noop or a real factory, never that.
		if strings.Contains(out, "_obj','objectLiteral',,,,,,'") {
			t.Errorf("[%s] `{x: callableInterface; y: string}` should drop x, not alwaysThrow the object; got:\n%s", fam, out)
		}
	}
}

// F2b: a callable interface at a PROPAGATING position (array element) must
// render a controlled alwaysThrow carrying the family's FUNCTION code, NOT be
// silently skipped. The serializers latch the callable OBJECTLITERAL as the
// unsupported leaf; without callableLeafSubstitute the diag code resolved to ""
// and the entry vanished, leaving a dangling dependency that the JSON composite
// later bound with an unguarded `getRT(key).fn` (runtime `reading 'fn'`) and a
// binary site couldn't resolve ("no id injected"). The function code in the
// rendered module is the proof the entry is now present + controlled.
func TestF2b_CallableInArrayElementAlwaysThrows(t *testing.T) {
	functionRootCodes := map[string]string{
		"prepareForJson":     "PJ003",
		"prepareForJsonSafe": "PJS003",
		"restoreFromJson":    "RJ003",
		"stringifyJson":      "SJ003",
		"toBinary":           "TB003",
		"fromBinary":         "FB003",
	}
	parts := callableInterface("cal", true)
	arr := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef("cal")}
	dump := protocol.Dump{RunTypes: append(append([]*reflection.RunType{mkStr()}, parts...), arr)}

	for fam, code := range functionRootCodes {
		out, sink := renderWithDiag(t, dump, fam, "arr")
		// The callable element renders an alwaysThrow with the FUNCTION code —
		// before the fix the entry was silently skipped, so the code never appeared.
		if !strings.Contains(out, code) {
			t.Errorf("[%s] `Array<callableInterface>` must render a controlled alwaysThrow carrying %s, not silently skip the element; got:\n%s", fam, code, out)
		}
		// The array root surfaces the same function code as an Error-severity build
		// diagnostic (a callable interface at a propagating slot must fail).
		if got, ok := findCode(sink, code); ok && got.Severity != diagnostics.SeverityError {
			t.Errorf("[%s] %s severity = %v, want Error", fam, code, got.Severity)
		}
	}
}
