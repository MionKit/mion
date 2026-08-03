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

// identityChainMaxKeys — at or below this many declared keys the allowed-key
// test is a chain of `k === 'a'` identity compares (a pointer compare each,
// no hashing, nothing allocated); above it a prologue-hoisted Set wins on the
// O(1) lookup. Most JSON Schema objects declare a handful of properties, so
// the chain is the common case.
const identityChainMaxKeys = 8

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

// hoistConst hoists a `const <name> = <init>` declaration into the factory
// prologue and returns the name, mirroring emitPatternTest (formats/string/
// pattern.go) and the index-signature key-regex hoist (validate.go). Returns
// "" when there is no context to hoist into, so callers fall back to an
// inline construction — reachable only from direct emitter tests, never from
// the resolver, which always supplies a context.
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

// keyAllowTest builds the boolean expression deciding whether key `keyVar` is
// allowed rather than additional: a declared key, or a key matching one of the
// patternProperties sources (per 2020-12 a key matching a pattern is NOT
// additional, so `additionalProperties: false` must let it through).
//
// Everything reusable is hoisted into the factory prologue — the key Set above
// the identity-chain threshold, and every pattern RegExp. Nothing is rebuilt
// per call and nothing is allocated per key. No allowed keys and no patterns
// yields the constant `false`: every key is additional, so only `{}` validates.
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

// objectWalkBody builds the body of the single per-key sweep covering every
// object keyword at once: the key count for minProperties / maxProperties and
// the allowed-key test for `additionalProperties: false`. `objVar` is the
// function parameter the body reads.
//
// One `for…in` with early returns, the shape emitIndexSignatureValidate uses
// (validate.go) — no `Object.keys` array, no `.every` callback invoked per
// key. Returns "" when the annotation carries none of the three keywords.
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

// objectWalkCall hoists the sweep into a factory-prologue function and returns
// the call expression, so the closure is built once per factory rather than
// once per validator call. Without a context (direct emitter tests) the same
// body runs as an IIFE.
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

// countWalkCall hoists a bare key-count sweep and returns the call expression.
// The errors lane needs the count on its own so each bound reports under its
// own keyword; `for…in` counting allocates nothing where `Object.keys(v).length`
// builds a throwaway array (the same trade pf_countEnumKeys documents).
func countWalkCall(ctx formats.EmitContext, vλl string) string {
	body := "let n = 0;for (const k in o) n++;return n"
	if fnVar := hoistConst(ctx, "cntObj", "function(o){"+body+"}"); fnVar != "" {
		return fnVar + "(" + vλl + ")"
	}
	return "((o) => {" + body + "})(" + vλl + ")"
}

// closedWalkCall hoists the allowed-key sweep alone (no counting), for the
// errors lane's closedness statement.
func closedWalkCall(ctx formats.EmitContext, params map[string]any, keys []string, vλl string) string {
	body := "for (const k in o) {if (!(" + keyAllowTest(ctx, params, keys, "k") + ")) return false;}return true"
	if fnVar := hoistConst(ctx, "ckObj", "function(o){"+body+"}"); fnVar != "" {
		return fnVar + "(" + vλl + ")"
	}
	return "((o) => {" + body + "})(" + vλl + ")"
}

func (objectFormatEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	return objectWalkCall(ctx, annotation.Params, vλl)
}

func (objectFormatEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	params := annotation.Params
	var statements []string
	minValue, hasMin := formats.ReadNumberParam(params, "minProperties")
	maxValue, hasMax := formats.ReadNumberParam(params, "maxProperties")
	// One hoisted count fn shared by both bounds — emitting the call twice
	// would hoist two identical prologue functions.
	countCall := ""
	if hasMin || hasMax {
		countCall = countWalkCall(ctx, vλl)
	}
	if hasMin {
		statements = append(statements,
			"if ("+countCall+" < "+formats.FormatNumber(minValue)+") "+formats.FormatErrCall(pathExpr, errorsArr, "object", objectFormatName, "minProperties", formats.FormatNumber(minValue)))
	}
	if hasMax {
		statements = append(statements,
			"if ("+countCall+" > "+formats.FormatNumber(maxValue)+") "+formats.FormatErrCall(pathExpr, errorsArr, "object", objectFormatName, "maxProperties", formats.FormatNumber(maxValue)))
	}
	if keys, ok := readClosedKeys(params); ok {
		statements = append(statements,
			"if (!("+closedWalkCall(ctx, params, keys, vλl)+")) "+formats.FormatErrCall(pathExpr, errorsArr, "object", objectFormatName, "closed", "true"))
	}
	return strings.Join(statements, ";")
}

// ValidateParams surfaces bound contradictions at build time (AOT twin of
// the JS-side validateParams convention).
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
