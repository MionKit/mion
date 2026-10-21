package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// TestTsSignature_EveryFamilyHasARow: every emitted family tag types its fn, with one inner arg type per emitter arg, and
// no row names a tag nothing emits.
func TestTsSignature_EveryFamilyHasARow(t *testing.T) {
	emitted := map[string]int{}
	for _, spec := range Families {
		emitted[spec.Settings.Tag] = len(spec.Emitter.Args())
	}
	for _, variant := range operations.AllFnVariants() {
		if variant.Op.FamilyTag != "" {
			continue
		}
		tag, ok := constants.JsonCompositeTag(variant.Op.Name, variant.Strategy)
		if !ok {
			t.Fatalf("composite %s|%s has no tag", variant.Op.Name, variant.Strategy)
		}
		emitted[tag] = 1
	}
	for tag, argCount := range emitted {
		sig, ok := signatureFor(tag)
		if !ok {
			t.Errorf("family %q has no TS signature row", tag)
			continue
		}
		if len(sig.innerArgs) != argCount {
			t.Errorf("family %q types %d inner args, its emitter takes %d", tag, len(sig.innerArgs), argCount)
		}
	}
	for tag := range familySignatures {
		if _, ok := emitted[tag]; !ok {
			t.Errorf("signature row %q names no emitted family", tag)
		}
	}
}

func TestTsMarks_SplitJsAndTs(t *testing.T) {
	typed := &Walker{Typed: true}
	marked := "function f(v" + typed.tsAnn(": any") + ")" + typed.tsAnn(": v is T_x") + "{return true}"
	if got := JsText(marked); got != "function f(v){return true}" {
		t.Errorf("JsText = %q", got)
	}
	if got := TsText(marked); got != "function f(v: any): v is T_x{return true}" {
		t.Errorf("TsText = %q", got)
	}
	if untyped := (&Walker{}).tsAnn(": any"); untyped != "" {
		t.Errorf("an untyped walker marked %q", untyped)
	}
}

// TestTsMarks_QuotedLiteralNeverHoldsAMark: a user literal carrying the mark byte is escaped, so JsText cannot cut it.
func TestTsMarks_QuotedLiteralNeverHoldsAMark(t *testing.T) {
	if quoted := quoteJS("a" + tsMark + "b"); JsText(quoted) != quoted {
		t.Errorf("quoted literal %q holds a raw mark", quoted)
	}
}

func TestKeyLookupType(t *testing.T) {
	validate := operations.PlainHash("validate") + "_abc1234"
	if got := KeyLookupType(validate); got != "(v: any, ...rest: any[]) => v is T_abc1234" {
		t.Errorf("KeyLookupType(validate) = %q", got)
	}
	encoder, _ := operations.ByName("jsonEncoder")
	clone := operations.FnHashFor(encoder, nil, "clone", false) + "_abc1234"
	if got := KeyLookupType(clone); got != "(v: any, ...rest: any[]) => string | undefined" {
		t.Errorf("KeyLookupType(jeCL) = %q", got)
	}
	if got := KeyLookupType("@acme/app#pf_x"); got != "" {
		t.Errorf("a pure-fn key typed as %q", got)
	}
}

// TestTypeRefsIn_IgnoresARefInsideACacheKey: found by the typed-emit fuzz lane, a noop encoder `tx9T_<id>` spells
// `T_<id>` inside its own key and imported a type it never used (noUnusedLocals).
func TestTypeRefsIn_IgnoresARefInsideACacheKey(t *testing.T) {
	encoder, _ := operations.ByName("jsonEncoder")
	key := operations.FnHashFor(encoder, nil, "clone", false) + "_abc1234"
	if got := TypeRefsIn(key, nil, "'"+key+"','literal',,true"); len(got) != 0 {
		t.Errorf("TypeRefsIn = %v, want none", got)
	}
	if got := TypeRefsIn(key, nil, "(v: T_abc1234) => string"); len(got) != 1 {
		t.Errorf("TypeRefsIn = %v, want the root", got)
	}
}
