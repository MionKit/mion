package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

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
