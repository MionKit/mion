package typefunctions

import (
	"slices"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// tsMark brackets a TS-only fragment in emitted text: JsText drops the whole span, TsText keeps its content.
// jsquote escapes every C0 control, so a quoted user literal never carries the raw byte.
const tsMark = "\x02"

// tsAnn marks text as TS-only; empty unless the walker renders typed output, so untyped output never holds a mark.
func (w *Walker) tsAnn(text string) string {
	return tsAnnIf(w != nil && w.Typed, text)
}

// tsAnnIf marks text when typed, for renderers with no walker.
func tsAnnIf(typed bool, text string) string {
	if !typed || text == "" {
		return ""
	}
	return tsMark + text + tsMark
}

// JsText drops every marked span, giving back the plain JS the code slot ships.
func JsText(text string) string {
	if !strings.Contains(text, tsMark) {
		return text
	}
	var out strings.Builder
	parts := strings.Split(text, tsMark)
	for i, part := range parts {
		if i%2 == 0 {
			out.WriteString(part)
		}
	}
	return out.String()
}

// TsText keeps the marked spans' content, giving the typed factory text.
func TsText(text string) string {
	return strings.ReplaceAll(text, tsMark, "")
}

// TypeRef is the name a typed module gives the printed type of runtype id.
func TypeRef(typeID string) string {
	return constants.TypeRefPrefix + typeID
}

// TypeRefsIn lists the type ids a typed entry's text names: its own and its deps', each kept only when text spells it.
func TypeRefsIn(key string, deps []string, text string) []string {
	var ids []string
	for _, candidate := range append([]string{key}, deps...) {
		typeID := KeyTypeID(candidate)
		if typeID != "" && !slices.Contains(ids, typeID) && spellsIdentifier(text, TypeRef(typeID)) {
			ids = append(ids, typeID)
		}
	}
	return ids
}

// spellsIdentifier reports name standing alone in text, not as part of a longer identifier on either side.
func spellsIdentifier(text, name string) bool {
	for offset := 0; ; {
		index := strings.Index(text[offset:], name)
		if index < 0 {
			return false
		}
		start := offset + index
		end := start + len(name)
		if (start == 0 || !isIdentPart(text[start-1])) && (end == len(text) || !isIdentPart(text[end])) {
			return true
		}
		offset = end
	}
}

// tsSignature is one family's typed fn shape; `%T` stands for the root's TypeRef.
type tsSignature struct {
	// params is the outer parameter list, as callers see the fn.
	params string
	// innerArgs types the inner declaration's parameters by position, matching the emitter's Args.
	innerArgs []string
	// result is the outer fn type's return type.
	result string
	// loose marks a transform family: its any-typed body cannot meet a precise result (a `never` one rejects even
	// `any`), so the inner declaration returns `any` and the factory casts it to the outer fn type.
	loose bool
}

var (
	sigValidate = tsSignature{params: "(v: unknown)", innerArgs: []string{"any"}, result: "v is %T"}
	sigErrors   = tsSignature{
		params:    "(v: unknown, pth?: RTValidationErrorPathSegment[], er?: RTValidationError[])",
		innerArgs: []string{"any", "RTValidationErrorPathSegment[]", "RTValidationError[]"},
		result:    "RTValidationError[]",
	}
	sigSameType   = tsSignature{params: "(v: %T)", innerArgs: []string{"any"}, result: "%T", loose: true}
	sigToJson     = tsSignature{params: "(v: %T)", innerArgs: []string{"any"}, result: "unknown"}
	sigFromJson   = tsSignature{params: "(v: unknown)", innerArgs: []string{"any"}, result: "%T", loose: true}
	sigEncoder    = tsSignature{params: "(v: %T)", innerArgs: []string{"any"}, result: "string | undefined"}
	sigDecoder    = tsSignature{params: "(s: string)", innerArgs: []string{"string"}, result: "%T", loose: true}
	sigJsonSchema = tsSignature{params: "(v?: unknown)", innerArgs: []string{"any"}, result: "unknown"}
	sigClassName  = tsSignature{params: "(v?: unknown)", innerArgs: []string{"any"}, result: "string | null"}
)

// familySignatures maps every emitted family tag to its signature; TestTsSignature_EveryFamilyHasARow pins the coverage.
var familySignatures = map[string]tsSignature{
	"val": sigValidate, "vst": sigValidate, "vuk": sigValidate,
	"verr": sigErrors, "vest": sigErrors, "veuk": sigErrors,
	"ruk": sigSameType, "ruks": sigSameType, "rukr": sigSameType, "fmt": sigSameType,
	"pj": sigToJson, "pjs": sigToJson, "cj": sigToJson,
	"rj": sigFromJson, "rjs": sigFromJson, "cjr": sigFromJson,
	"jeCL": sigEncoder, "jeMU": sigEncoder, "jeCO": sigEncoder,
	"jdCL": sigDecoder, "jdMU": sigDecoder, "jdCO": sigDecoder,
	"jsc": sigJsonSchema,
	"csr": sigClassName,
}

func signatureFor(tag string) (tsSignature, bool) {
	sig, ok := familySignatures[tag]
	return sig, ok
}

func withType(text, typeID string) string {
	return strings.ReplaceAll(text, "%T", TypeRef(typeID))
}

// FnType is the outer fn type of family tag over typeID, empty for an unknown tag.
func FnType(tag, typeID string) string {
	sig, ok := signatureFor(tag)
	if !ok {
		return ""
	}
	return withType(sig.params+" => "+sig.result, typeID)
}

// innerArgType types the inner declaration's argument at index, empty past the signature's list.
func innerArgType(tag string, index int) string {
	sig, ok := signatureFor(tag)
	if !ok || index >= len(sig.innerArgs) {
		return ""
	}
	return sig.innerArgs[index]
}

// innerResult is the inner declaration's return type over typeID, empty for an unknown tag.
func innerResult(tag, typeID string) string {
	sig, ok := signatureFor(tag)
	if !ok {
		return ""
	}
	if sig.loose {
		return "any"
	}
	return withType(sig.result, typeID)
}

// closureTypes is the factory's typed `utl` parameter, return type and inner-fn cast for family tag over typeID, every
// part a tsMark span and all empty unless typed.
func closureTypes(typed bool, tag, typeID string) ClosureTypes {
	types := ClosureTypes{Utl: tsAnnIf(typed, ": RTUtils")}
	if fnType := FnType(tag, typeID); fnType != "" {
		types.Result = tsAnnIf(typed, ": "+fnType)
		types.ReturnCast = tsAnnIf(typed, returnCast(tag, typeID))
	}
	return types
}

// returnCast is the TS-only cast a loose family's factory applies to the inner fn it returns, empty otherwise.
func returnCast(tag, typeID string) string {
	if sig, ok := signatureFor(tag); ok && sig.loose {
		return " as unknown as " + FnType(tag, typeID)
	}
	return ""
}

// keyFamily reads a `<fnHash>_<typeId>` cache key back to its family tag and type id, empty for any other key.
func keyFamily(key string) (tag, typeID string) {
	if len(key) <= operations.FnHashLen+1 || key[operations.FnHashLen] != '_' {
		return "", ""
	}
	variant, ok := operations.VariantForFnHash(key[:operations.FnHashLen])
	if !ok {
		return "", ""
	}
	tag = variant.Op.FamilyTag
	if tag == "" {
		tag, _ = constants.JsonCompositeTag(variant.Op.Name, variant.Strategy)
	}
	if _, known := signatureFor(tag); !known {
		return "", ""
	}
	return tag, key[operations.FnHashLen+1:]
}

// KeyLookupType types a dependency lookup: the family's result over `any` inputs, the only values a generated body holds,
// which a `never` input type would refuse.
func KeyLookupType(key string) string {
	tag, typeID := keyFamily(key)
	sig, ok := signatureFor(tag)
	if !ok {
		return ""
	}
	return "(v: any, ...rest: any[]) => " + withType(sig.result, typeID)
}

// KeyTypeID is the runtype id a `<fnHash>_<typeId>` cache key names, empty for any other key.
func KeyTypeID(key string) string {
	_, typeID := keyFamily(key)
	return typeID
}
