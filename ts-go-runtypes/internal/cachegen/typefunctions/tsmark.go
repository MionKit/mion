package typefunctions

import (
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

// TsAnn is the EmitContext face of Walker.tsAnn, for emitter-declared locals TypeScript cannot infer.
func (ctx *EmitContext) TsAnn(text string) string {
	return ctx.walker.tsAnn(text)
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
	return "T_" + typeID
}

// tsSignature is one family's typed fn shape; `%T` stands for the root's TypeRef.
type tsSignature struct {
	// params is the outer parameter list, as callers see the fn.
	params string
	// innerArgs types the inner declaration's parameters by position, matching the emitter's Args.
	innerArgs []string
	// result is the return type, shared by the inner declaration and the outer fn type.
	result string
}

const (
	sigValidate   = "validate"
	sigErrors     = "errors"
	sigSameType   = "sameType"
	sigToJson     = "toJson"
	sigFromJson   = "fromJson"
	sigEncoder    = "encoder"
	sigDecoder    = "decoder"
	sigJsonSchema = "jsonSchema"
	sigClassName  = "className"
)

var tsSignatures = map[string]tsSignature{
	sigValidate: {params: "(v: unknown)", innerArgs: []string{"any"}, result: "v is %T"},
	sigErrors: {
		params:    "(v: unknown, pth?: RTValidationErrorPathSegment[], er?: RTValidationError[])",
		innerArgs: []string{"any", "RTValidationErrorPathSegment[]", "RTValidationError[]"},
		result:    "RTValidationError[]",
	},
	sigSameType:   {params: "(v: %T)", innerArgs: []string{"any"}, result: "%T"},
	sigToJson:     {params: "(v: %T)", innerArgs: []string{"any"}, result: "unknown"},
	sigFromJson:   {params: "(v: unknown)", innerArgs: []string{"any"}, result: "%T"},
	sigEncoder:    {params: "(v: %T)", innerArgs: []string{"any"}, result: "string | undefined"},
	sigDecoder:    {params: "(s: string)", innerArgs: []string{"string"}, result: "%T"},
	sigJsonSchema: {params: "(v?: unknown)", innerArgs: []string{"any"}, result: "unknown"},
	sigClassName:  {params: "(v?: unknown)", innerArgs: []string{"any"}, result: "string | null"},
}

// familySignatures maps every emitted family tag to its signature; TestTsSignature_EveryFamilyHasARow pins the coverage.
var familySignatures = map[string]string{
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
	name, ok := familySignatures[tag]
	if !ok {
		return tsSignature{}, false
	}
	return tsSignatures[name], true
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
	return withType(sig.result, typeID)
}

// KeyFnType reads a `<fnHash>_<typeId>` cache key back to its family's outer fn type, empty when the hash is unknown.
func KeyFnType(key string) string {
	if len(key) <= operations.FnHashLen+1 || key[operations.FnHashLen] != '_' {
		return ""
	}
	variant, ok := operations.VariantForFnHash(key[:operations.FnHashLen])
	if !ok {
		return ""
	}
	tag := variant.Op.FamilyTag
	if tag == "" {
		tag, _ = constants.JsonCompositeTag(variant.Op.Name, variant.Strategy)
	}
	return FnType(tag, key[operations.FnHashLen+1:])
}

// KeyTypeID is the runtype id a `<fnHash>_<typeId>` cache key names, empty for any other key.
func KeyTypeID(key string) string {
	if KeyFnType(key) == "" {
		return ""
	}
	return key[operations.FnHashLen+1:]
}
