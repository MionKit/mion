// Package structural holds the Go-side emitters for the structural format
// families — formattedArray (base kind array/tuple), formattedObject (object
// literal / record plus the bare `object` keyword) and the formattedSet /
// formattedMap pair (collectionformat.go, the builtin collection classes on
// the array keywords). First formats whose base is not a primitive: the JSON Schema door lowers uniqueItems / maxItems /
// minProperties / maxProperties / additionalProperties: false onto them, and
// the intersection collapse lifts the brand off the base exactly like the
// negation sentinel (single non-sentinel base ∧ brand member).
package structural

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

const formattedArrayName = "formattedArray"

// formattedArrayEmitter implements the "formattedArray" family. Surface:
// minItems / maxItems (length bounds — the schema door usually spells
// minItems as a padded tuple instead, but the params stay supported so the
// brand is total) and uniqueItems (2020-12 deep equality). Registered under
// BOTH array-shaped base kinds: plain arrays and tuples (a prefixItems
// schema with uniqueItems brands a tuple base).
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

// corePureFnNamespace / uniqueItemsPureFnPath — the uniqueItems helpers live
// with the other core runtime helpers in pure-fns-utils.ts, NOT under
// `rtFormats::`, because that module is side-effect imported from the package
// entry (src/index.ts) and is therefore always registered. The `rtFormats::`
// modules only register when `@mionjs/run-types/formats` is imported, which a
// schema-door-only program never does.
//
// ONE PREDICATE PER FAMILY, not one with a kind test: the three collections
// disagree on what an entry is (an item, a member, a `[key, value]` pair) and on
// what is already unique by construction, so each family names its own and a
// type imports only the walk its own base needs. All three depend on
// `rt::canonicalJson`, so the canonical form is shared and cannot drift.
const (
	corePureFnNamespace   = "rt"
	uniqueItemsPureFnPath = "packages/run-types/src/runtypes/pure-fns-utils.ts"

	uniqueArrayItemsPureFnName = "uniqueArrayItems"
	uniqueSetMembersPureFnName = "uniqueSetMembers"
	uniqueMapEntriesPureFnName = "uniqueMapEntries"
)

// uniqueItemsCheck is the 2020-12 uniqueItems predicate: JSON equality
// (numbers by mathematical value — so 0 and -0 collide, 1 and 1.0 collide —
// objects by unordered key set, arrays by order). The body lives in the
// family's pure fn (`pureFnName`, one of the three above) so its
// canonicalisation closure is built ONCE per module instead of once per
// validator call, and so the entries that are unique by construction skip
// canonicalisation entirely.
//
// Without a context (direct emitter tests) it degrades to one self-contained
// IIFE. That fallback stays family-agnostic on purpose: `for…of` walks an
// array, a Set and a Map alike, and canonicalising every entry is correct for
// all three (just slower), so the nil-ctx path needs no copy per family.
func uniqueItemsCheck(ctx formats.EmitContext, vλl, pureFnName string) string {
	if ctx != nil {
		alias := ctx.UsePureFn(corePureFnNamespace, pureFnName, uniqueItemsPureFnPath)
		return alias + "(" + vλl + ")"
	}
	return "((a) => {const seen = new Set();const canon = (x) => {" +
		"if (x === null || typeof x !== 'object') return typeof x === 'string' ? JSON.stringify(x) : typeof x + ':' + String(x);" +
		"if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';" +
		"return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';};" +
		"for (const item of a) {const key = canon(item);if (seen.has(key)) return false;seen.add(key);}return true;})(" + vλl + ")"
}

// lengthConditions is the validate-lane half of the count bounds shared by
// the three collection families: `minItems` / `maxItems` over `lenExpr`
// (`v.length` for an array or tuple, `v.size` for a Set or Map).
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

// lengthErrorStatements is the errors-lane twin of lengthConditions: one
// canonical error per violated bound, reported under the family `fmtName`
// with the base kind word `expected`.
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

// boundsContradiction is the build-time `maxItems < minItems` check shared by
// the collection families; `publicName` is the type-first wrapper the
// diagnostic names (`FormattedArray` / `FormattedSet` / `FormattedMap`).
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
		conditions = append(conditions, uniqueItemsCheck(ctx, vλl, uniqueArrayItemsPureFnName))
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
			"if (!("+uniqueItemsCheck(ctx, vλl, uniqueArrayItemsPureFnName)+")) "+formats.FormatErrCall(pathExpr, errorsArr, "array", formattedArrayName, "uniqueItems", "true"))
	}
	return strings.Join(statements, ";")
}

// ValidateParams surfaces bound contradictions at build time (AOT twin of
// the JS-side validateParams convention).
func (formattedArrayEmitter) ValidateParams(annotation *reflection.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	return boundsContradiction(annotation.Params, "FormattedArray")
}
