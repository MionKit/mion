// Package structural holds the Go-side emitters for the structural format
// families — arrayFormat (base kind array/tuple) and objectFormat (object
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

const arrayFormatName = "arrayFormat"

// arrayFormatEmitter implements the "arrayFormat" family. Surface:
// minItems / maxItems (length bounds — the schema door usually spells
// minItems as a padded tuple instead, but the params stay supported so the
// brand is total) and uniqueItems (2020-12 deep equality). Registered under
// BOTH array-shaped base kinds: plain arrays and tuples (a prefixItems
// schema with uniqueItems brands a tuple base).
type arrayFormatEmitter struct {
	kind protocol.ReflectionKind
}

func init() {
	formats.Register(arrayFormatEmitter{kind: protocol.KindArray})
	formats.Register(arrayFormatEmitter{kind: protocol.KindTuple})
}

func (arrayFormatEmitter) Name() string {
	return arrayFormatName
}

func (emitter arrayFormatEmitter) Kind() protocol.ReflectionKind {
	return emitter.kind
}

// uniqueItemsCheck is the 2020-12 uniqueItems predicate: JSON equality
// (numbers by mathematical value — so 0 and -0 collide, 1 and 1.0 collide —
// objects by unordered key set, arrays by order) via a canonical stringify
// with sorted keys. Self-contained IIFE, no pure-fn registration (the email
// decomposition precedent).
func uniqueItemsCheck(vλl string) string {
	return "((a) => {const seen = new Set();const canon = (x) => {" +
		"if (x === null || typeof x !== 'object') return typeof x === 'string' ? JSON.stringify(x) : typeof x + ':' + String(x);" +
		"if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';" +
		"return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';};" +
		"for (const item of a) {const key = canon(item);if (seen.has(key)) return false;seen.add(key);}return true;})(" + vλl + ")"
}

func arrayConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if value, ok := formats.ReadNumberParam(params, "minItems"); ok {
		conditions = append(conditions, vλl+".length >= "+formats.FormatNumber(value))
	}
	if value, ok := formats.ReadNumberParam(params, "maxItems"); ok {
		conditions = append(conditions, vλl+".length <= "+formats.FormatNumber(value))
	}
	if unique, _ := formats.ReadBoolParam(params, "uniqueItems"); unique {
		conditions = append(conditions, uniqueItemsCheck(vλl))
	}
	return conditions
}

func (arrayFormatEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	return strings.Join(arrayConditions(annotation.Params, vλl), " && ")
}

func (arrayFormatEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, _ formats.EmitContext) string {
	if annotation == nil || len(annotation.Params) == 0 {
		return ""
	}
	params := annotation.Params
	var statements []string
	if value, ok := formats.ReadNumberParam(params, "minItems"); ok {
		statements = append(statements,
			"if ("+vλl+".length < "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "array", arrayFormatName, "minItems", formats.FormatNumber(value)))
	}
	if value, ok := formats.ReadNumberParam(params, "maxItems"); ok {
		statements = append(statements,
			"if ("+vλl+".length > "+formats.FormatNumber(value)+") "+formats.FormatErrCall(pathExpr, errorsArr, "array", arrayFormatName, "maxItems", formats.FormatNumber(value)))
	}
	if unique, _ := formats.ReadBoolParam(params, "uniqueItems"); unique {
		statements = append(statements,
			"if (!("+uniqueItemsCheck(vλl)+")) "+formats.FormatErrCall(pathExpr, errorsArr, "array", arrayFormatName, "uniqueItems", "true"))
	}
	return strings.Join(statements, ";")
}

// ValidateParams surfaces bound contradictions at build time (AOT twin of
// the JS-side validateParams convention).
func (arrayFormatEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string
	maxValue, hasMax := formats.ReadNumberParam(params, "maxItems")
	minValue, hasMin := formats.ReadNumberParam(params, "minItems")
	if hasMax && hasMin && maxValue < minValue {
		errs = append(errs, "ArrayFormat: `maxItems` cannot be less than `minItems`")
	}
	return errs
}
