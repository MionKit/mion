package structural

// formattedObject, key-count bounds and closedness for JSON objects. One emitter registered under BOTH base
// kinds a JSON object projects as: objectLiteral, which covers records too, and the bare `object` keyword.

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

const formattedObjectName = "formattedObject"

// identityChainMaxKeys: up to this many declared keys the allowed-key test is a chain of identity compares, with
// no hashing and nothing allocated; above it a hoisted Set wins on the O(1) lookup.
// Most JSON Schema objects declare a handful of properties, so the chain is the common case.
const identityChainMaxKeys = 8

type formattedObjectEmitter struct {
	kind reflection.ReflectionKind
}

func init() {
	formats.Register(formattedObjectEmitter{kind: reflection.KindObjectLiteral})
	formats.Register(formattedObjectEmitter{kind: reflection.KindObject})
}

func (formattedObjectEmitter) Name() string {
	return formattedObjectName
}

func (emitter formattedObjectEmitter) Kind() reflection.ReflectionKind {
	return emitter.kind
}

// readClosedKeys reads the `closed` param, the ALLOWED key list; an empty list allows no key at all.
// The JSON Schema translation emits it from the schema's own `properties`, it is never hand-authored.
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

// readStringListParam reads a string-tuple param.
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

// hoistConst hoists a `const <name> = <init>` into the factory prologue, mirroring emitPatternTest
// (formats/string/pattern.go) and the index-signature key-regex hoist (validate.go).
// "" means there was no context to hoist into and the caller builds inline: reachable only from direct emitter
// tests, never from the resolver, which always supplies a context.
func hoistConst(ctx formats.EmitContext, prefix, init string) string {
	if ctx == nil {
		return ""
	}
	name := ctx.NextLocalVar(prefix)
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = "+init)
	}
	return name
}

// keyAllowTest decides whether key `keyVar` is allowed rather than additional: a declared key, or one matching a
// patternProperties source, since per 2020-12 a key matching a pattern is NOT additional.
// Everything reusable is hoisted into the factory prologue, so nothing is rebuilt per call or per key.
// No allowed keys and no patterns yields the constant `false`: every key is additional, so only `{}` validates.
func keyAllowTest(ctx formats.EmitContext, params map[string]any, keys []string, keyVar string) string {
	var tests []string
	if len(keys) > 0 {
		if len(keys) <= identityChainMaxKeys {
			for _, key := range keys {
				tests = append(tests, keyVar+" === "+jsquote.Single(key))
			}
		} else if setVar := hoistConst(ctx, "ksObj", "new Set("+closedKeysLiteral(keys)+")"); setVar != "" {
			tests = append(tests, setVar+".has("+keyVar+")")
		} else {
			tests = append(tests, closedKeysLiteral(keys)+".includes("+keyVar+")")
		}
	}
	if sources, ok := readStringListParam(params, "closedPatterns"); ok {
		for _, source := range sources {
			reVar := hoistConst(ctx, "reObj", "new RegExp("+jsquote.Double(source)+")")
			if reVar == "" {
				reVar = "new RegExp(" + jsquote.Double(source) + ")"
			}
			tests = append(tests, reVar+".test("+keyVar+")")
		}
	}
	if len(tests) == 0 {
		return "false"
	}
	return strings.Join(tests, " || ")
}

// objectWalkBody builds ONE per-key sweep covering every object keyword at once: the count for minProperties /
// maxProperties and the allowed-key test for `additionalProperties: false`.
// One `for…in` with early returns, the shape emitIndexSignatureValidate uses (validate.go): no `Object.keys`
// array and no `.every` callback per key.
func objectWalkBody(ctx formats.EmitContext, params map[string]any, objVar string) string {
	minValue, hasMin := formats.ReadNumberParam(params, "minProperties")
	maxValue, hasMax := formats.ReadNumberParam(params, "maxProperties")
	keys, hasClosed := readClosedKeys(params)
	if !hasMin && !hasMax && !hasClosed {
		return ""
	}
	needCount := hasMin || hasMax
	var body strings.Builder
	if needCount {
		body.WriteString("let n = 0;")
	}
	body.WriteString("for (const k in " + objVar + ") {")
	if needCount {
		body.WriteString("n++;")
	}
	if hasClosed {
		body.WriteString("if (!(" + keyAllowTest(ctx, params, keys, "k") + ")) return false;")
	}
	body.WriteString("}")
	if !needCount {
		body.WriteString("return true")
		return body.String()
	}
	var bounds []string
	if hasMin {
		bounds = append(bounds, "n >= "+formats.FormatNumber(minValue))
	}
	if hasMax {
		bounds = append(bounds, "n <= "+formats.FormatNumber(maxValue))
	}
	body.WriteString("return " + strings.Join(bounds, " && "))
	return body.String()
}

