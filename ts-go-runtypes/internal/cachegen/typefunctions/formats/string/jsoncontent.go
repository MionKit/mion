// jsonContent — the JSON Schema contentMediaType: 'application/json' check
// (optionally behind contentEncoding: 'base64', where the media type
// describes the DECODED content per 2020-12). Self-contained IIFE, no
// pure-fn registration; sibling string keywords ride the same annotation's
// params so the collapse never sees a cross-family brand stack.
package string

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

const jsonContentFormatName = "jsonContent"

type jsonContentEmitter struct{}

func init() {
	formats.Register(jsonContentEmitter{})
}

func (jsonContentEmitter) Name() string {
	return jsonContentFormatName
}

func (jsonContentEmitter) Kind() protocol.ReflectionKind {
	return protocol.KindString
}

// jsonParseCheck builds the parse predicate: JSON.parse on the raw string,
// or on the base64-decoded bytes when the annotation says the content is
// encoded (atob ships in every supported runtime).
func jsonParseCheck(params map[string]any, vλl string) string {
	decoded := vλl
	if encoding, _ := params["decode"].(string); encoding == "base64" {
		decoded = "atob(" + vλl + ")"
	}
	return "((s) => {try {JSON.parse(" + strings.Replace(decoded, vλl, "s", 1) + ");return true;} catch {return false;}})(" + vλl + ")"
}

func (jsonContentEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	conditions := append([]string{jsonParseCheck(annotation.Params, vλl)}, stringConditions(ctx, annotation.Params, vλl)...)
	return strings.Join(conditions, " && ")
}

func (jsonContentEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	statements := []string{
		"if (!(" + jsonParseCheck(annotation.Params, vλl) + ")) " +
			formats.FormatErrCall(pathExpr, errorsArr, "string", jsonContentFormatName, "contentMediaType", "'application/json'"),
	}
	statements = append(statements, stringErrorStatements(ctx, annotation.Params, vλl, pathExpr, errorsArr, jsonContentFormatName)...)
	return strings.Join(statements, ";")
}
