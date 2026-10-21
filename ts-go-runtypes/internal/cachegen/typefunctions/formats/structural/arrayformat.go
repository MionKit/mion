// Package structural holds the emitters for the structural format families: formattedArray (array/tuple base),
// formattedObject (object literal / record plus the bare `object` keyword) and the formattedSet / formattedMap
// pair in collectionformat.go. They are the first formats whose base is not a primitive: the JSON Schema door
// lowers uniqueItems / maxItems / minProperties / maxProperties / additionalProperties: false onto them, and the
// intersection collapse lifts the brand off the base as it does the negation sentinel.
package structural

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

const formattedArrayName = "formattedArray"

// formattedArrayEmitter implements the "formattedArray" family: minItems / maxItems and uniqueItems (2020-12
// deep equality). The schema door usually spells minItems as a padded tuple, but the params stay supported so
// the brand is total.
// Registered under BOTH array-shaped base kinds, because a prefixItems schema with uniqueItems brands a tuple.
type formattedArrayEmitter struct {
	kind reflection.ReflectionKind
}

func init() {
	formats.Register(formattedArrayEmitter{kind: reflection.KindArray})
	formats.Register(formattedArrayEmitter{kind: reflection.KindTuple})
}

func (formattedArrayEmitter) Name() string {
	return formattedArrayName
}

func (emitter formattedArrayEmitter) Kind() reflection.ReflectionKind {
	return emitter.kind
}

// uniqueItemsCheck is the 2020-12 uniqueItems predicate: JSON equality, so 0 and -0 collide, 1 and 1.0 collide,
// objects compare by unordered key set and arrays by order.
// The body lives in the family's own pure fn so the canonicalisation closure is built ONCE per module rather than
// per validator call, and entries unique by construction skip canonicalisation entirely.
// Without a context (direct emitter tests) it degrades to one self-contained IIFE, deliberately family-agnostic:
// `for…of` walks an array, a Set and a Map alike, so the nil-ctx path needs no copy per family.
func uniqueItemsCheck(ctx formats.EmitContext, vλl, pureFnID string) string {
	if ctx != nil {
		alias := ctx.UsePureFn(pureFnID)
		return alias + "(" + vλl + ")"
	}
	return "((a) => {const seen = new Set();const canon = (x) => {" +
		"if (x === null || typeof x !== 'object') return typeof x === 'string' ? JSON.stringify(x) : typeof x + ':' + String(x);" +
		"if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';" +
		"return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';};" +
		"for (const item of a) {const key = canon(item);if (seen.has(key)) return false;seen.add(key);}return true;})(" + vλl + ")"
}

// lengthConditions is the validate half of the count bounds shared by the three collection families; lenExpr is
// `v.length` for an array or tuple and `v.size` for a Set or Map.
func lengthConditions(params map[string]any, lenExpr string) []string {
	var conditions []string
	if value, ok := formats.ReadNumberParam(params, "minItems"); ok {
		conditions = append(conditions, lenExpr+" >= "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "maxItems"); ok {
		conditions = append(conditions, lenExpr+" <= "+formats.FormatNumber(value))
	}
	return conditions
}

// lengthErrorStatements is the errors twin of lengthConditions: one canonical error per violated bound.
func lengthErrorStatements(params map[string]any, lenExpr, pathExpr, errorsArr, expected, fmtName string) []string {
	var statements []string
	if value, ok := formats.ReadNumberParam(params, "minItems"); ok {
		statements = append(statements,
			"if ("+lenExpr+" < "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, expected, fmtName, "minItems", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "maxItems"); ok {
		statements = append(statements,
			"if ("+lenExpr+" > "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, expected, fmtName, "maxItems", formats.FormatNumber(value)))
	}
	return statements
}

// boundsContradiction is the build-time `maxItems < minItems` check shared by the collection families;
// `publicName` is the type-first wrapper the diagnostic names.
func boundsContradiction(params map[string]any, publicName string) []string {
	maxValue, hasMax := formats.ReadNumberParam(params, "maxItems")
	minValue, hasMin := formats.ReadNumberParam(params, "minItems")
	if hasMax && hasMin && maxValue < minValue {
		return []string{publicName + ": `maxItems` cannot be less than `minItems`"}
	}
	return nil
}

func arrayConditions(params map[string]any, vλl string, ctx formats.EmitContext) []string {
	conditions := lengthConditions(params, vλl+".length")
	if unique, _ := formats.ReadBoolParam(params, "uniqueItems"); unique {
		conditions = append(conditions, uniqueItemsCheck(ctx, vλl, purefnids.UniqueArrayItems))
	}
	return conditions
}

func (formattedArrayEmitter) EmitValidateCheck(annotation *reflection.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	return strings.Join(arrayConditions(annotation.Params, vλl, ctx), " && ")
}

func (formattedArrayEmitter) EmitValidationErrorsCheck(annotation *reflection.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	params := annotation.Params
	statements := lengthErrorStatements(params, vλl+".length", pathExpr, errorsArr, "array", formattedArrayName)
	if unique, _ := formats.ReadBoolParam(params, "uniqueItems"); unique {
		statements = append(statements,
			"if (!("+uniqueItemsCheck(ctx, vλl, purefnids.UniqueArrayItems)+")) "+formats.FormatErrCall(pathExpr, errorsArr, "array", formattedArrayName, "uniqueItems", "true"))
	}
	return strings.Join(statements, ";")
}

// ValidateParams reports bound contradictions at build time, the AOT twin of the JS-side validateParams.
func (formattedArrayEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	return boundsContradiction(annotation.Params, "FormattedArray")
}