// objectWalkCall hoists the sweep into a factory-prologue function so the closure is built once per factory
// rather than once per validator call; without a context the same body runs as an IIFE.
func objectWalkCall(ctx formats.EmitContext, params map[string]any, vλl string) string {
	body := objectWalkBody(ctx, params, "o")
	if body == "" {
		return ""
	}
	if fnVar := hoistConst(ctx, "okObj", "function(o){"+body+"}"); fnVar != "" {
		return fnVar + "(" + vλl + ")"
	}
	return "((o) => {" + body + "})(" + vλl + ")"
}

// countWalkCall hoists a bare key-count sweep: the errors lane needs the count on its own so each bound reports
// under its own keyword. `for…in` counting allocates nothing where `Object.keys(v).length` builds a throwaway
// array, the same trade countEnumKeys documents.
func countWalkCall(ctx formats.EmitContext, vλl string) string {
	body := "let n = 0;for (const k in o) n++;return n"
	if fnVar := hoistConst(ctx, "cntObj", "function(o){"+body+"}"); fnVar != "" {
		return fnVar + "(" + vλl + ")"
	}
	return "((o) => {" + body + "})(" + vλl + ")"
}

// closedWalkCall hoists the allowed-key sweep alone, for the errors lane's closedness statement.
func closedWalkCall(ctx formats.EmitContext, params map[string]any, keys []string, vλl string) string {
	body := "for (const k in o) {if (!(" + keyAllowTest(ctx, params, keys, "k") + ")) return false;}return true"
	if fnVar := hoistConst(ctx, "ckObj", "function(o){"+body+"}"); fnVar != "" {
		return fnVar + "(" + vλl + ")"
	}
	return "((o) => {" + body + "})(" + vλl + ")"
}

func (formattedObjectEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	return objectWalkCall(ctx, annotation.Params, vλl)
}

func (formattedObjectEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	params := annotation.Params
	var statements []string
	minValue, hasMin := formats.ReadNumberParam(params, "minProperties")
	maxValue, hasMax := formats.ReadNumberParam(params, "maxProperties")
	// One hoisted count fn shared by both bounds, or the prologue would carry two identical functions.
	countCall := ""
	if hasMin || hasMax {
		countCall = countWalkCall(ctx, vλl)
	}
	if hasMin {
		statements = append(statements,
			"if ("+countCall+" < "+formats.FormatNumber(minValue)+") "+formats.FormatErrCall(pathExpr, errorsArr, "object", formattedObjectName, "minProperties", formats.FormatNumber(minValue)))
	}
	if hasMax {
		statements = append(statements,
			"if ("+countCall+" > "+formats.FormatNumber(maxValue)+") "+formats.FormatErrCall(pathExpr, errorsArr, "object", formattedObjectName, "maxProperties", formats.FormatNumber(maxValue)))
	}
	if keys, ok := readClosedKeys(params); ok {
		statements = append(statements,
			"if (!("+closedWalkCall(ctx, params, keys, vλl)+")) "+formats.FormatErrCall(pathExpr, errorsArr, "object", formattedObjectName, "closed", "true"))
	}
	return strings.Join(statements, ";")
}

// ValidateParams reports bound contradictions at build time, the AOT twin of the JS-side validateParams.
func (formattedObjectEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	maxValue, hasMax := formats.ReadNumberParam(params, "maxProperties")
	minValue, hasMin := formats.ReadNumberParam(params, "minProperties")
	if hasMax && hasMin && maxValue < minValue {
		errs = append(errs, "FormattedObject: `maxProperties` cannot be less than `minProperties`")
	}
	return errs
}
