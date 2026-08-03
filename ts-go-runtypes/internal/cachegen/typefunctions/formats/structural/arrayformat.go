// Package structural holds the Go-side emitters for the structural format
// families — formattedArray (base kind array/tuple) and formattedObject (object
// literal / record plus the bare `object` keyword). First formats whose base
// is not a primitive: the JSON Schema door lowers uniqueItems / maxItems /
// minProperties / maxProperties / additionalProperties: false onto them, and
// the intersection collapse lifts the brand off the base exactly like the
// negation sentinel (single non-sentinel base ∧ brand member).
package structural

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

const formattedArrayName = "formattedArray"

// formattedArrayEmitter implements the "formattedArray" family. Surface:
// minItems / maxItems (length bounds — the schema door usually spells
// minItems as a padded tuple instead, but the params stay supported so the
// brand is total) and uniqueItems (2020-12 deep equality). Registered under
// BOTH array-shaped base kinds: plain arrays and tuples (a prefixItems
// schema with uniqueItems brands a tuple base).
type formattedArrayEmitter struct {
	kind protocol.ReflectionKind
}

func init() {
	formats.Register(formattedArrayEmitter{kind: protocol.KindArray})
	formats.Register(formattedArrayEmitter{kind: protocol.KindTuple})
}

func (formattedArrayEmitter) Name() string {
	return formattedArrayName
}

func (emitter formattedArrayEmitter) Kind() protocol.ReflectionKind {
	return emitter.kind
}

// corePureFnNamespace / uniqueItemsPureFnPath — the `rt::uniqueItems` helper
// lives with the other core runtime helpers in pure-fns-utils.ts, NOT under
// `rtFormats::`, because that module is side-effect imported from the package
// entry (src/index.ts) and is therefore always registered. The `rtFormats::`
// modules only register when `ts-runtypes/formats` is imported, which a
// schema-door-only program never does.
const (
	corePureFnNamespace   = "rt"
	uniqueItemsPureFnPath = "packages/ts-runtypes/src/runtypes/pure-fns-utils.ts"
	uniqueItemsPureFnName = "uniqueItems"
)

// uniqueItemsCheck is the 2020-12 uniqueItems predicate: JSON equality
// (numbers by mathematical value — so 0 and -0 collide, 1 and 1.0 collide —
// objects by unordered key set, arrays by order). The body lives in the
// `rt::uniqueItems` pure fn so its canonicalisation closure is built ONCE per
// module instead of once per validator call, and so primitives skip
// canonicalisation entirely.
//
// Without a context (direct emitter tests) it degrades to the original
// self-contained IIFE, which is semantically identical but rebuilds the
// closure per call.
func uniqueItemsCheck(ctx formats.EmitContext, vλl string) string {
	if ctx != nil {
		alias := ctx.UsePureFn(corePureFnNamespace, uniqueItemsPureFnName, uniqueItemsPureFnPath)
		return alias + "(" + vλl + ")"
	}
	return "((a) => {const seen = new Set();const canon = (x) => {" +
		"if (x === null || typeof x !== 'object') return typeof x === 'string' ? JSON.stringify(x) : typeof x + ':' + String(x);" +
		"if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';" +
		"return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';};" +
		"for (const item of a) {const key = canon(item);if (seen.has(key)) return false;seen.add(key);}return true;})(" + vλl + ")"
}

func arrayConditions(params map[string]any, vλl string, ctx formats.EmitContext) []string {
	var conditions []string
	if value, ok := formats.ReadNumberParam(params, "minItems"); ok {
		conditions = append(conditions, vλl+".length >= "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "maxItems"); ok {
		conditions = append(conditions, vλl+".length <= "+formats.FormatNumber(value))
	}
	if unique, _ := formats.ReadBoolParam(params, "uniqueItems"); unique {
		conditions = append(conditions, uniqueItemsCheck(ctx, vλl))
	}
	return conditions
}

func (formattedArrayEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	return strings.Join(arrayConditions(annotation.Params, vλl, ctx), " && ")
}

func (formattedArrayEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	params := annotation.Params
	var statements []string
	if value, ok := formats.ReadNumberParam(params, "minItems"); ok {
		statements = append(statements,
			"if ("+vλl+".length < "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "array", formattedArrayName, "minItems", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "maxItems"); ok {
		statements = append(statements,
			"if ("+vλl+".length > "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "array", formattedArrayName, "maxItems", formats.FormatNumber(value)))
	}
	if unique, _ := formats.ReadBoolParam(params, "uniqueItems"); unique {
		statements = append(statements,
			"if (!("+uniqueItemsCheck(ctx, vλl)+")) "+formats.FormatErrCall(pathExpr, errorsArr, "array", formattedArrayName, "uniqueItems", "true"))
	}
	return strings.Join(statements, ";")
}

// ValidateParams surfaces bound contradictions at build time (AOT twin of
// the JS-side validateParams convention).
func (formattedArrayEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	maxValue, hasMax := formats.ReadNumberParam(params, "maxItems")
	minValue, hasMin := formats.ReadNumberParam(params, "minItems")
	if hasMax && hasMin && maxValue < minValue {
		errs = append(errs, "FormattedArray: `maxItems` cannot be less than `minItems`")
	}
	return errs
}
