// objectFormat — key-count bounds and closedness for JSON objects. One
// emitter registered under BOTH base kinds JSON objects project as:
// objectLiteral (covers records too — a Record is an objectLiteral with an
// index-signature member) and the bare `object` keyword.
package structural

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/jsquote"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

const objectFormatName = "objectFormat"

type objectFormatEmitter struct {
	kind protocol.ReflectionKind
}

func init() {
	formats.Register(objectFormatEmitter{kind: protocol.KindObjectLiteral})
	formats.Register(objectFormatEmitter{kind: protocol.KindObject})
}

func (objectFormatEmitter) Name() string {
	return objectFormatName
}

func (emitter objectFormatEmitter) Kind() protocol.ReflectionKind {
	return emitter.kind
}

// readClosedKeys reads the `closed` param — the ALLOWED key list additional
// properties are checked against. Empty list = no keys allowed (the bare
// `additionalProperties: false` schema). Emitted by the JSON Schema
// translation from the schema's own `properties`, never hand-authored.
func readClosedKeys(params map[string]any) ([]string, bool) {
	raw, present := params["closed"]
	if !present {
		return nil, false
	}
	rawList, isList := raw.([]any)
	if !isList {
		return nil, false
	}
	keys := make([]string, 0, len(rawList))
	for _, item := range rawList {
		if str, isString := item.(string); isString {
			keys = append(keys, str)
		}
	}
	return keys, true
}

func closedKeysLiteral(keys []string) string {
	quoted := make([]string, len(keys))
	for i, key := range keys {
		quoted[i] = jsquote.Single(key)
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}

// closedKeyTest builds the per-key closedness predicate: declared keys plus
// any patternProperties sources (a key matching a pattern is NOT additional
// per 2020-12, so `additionalProperties: false` must let it through).
func closedKeyTest(params map[string]any, keys []string) string {
	test := closedKeysLiteral(keys) + ".includes(k)"
	if sources, ok := readStringListParam(params, "closedPatterns"); ok {
		for _, source := range sources {
			test += " || new RegExp(" + jsquote.Double(source) + ").test(k)"
		}
	}
	return test
}

// readStringListParam reads a string-tuple param ([]any of strings).
func readStringListParam(params map[string]any, key string) ([]string, bool) {
	raw, present := params[key]
	if !present {
		return nil, false
	}
	rawList, isList := raw.([]any)
	if !isList {
		return nil, false
	}
	values := make([]string, 0, len(rawList))
	for _, item := range rawList {
		if str, isString := item.(string); isString {
			values = append(values, str)
		}
	}
	return values, len(values) > 0
}

func objectConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if value, ok := formats.ReadNumberParam(params, "minProperties"); ok {
		conditions = append(conditions, "Object.keys("+vλl+").length >= "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "maxProperties"); ok {
		conditions = append(conditions, "Object.keys("+vλl+").length <= "+formats.FormatNumber(value))
	}
	if keys, ok := readClosedKeys(params); ok {
		conditions = append(conditions, "Object.keys("+vλl+").every((k) => "+closedKeyTest(params, keys)+")")
	}
	return conditions
}

func (objectFormatEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	return strings.Join(objectConditions(annotation.Params, vλl), " && ")
}

func (objectFormatEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, _ formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	params := annotation.Params
	var statements []string
	if value, ok := formats.ReadNumberParam(params, "minProperties"); ok {
		statements = append(statements,
			"if (Object.keys("+vλl+").length < "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "object", objectFormatName, "minProperties", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "maxProperties"); ok {
		statements = append(statements,
			"if (Object.keys("+vλl+").length > "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "object", objectFormatName, "maxProperties", formats.FormatNumber(value)))
	}
	if keys, ok := readClosedKeys(params); ok {
		test := "Object.keys(" + vλl + ").every((k) => " + closedKeyTest(params, keys) + ")"
		statements = append(statements,
			"if (!("+test+")) "+formats.FormatErrCall(pathExpr, errorsArr, "object", objectFormatName, "closed", "true"))
	}
	return strings.Join(statements, ";")
}

func (objectFormatEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	maxValue, hasMax := formats.ReadNumberParam(params, "maxProperties")
	minValue, hasMin := formats.ReadNumberParam(params, "minProperties")
	if hasMax && hasMin && maxValue < minValue {
		errs = append(errs, "ObjectFormat: `maxProperties` cannot be less than `minProperties`")
	}
	return errs
}
