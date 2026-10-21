package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// F2: a callable interface (an object literal carrying a call signature) is function-like, so DataOnly strips it to
// `never`. Every family, validate included, alwaysThrows at the root and drops it at a property, like a bare function.

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
	for _, fam := range []string{"prepareForJsonMutate", "prepareForJsonClone", "restoreFromJsonMutate", "restoreFromJsonClone"} {
		out := renderModule(t, dump, fam)
		if strings.Contains(out, "_cal(") {
			t.Errorf("[%s] a root callable interface should alwaysThrow (function-like), not render an object factory; got:\n%s", fam, out)
		}
	}

	// validate refuses it like a bare function at the root.
	if out := renderModule(t, dump, "validate"); strings.Contains(out, "=== 'function'") || !strings.Contains(out, "_cal','objectLiteral',,,,,,'") {
		t.Errorf("validate of a root callable interface should alwaysThrow; got:\n%s", out)
	}
}

// At a PROPERTY position the callable interface drops like a function-valued property, with the family's `-function-property-dropped` note.
func TestCallableInterface_PropertyDoesNotFailObject(t *testing.T) {
	parts := callableInterface("cal", true)
	propX := &reflection.RunType{ID: "px", Kind: reflection.KindPropertySignature, Name: "x", Child: makeRef("cal")}
	propY := &reflection.RunType{ID: "py", Kind: reflection.KindPropertySignature, Name: "y", Child: makeRef("str")}
	outer := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("px"), makeRef("py")}}
	dump := protocol.Dump{RunTypes: append(append([]*reflection.RunType{mkStr()}, parts...), propX, propY, outer)}

	functionDropCodes := map[string]string{
		"validate":              "validate-function-property-dropped",
		"prepareForJsonMutate":  "json-prepare-function-property-dropped",
		"prepareForJsonClone":   "json-prepare-clone-function-property-dropped",
		"restoreFromJsonMutate": "json-restore-function-property-dropped",
		"restoreFromJsonClone":  "json-restore-function-property-dropped",
	}
	for fam, code := range functionDropCodes {
		out, sink := renderWithDiag(t, dump, fam, "obj")
		// alwaysThrow renders the object entry as `_obj','<kind>',,,,,,'<message>'`.
		if strings.Contains(out, "_obj','objectLiteral',,,,,,'") {
			t.Errorf("[%s] `{x: callableInterface; y: string}` should drop x, not alwaysThrow the object; got:\n%s", fam, out)
		}
		if _, ok := findCode(sink, code); !ok {
			t.Errorf("[%s] dropping x must leave %s, got %v", fam, code, sink)
		}
	}
}

// F2b: a callable interface in an array element must render an alwaysThrow with the family's FUNCTION code, not vanish.
// A skipped entry left a dangling dep the JSON composite bound with an unguarded `getRT(key).fn` (`reading 'fn'`).
func TestF2b_CallableInArrayElementAlwaysThrows(t *testing.T) {
	functionRootCodes := map[string]string{
		"prepareForJsonMutate":  "json-prepare-function-root",
		"prepareForJsonClone":   "json-prepare-clone-function-root",
		"restoreFromJsonMutate": "json-restore-function-root",
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

// A callable interface VALUE is a function to DataOnly, so every value-position shortcut treats it like a bare function.
func valueSiteTypes(t *testing.T) (*EmitContext, map[string]*reflection.RunType) {
	t.Helper()
	ctx, types := formatPredicateTypes(t)
	register := func(rt *reflection.RunType) {
		types[rt.ID] = rt
		ctx.walker.RefTable[rt.ID] = rt
	}
	// A callable interface whose own property carries a transforming format.
	register(&reflection.RunType{ID: "cal_csig", Kind: reflection.KindCallSignature})
	register(&reflection.RunType{ID: "cal_pp", Kind: reflection.KindPropertySignature, Name: "p", IsSafeName: true, Child: makeRef("strTrim")})
	register(&reflection.RunType{ID: "cal", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("cal_csig"), makeRef("cal_pp")}})
	register(&reflection.RunType{ID: "idxCal", Kind: reflection.KindIndexSignature, Index: makeRef("str"), Child: makeRef("cal")})
	register(&reflection.RunType{ID: "recCal", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idxCal")}})
	register(&reflection.RunType{ID: "idxFn", Kind: reflection.KindIndexSignature, Index: makeRef("str"), Child: makeRef("fn")})
	register(&reflection.RunType{ID: "recFn", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idxFn")}})
	register(&reflection.RunType{ID: "pCal", Kind: reflection.KindProperty, Name: "x", IsSafeName: true, Child: makeRef("cal")})
	register(&reflection.RunType{ID: "objCal", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pCal")}})
	return ctx, types
}

func TestNonDataValueSites_IndexSignatureOfCallableLikeFunction(t *testing.T) {
	ctx, types := valueSiteTypes(t)
	if got, want := restoreKeyGuardReachable(types["recCal"], ctx), restoreKeyGuardReachable(types["recFn"], ctx); got != want {
		t.Errorf("restoreKeyGuardReachable: callable-interface record = %v, function record = %v", got, want)
	}
	if got, want := isNoopForRestoreJsonSafe(types["recCal"], ctx), isNoopForRestoreJsonSafe(types["recFn"], ctx); got != want {
		t.Errorf("isNoopForRestoreJsonSafe: callable-interface record = %v, function record = %v", got, want)
	}
}

func TestNonDataValueSites_FormatSkipsCallableProperty(t *testing.T) {
	ctx, types := valueSiteTypes(t)
	if !isNoopForFormatTransform(types["objCal"], ctx) {
		t.Error("formatTransform must skip a callable-interface property like a function one, not format its members")
	}
	if code := emitPropertyFormat(types["pCal"], ctx, "v"); code.Code != "" || code.Type != CodeS {
		t.Errorf("emitPropertyFormat on a callable-interface property = %+v, want an empty CodeS", code)
	}
}

func TestNonDataValueSites_CallableLeafLabelsAsFunction(t *testing.T) {
	ctx, types := valueSiteTypes(t)
	if got := leafKindLabel(types["cal"], ctx.ResolveRef); got != "Function" {
		t.Errorf("leafKindLabel(callable interface) = %q, want Function", got)
	}
	if got := leafKindLabel(types["cal"], nil); got != "Unsupported" {
		t.Errorf("leafKindLabel without a resolver = %q, want Unsupported: the call signature sits behind a ref", got)
	}
}
