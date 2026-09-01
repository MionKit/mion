package typeid

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Sentinel property names that mark a brand-shaped object literal as a
// TypeFormat brand. The JS-side TypeFormat<Base, Name, Params, ...> alias
// resolves (after tsgo widens intersections) to `Base &
// {readonly __rtFormatName: Name; readonly __rtFormatParams: Params}`.
// Two property names rather than one keeps the detection unambiguous
// for arbitrary user brand objects.
const (
	formatNameProp   = "__rtFormatName"
	formatParamsProp = "__rtFormatParams"
	// formatBrandProp marks the OPTIONAL nominal-brand member of a TypeFormat
	// (the `BrandName` convention): `Base & {sentinels} & {__rtFormatBrand: B}`.
	// It is a PURE TS-level discriminator — the scanner reads only the two
	// sentinels above for the FormatAnnotation and ignores the brand — so a
	// branded format and its unbranded twin must resolve ONE structural id.
	formatBrandProp = "__rtFormatBrand"
	// containsChildProp marks a contains sentinel member
	// (`Base & {readonly __rtContains?: {rt$child: C; rt$min: N; rt$max?: M}}`)
	// — the internal encoding of JSON Schema contains / minContains /
	// maxContains. The spec object pairs the TRANSLATED child type with its
	// literal occurrence bounds; both collapse passes lift it (serialize →
	// node.Contains entries, id → a `c{…}` fold).
	containsChildProp = "__rtContains"
	containsChildKey  = "rt$child"
	containsMinKey    = "rt$min"
	containsMaxKey    = "rt$max"
	// patternPropsProp marks a patternProperties sentinel member: the spec
	// object's PROP NAMES are the key regex sources and each prop type is a
	// {rt$key: KeyBrand; rt$value: Value} pair. propNamesProp marks a
	// propertyNames sentinel carrying the key-validating child directly.
	patternPropsProp = "__rtPatternProps"
	patternKeyKey    = "rt$key"
	patternValueKey  = "rt$value"
	propNamesProp    = "__rtPropNames"
	// tupleLabelsProp marks the labeled-tuple sentinel member
	// (`[number, number] & {readonly __rtLabels?: readonly ['x', 'y']}`) —
	// how the value-first object forms (`tuple({x: …})` / `func({event: …})`)
	// carry slot labels / parameter names, which TS cannot construct on a
	// tuple type directly. Both collapse passes lift it (serialize → the
	// projected member/parameter names, id → the per-element label fold the
	// type-first labeled tuple already gets) and the property walks skip it.
	// The labels tuple covers EVERY element (TS labels all slots or none) —
	// a length mismatch means a hand-rolled sentinel and is ignored whole.
	tupleLabelsProp = "__rtLabels"
)

// lateBoundNamePrefix is how tsgo spells a property whose key is a `unique
// symbol` instead of a string: InternalSymbolNamePrefix, '@', the symbol
// DECLARATION's name, '@', then a per-program symbol id (see
// checker.getESSymbolLikeTypeForNode). The trailing id is NOT stable across
// programs, so the match runs to the second '@' and no further.
//
// The prefix is taken from the upstream constant rather than spelled out, so a
// change to it arrives as a compile-time change here instead of a silent
// mismatch. The '@' separators are still upstream's own convention, which is
// why TestSymbolKeyedSentinel_MatchesStringKeyed resolves a symbol-keyed brand
// through the REAL checker: if upstream ever renames the scheme, that test goes
// red instead of every branded type quietly degrading to its base.
var lateBoundNamePrefix = ast.InternalSymbolNamePrefix + "@"

// isSentinelProp reports whether a property name is the sentinel `base`,
// spelled either way:
//
//   - as a `unique symbol` key whose declaration is named `base` — what the
//     SHIPPED types use, so the sentinels stay out of a branded type's string
//     keys (`Extract<keyof T, string>`, object spread, string-constrained
//     mapped types all come back clean for the user's own shape);
//   - as a plain string property named `base` — still recognised, which is
//     what lets a hand-written .d.ts fixture and the fuzz's INDEPENDENT
//     type-first oracle spell the sentinel literally without importing the
//     symbol. Both spellings fold to the same id: the property name never
//     reaches the hash (memberIDs skips it, the annotation supplies the id).
//
// LateBoundNamePrefixForTest exposes the prefix to the package's external test
// so its failure message can name the exact scheme that stopped matching.
func LateBoundNamePrefixForTest() string { return lateBoundNamePrefix }

func isSentinelProp(name, base string) bool {
	if name == base {
		return true
	}
	if !strings.HasPrefix(name, lateBoundNamePrefix) {
		return false
	}
	rest := name[len(lateBoundNamePrefix):]
	return len(rest) > len(base) && strings.HasPrefix(rest, base) && rest[len(base)] == '@'
}

// IsFormatBrandMember reports whether tsType is a pure TypeFormat nominal-brand
// member — an object whose ONLY property is `__rtFormatBrand`. tsgo keeps the
// `Base & {sentinels} & {__rtFormatBrand}` intersection as distinct object
// members; the sentinel member is lifted into the FormatAnnotation, but this
// brand-only member carries no validation semantics, so both intersection-collapse
// passes (serialize side + structural-id side) must SKIP it. Leaving it in would
// decorate the node with a TypeMeta entry / fold a brand id into the structural
// key — fragmenting the cache so a branded format no longer dedups with its
// unbranded twin, and shifting the id of every predefined `Format*` whose alias
// carries a brand name.
func IsFormatBrandMember(typeChecker *checker.Checker, tsType *checker.Type) bool {
	if tsType == nil || typeChecker == nil {
		return false
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	if len(properties) != 1 {
		return false
	}
	return isSentinelProp(properties[0].Name, formatBrandProp)
}

// FormatAnnotationFromType inspects an object-literal *checker.Type for the
// two sentinel properties (formatNameProp / formatParamsProp) and returns
// the canonical FormatAnnotation if both are present and well-formed.
// Returns nil when the input is not a format brand — callers route those
// through the normal TypeMeta path.
func FormatAnnotationFromType(typeChecker *checker.Checker, tsType *checker.Type) *reflection.FormatAnnotation {
	if tsType == nil || typeChecker == nil {
		return nil
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	var nameSymbol, paramsSymbol *ast.Symbol
	for _, symbol := range properties {
		switch {
		case isSentinelProp(symbol.Name, formatNameProp):
			nameSymbol = symbol
		case isSentinelProp(symbol.Name, formatParamsProp):
			paramsSymbol = symbol
		}
	}
	if nameSymbol == nil || paramsSymbol == nil {
		return nil
	}
	// The sentinel props are declared OPTIONAL on TypeFormat (so an unbranded
	// format stays assignable from its base primitive — `FormatString<P>` ≡
	// `string`). tsgo therefore types the symbols as `Name | undefined` /
	// `Params | undefined`; strip the `undefined` before reading the literal
	// name and walking the params. GetNonNullableType is a no-op on the
	// already-non-nullable (required-prop) shape, so this stays correct either
	// way.
	nameType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(nameSymbol))
	if nameType == nil || nameType.Flags()&checker.TypeFlagsStringLiteral == 0 {
		return nil
	}
	name, ok := nameType.AsLiteralType().Value().(string)
	if !ok || name == "" {
		return nil
	}
	paramsType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(paramsSymbol))
	params := literalParamsFromType(typeChecker, paramsType)
	canonicalizeBoundAliases(params)
	return &reflection.FormatAnnotation{Name: name, Params: params}
}

// boundAliasCanonical maps the JSON Schema bound keyword spellings to the
// engine's canonical short param keys.
var boundAliasCanonical = map[string]string{
	"minimum":          "min",
	"maximum":          "max",
	"exclusiveMinimum": "gt",
	"exclusiveMaximum": "lt",
}

// canonicalizeBoundAliases renames any JSON Schema bound-keyword spelling
// (minimum/maximum/exclusiveMinimum/exclusiveMaximum) a numeric/date/temporal
// format carries to the engine's canonical short key (min/max/gt/lt), so a
// format written with EITHER spelling folds to one structural id and the
// emitters — which read only the short keys — work unchanged. A canonical key
// already present wins (the explicit short spelling is authoritative), so a
// redundant double-spelling never overwrites it. No-op for formats that carry
// none of the alias keys (strings, structural, …).
func canonicalizeBoundAliases(params map[string]any) {
	for alias, canonical := range boundAliasCanonical {
		value, hasAlias := params[alias]
		if !hasAlias {
			continue
		}
		delete(params, alias)
		if _, hasCanonical := params[canonical]; !hasCanonical {
			params[canonical] = value
		}
	}
}

// MergeFormatAnnotations merges the format annotations of one collapsed
// intersection. Same-name annotations merge their param maps (the sibling
// conjunction case: a `$ref` to a branded number ∧ a local `maximum`);
// ok=false when the names differ (cross-family stacking needs sub-format
// nesting that does not exist yet) or when one param key carries two values
// that cannot be conjoined (a genuine contradiction the caller must surface
// LOUDLY — the historical behavior silently kept the LAST annotation, dropping
// a constraint the schema declared).
func MergeFormatAnnotations(annotations []*reflection.FormatAnnotation) (*reflection.FormatAnnotation, bool) {
	if len(annotations) == 0 {
		return nil, true
	}
	merged := &reflection.FormatAnnotation{Name: annotations[0].Name, Params: map[string]any{}}
	for key, value := range annotations[0].Params {
		merged.Params[key] = value
	}
	for _, annotation := range annotations[1:] {
		if annotation.Name != merged.Name {
			return nil, false
		}
		for key, value := range annotation.Params {
			existing, exists := merged.Params[key]
			if !exists || reflect.DeepEqual(existing, value) {
				merged.Params[key] = value
				continue
			}
			tightened, ok := mergeParamValue(key, existing, value)
			if !ok {
				return nil, false
			}
			merged.Params[key] = tightened
		}
	}
	return merged, true
}

// mergeParamValue resolves ONE param key two same-family annotations disagree
// on. A conjunction of constraints is the TIGHTER of the two — `min: 20 ∧ min:
// 30` is `min: 30` — so the bound keys fold by max (lower bounds) or min (upper
// bounds), and `multipleOf` folds by least common multiple. Every other key must
// agree exactly; ok=false hands the clash back to the caller to report. The
// shape reaching here is ordinary schema authoring:
// `allOf: [{minimum: 20}, {minimum: 30}]` lowers to two number brands.
func mergeParamValue(key string, existing, incoming any) (any, bool) {
	left, leftOK := existing.(float64)
	right, rightOK := incoming.(float64)
	if !leftOK || !rightOK {
		return nil, false
	}
	switch key {
	case "min", "gt", "minLength", "minItems", "minProperties", "minContains":
		return math.Max(left, right), true
	case "max", "lt", "maxLength", "maxItems", "maxProperties", "maxContains":
		return math.Min(left, right), true
	case "multipleOf":
		return leastCommonMultiple(left, right)
	}
	return nil, false
}

// leastCommonMultiple folds two `multipleOf` constraints into the one that
// means the same thing: a value divisible by BOTH is exactly a value divisible
// by their least common multiple. Defined here for positive integers only —
// a fractional multipleOf would need exact rational arithmetic, and a product
// past the exact-integer range would silently lose precision, so both stay
// clashes the caller reports.
func leastCommonMultiple(left, right float64) (any, bool) {
	if left <= 0 || right <= 0 || left != math.Trunc(left) || right != math.Trunc(right) {
		return nil, false
	}
	if left > float64(maxExactInteger) || right > float64(maxExactInteger) {
		return nil, false
	}
	leftInt, rightInt := int64(left), int64(right)
	reduced := leftInt / greatestCommonDivisor(leftInt, rightInt)
	if reduced > maxExactInteger/rightInt {
		return nil, false
	}
	return float64(reduced * rightInt), true
}

// The largest integer a float64 represents exactly (JS Number.MAX_SAFE_INTEGER
// + 1) — past it, a folded multiple would not round-trip through the wire.
const maxExactInteger = int64(1) << 53

func greatestCommonDivisor(left, right int64) int64 {
	for right != 0 {
		left, right = right, left%right
	}
	return left
}

// IsFormatSentinelPropName is the TypeFormat twin of IsNotSentinelPropName:
// once the collapse lifts a structural brand (`unknown[] & {__rtFormatName?:
// …}`) onto node.FormatAnnotation / the id's format key, the merged property
// walks must not surface the brand sentinels as real members.
func IsFormatSentinelPropName(name string) bool {
	return isSentinelProp(name, formatNameProp) || isSentinelProp(name, formatParamsProp) || isSentinelProp(name, formatBrandProp)
}

// IsContainsSentinelPropName is the contains twin for the property walks.
// The patternProperties / propertyNames sentinels ride the
// same skip: merged property walks over a sentinel'd intersection
// (GetPropertiesOfType on the whole type) surface the sentinel as a prop,
// and it must never become a real member or an id contribution.
func IsContainsSentinelPropName(name string) bool {
	return isSentinelProp(name, containsChildProp) || isSentinelProp(name, patternPropsProp) ||
		isSentinelProp(name, propNamesProp)
}

// PatternPropSpec is one decoded patternProperties entry (see
// PatternPropsFromMember).
type PatternPropSpec struct {
	Source string
	Key    *checker.Type
	Value  *checker.Type
}

// PatternPropsFromMember inspects an object-literal *checker.Type for the
// patternProperties sentinel and returns the decoded entries sorted by
// source. ok=false when the member is not a patternProperties sentinel.
func PatternPropsFromMember(typeChecker *checker.Checker, tsType *checker.Type) ([]PatternPropSpec, bool) {
	if tsType == nil || typeChecker == nil {
		return nil, false
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	if len(properties) != 1 || !isSentinelProp(properties[0].Name, patternPropsProp) {
		return nil, false
	}
	specType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(properties[0]))
	if specType == nil || specType.Flags()&checker.TypeFlagsUndefined != 0 {
		return nil, false
	}
	var specs []PatternPropSpec
	for _, entryProp := range typeChecker.GetPropertiesOfType(specType) {
		entryType := typeChecker.GetTypeOfSymbol(entryProp)
		spec := PatternPropSpec{Source: entryProp.Name}
		for _, pairProp := range typeChecker.GetPropertiesOfType(entryType) {
			switch pairProp.Name {
			case patternKeyKey:
				spec.Key = typeChecker.GetTypeOfSymbol(pairProp)
			case patternValueKey:
				spec.Value = typeChecker.GetTypeOfSymbol(pairProp)
			}
		}
		if spec.Value == nil {
			continue
		}
		specs = append(specs, spec)
	}
	sort.Slice(specs, func(i, j int) bool { return specs[i].Source < specs[j].Source })
	return specs, true
}

// PropNamesChildFromMember inspects an object-literal *checker.Type for the
// propertyNames sentinel and returns the key-validating child, nil when the
// member is something else. Same optional-sentinel discipline as the other slots.
func PropNamesChildFromMember(typeChecker *checker.Checker, tsType *checker.Type) *checker.Type {
	if tsType == nil || typeChecker == nil {
		return nil
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	if len(properties) != 1 || !isSentinelProp(properties[0].Name, propNamesProp) {
		return nil
	}
	childType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(properties[0]))
	if childType == nil || childType.Flags()&checker.TypeFlagsUndefined != 0 {
		return nil
	}
	return childType
}

// TupleLabelsFromMember inspects one intersection CONSTITUENT for the
// labeled-tuple sentinel shape — an object whose ONLY prop is the optional
// `__rtLabels` holding a tuple of string literals — and returns the label
// strings in slot order. ok=false when the member is something else. Same
// optional-sentinel discipline as __rtPropNames.
func TupleLabelsFromMember(typeChecker *checker.Checker, tsType *checker.Type) ([]string, bool) {
	if tsType == nil || typeChecker == nil {
		return nil, false
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	if len(properties) != 1 || !isSentinelProp(properties[0].Name, tupleLabelsProp) {
		return nil, false
	}
	labelsType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(properties[0]))
	if labelsType == nil || !checker.IsTupleType(labelsType) {
		return nil, false
	}
	typeArguments := typeChecker.GetTypeArguments(labelsType)
	labels := make([]string, 0, len(typeArguments))
	for _, typeArgument := range typeArguments {
		if typeArgument.Flags()&checker.TypeFlagsStringLiteral == 0 {
			return nil, false
		}
		label, isString := typeArgument.AsLiteralType().Value().(string)
		if !isString {
			return nil, false
		}
		labels = append(labels, label)
	}
	return labels, true
}

// IsLabelsSentinelPropName is the labeled-tuple twin for the property walks:
// once the collapse lifts the labels onto the tuple members / the id's
// per-element label fold, the merged property walks must not surface the
// sentinel as a real member.
func IsLabelsSentinelPropName(name string) bool {
	return isSentinelProp(name, tupleLabelsProp)
}

// SplitLabeledTupleIntersection detects the labeled-tuple carrier on a
// PARAMETER type — an intersection of exactly one tuple member and one
// `__rtLabels` sentinel member (any/unknown identities tolerated) — and
// returns the tuple plus the lifted labels. The labels must cover every
// element (TS labels all slots or none); a mismatch returns ok=false and the
// caller treats the type as an ordinary intersection.
func SplitLabeledTupleIntersection(typeChecker *checker.Checker, tsType *checker.Type) (*checker.Type, []string, bool) {
	if tsType == nil || typeChecker == nil || tsType.Flags()&checker.TypeFlagsIntersection == 0 {
		return nil, nil, false
	}
	var tupleType *checker.Type
	var labels []string
	var haveLabels bool
	for _, member := range tsType.AsUnionOrIntersectionType().Types() {
		memberFlags := member.Flags()
		switch {
		case memberFlags&checker.TypeFlagsAny != 0, memberFlags&checker.TypeFlagsUnknown != 0:
			// identity under &
		case checker.IsTupleType(member):
			if tupleType != nil {
				return nil, nil, false
			}
			tupleType = member
		default:
			memberLabels, isLabels := TupleLabelsFromMember(typeChecker, member)
			if !isLabels || haveLabels {
				return nil, nil, false
			}
			labels, haveLabels = memberLabels, true
		}
	}
	if tupleType == nil || !haveLabels {
		return nil, nil, false
	}
	if len(labels) != len(typeChecker.GetTypeArguments(tupleType)) {
		return nil, nil, false
	}
	return tupleType, labels, true
}

// ContainsSpecFromMember inspects an object-literal *checker.Type for the
// contains sentinel and returns the CHILD type plus the literal occurrence
// bounds (min defaults to 1 — the bare `contains` keyword; max -1 means
// unbounded). ok=false when the member is not a contains sentinel.
func ContainsSpecFromMember(typeChecker *checker.Checker, tsType *checker.Type) (child *checker.Type, minCount, maxCount float64, ok bool) {
	if tsType == nil || typeChecker == nil {
		return nil, 0, 0, false
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	if len(properties) != 1 || !isSentinelProp(properties[0].Name, containsChildProp) {
		return nil, 0, 0, false
	}
	specType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(properties[0]))
	if specType == nil || specType.Flags()&checker.TypeFlagsUndefined != 0 {
		return nil, 0, 0, false
	}
	minCount, maxCount = 1, -1
	for _, specProp := range typeChecker.GetPropertiesOfType(specType) {
		switch specProp.Name {
		case containsChildKey:
			// rt$child is REQUIRED inside the spec object — read it raw.
			// GetNonNullableType would degrade an `unknown` child
			// (`contains: true`) to `{}`, deleting the accept-everything
			// semantics.
			child = typeChecker.GetTypeOfSymbol(specProp)
		case containsMinKey:
			if value, isNumber := literalNumberOf(typeChecker, specProp); isNumber {
				minCount = value
			}
		case containsMaxKey:
			if value, isNumber := literalNumberOf(typeChecker, specProp); isNumber {
				maxCount = value
			}
		}
	}
	if child == nil {
		return nil, 0, 0, false
	}
	return child, minCount, maxCount, true
}

// literalNumberOf reads a number-literal property's value via the canonical
// type string (the same robust route projectPrimitiveInto takes).
func literalNumberOf(typeChecker *checker.Checker, symbol *ast.Symbol) (float64, bool) {
	numberType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(symbol))
	if numberType == nil || numberType.Flags()&checker.TypeFlagsNumberLiteral == 0 {
		return 0, false
	}
	value, err := strconv.ParseFloat(typeChecker.TypeToString(numberType), 64)
	if err != nil {
		return 0, false
	}
	return value, true
}

// literalParamsFromType walks an object-literal type into the
// FormatAnnotation.Params map via the generic comptimeargs type-literal
// walk, bound to the format-domain policy: the registerFormatPattern
// escape hatch (pattern params ride `typeof p` / value initializers —
// a regex source can't live at the type level) and the TypeToString
// fallback (non-literal property values keep the canonical type string
// so params always stay JSON-serialisable and cache-differentiating).
func literalParamsFromType(typeChecker *checker.Checker, paramsType *checker.Type) map[string]any {
	return comptimeargs.TypeLiteralObject(typeChecker, paramsType, formatTypeValueOptions(typeChecker))
}

// formatTypeValueOptions binds the format-domain knobs into the generic walk.
func formatTypeValueOptions(typeChecker *checker.Checker) comptimeargs.TypeValueOptions {
	return comptimeargs.TypeValueOptions{
		PropertyOverride: func(symbol *ast.Symbol) (any, bool) {
			// Type channel FIRST: a generic FormatPattern<A> (registerFormatPattern)
			// or an inline {source, flags, …} literal carries the pattern as LITERAL
			// types on the property, so it survives a published .d.ts — read it
			// straight from the resolved type. This is what lets a downstream
			// consumer (and the benchmark) recover alpha/email/url/… patterns.
			patternType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(symbol))
			if pattern, ok := formatPatternFromType(typeChecker, patternType); ok {
				return pattern, true
			}
			// AST fallback: the value-first path (`pattern: /…/`, or a
			// registerFormatPattern({…}) const in scan scope) where the literal
			// lives only in the declaring AST, not the type.
			return formatPatternFromSymbol(typeChecker, symbol)
		},
		NonLiteralFallback: func(tsType *checker.Type) any {
			return typeChecker.TypeToString(tsType)
		},
	}
}

// formatPatternFromType recovers a pattern bundle from the RESOLVED TYPE of a
// `pattern` property — the type-level channel that survives a published `.d.ts`.
// With the generic FormatPattern<A> and the inline `{source, flags, …}` literal
// form, source/flags/mockSamples/message are LITERAL types on the property, so
// the scanner reads them straight from the type (the brand symbol is ignored).
// Returns (nil, false) when `source` isn't a string literal — the legacy opaque
// shape (`source: string`) or any non-pattern property — so the caller falls
// back to the AST channel. Shapes the same {source, flags, mockSamples?,
// message?} map the AST reader returns, so downstream consumers are unchanged.
func formatPatternFromType(typeChecker *checker.Checker, patternType *checker.Type) (map[string]any, bool) {
	if patternType == nil || patternType.Flags()&checker.TypeFlagsObject == 0 {
		return nil, false
	}
	source, ok := stringLiteralOf(stringPropertyType(typeChecker, patternType, "source"))
	if !ok || source == "" {
		return nil, false
	}
	out := map[string]any{"source": source}
	// flags is ALWAYS present (default "") so a type-first {source, flags:""}
	// converges with the AST regex reader's {source, flags:""} for an inline /re/.
	flags, _ := stringLiteralOf(stringPropertyType(typeChecker, patternType, "flags"))
	out["flags"] = flags
	if message, ok := stringLiteralOf(stringPropertyType(typeChecker, patternType, "message")); ok {
		out["message"] = message
	}
	if samplesType := stringPropertyType(typeChecker, patternType, "mockSamples"); samplesType != nil {
		if samples, ok := comptimeargs.TypeLiteralValue(typeChecker, samplesType, comptimeargs.TypeValueOptions{}).([]any); ok && len(samples) > 0 {
			out["mockSamples"] = samples
		}
	}
	return out, true
}

// stringPropertyType returns the non-nullable type of property `name` on an
// object type, or nil when the property is absent. (The checker shim exposes
// GetPropertiesOfType, not a by-name getter, so we scan.)
func stringPropertyType(typeChecker *checker.Checker, objectType *checker.Type, name string) *checker.Type {
	for _, symbol := range typeChecker.GetPropertiesOfType(objectType) {
		if symbol.Name == name {
			return typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(symbol))
		}
	}
	return nil
}

// stringLiteralOf returns the value of a string-literal type, or ("", false).
func stringLiteralOf(tsType *checker.Type) (string, bool) {
	if tsType == nil || tsType.Flags()&checker.TypeFlagsStringLiteral == 0 {
		return "", false
	}
	value, ok := tsType.AsLiteralType().Value().(string)
	return value, ok
}

// formatPatternFromSymbol recovers a FormatPattern bundle from a param
// declared as `typeof someConst`, where someConst is initialised by a
// registerFormatPattern({regexp, mockSamples, message}) call. Returns
// the RESOLVED literal object {source, flags, mockSamples?, message?} —
// the AST is only the means of recovery, never stored (the
// resolveFormatParams equivalent). Returns (nil, false) when the param
// isn't a typeof pointing at such a call.
func formatPatternFromSymbol(typeChecker *checker.Checker, symbol *ast.Symbol) (map[string]any, bool) {
	if symbol == nil {
		return nil, false
	}
	declarations := symbol.Declarations
	if symbol.ValueDeclaration != nil {
		declarations = append([]*ast.Node{symbol.ValueDeclaration}, declarations...)
	}
	for _, declaration := range declarations {
		if declaration == nil {
			continue
		}
		// (a) type-first: `pattern: typeof p` — a TypeQuery type node whose
		// referenced const is a registerFormatPattern({…}) call.
		if typeNode := declaration.Type(); typeNode != nil && typeNode.Kind == ast.KindTypeQuery {
			if typeQuery := typeNode.AsTypeQueryNode(); typeQuery != nil {
				initializer := constInitializerOf(typeChecker, typeQuery.ExprName)
				if initializer != nil && initializer.Kind == ast.KindCallExpression {
					if pattern, ok := formatPatternFromCall(typeChecker, initializer); ok {
						return pattern, true
					}
				}
			}
		}
		// (b) value-first: `pattern: /…/` | `{source,flags}` |
		// `registerFormatPattern({…})` | `slug` — a value initializer the
		// preserved property declaration still points at, even though the
		// property's TYPE has erased to `RegExp`.
		if initializer := propertyInitializer(declaration); initializer != nil {
			if pattern, ok := formatPatternFromInitializer(typeChecker, initializer, 0); ok {
				return pattern, true
			}
		}
	}
	return nil, false
}

// constInitializerOf resolves an identifier to the initializer of the
// `const` it names. Returns nil for non-identifiers, non-const
// bindings, or initializer-less declarations (a `declare const` in a
// .d.ts).
func constInitializerOf(typeChecker *checker.Checker, node *ast.Node) *ast.Node {
	if node == nil || node.Kind != ast.KindIdentifier {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(node)
	if symbol == nil {
		return nil
	}
	// `typeof importedConst` resolves to the import-alias symbol whose
	// declaration is the import specifier, not the const — follow the
	// alias to the original (e.g. a pattern const in string-patterns.ts
	// referenced from stringFormats.ts), then run the shared const walk.
	symbol = comptimeargs.ResolveImportAlias(typeChecker, symbol)
	var initializer *ast.Node
	comptimeargs.EachConstVariableDeclaration(symbol, func(variableDeclaration *ast.VariableDeclaration) bool {
		initializer = variableDeclaration.Initializer
		return false
	})
	return initializer
}

// formatPatternFromCall extracts the resolved literal fields from a
// registerFormatPattern({regexp, mockSamples, message}) call's first
// object-literal argument. Requires at least a recoverable `regexp`
// source — otherwise it isn't a usable pattern.
func formatPatternFromCall(typeChecker *checker.Checker, call *ast.Node) (map[string]any, bool) {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil || len(callExpression.Arguments.Nodes) == 0 {
		return nil, false
	}
	argument := callExpression.Arguments.Nodes[0]
	if argument == nil || argument.Kind != ast.KindObjectLiteralExpression {
		return nil, false
	}
	return formatPatternFromObjectLiteral(typeChecker, argument)
}

// propertyInitializer returns the value expression a property declaration
// binds, or nil when the declaration has no value initializer (e.g. a
// PropertySignature in a type). Lets the pattern recovery reach the value a
// value-first config wrote (`pattern: /…/`) through the symbol declaration a
// homomorphic Omit/Pick mapped type preserves.
func propertyInitializer(declaration *ast.Node) *ast.Node {
	switch declaration.Kind {
	case ast.KindPropertyAssignment:
		return declaration.AsPropertyAssignment().Initializer
	case ast.KindPropertyDeclaration:
		return declaration.AsPropertyDeclaration().Initializer
	}
	return nil
}

// formatPatternFromInitializer recovers a pattern bundle from a VALUE
// expression — the form a value-first config uses. Handles the four shapes a
// `pattern` field can carry:
//   - `/…/`                              → regex literal → {source, flags}
//   - `{source, flags, …}`               → object literal, read directly
//   - `registerFormatPattern({…})`       → call → reuse the call reader
//   - `slug` (an identifier for either)  → resolve the const, then recurse
//
// A regex's source can't ride the type channel (it erases to `RegExp`), but the
// pattern symbol's declaration is the original value AST node, so the literal
// is recoverable here even though the property's TYPE is `RegExp`.
func formatPatternFromInitializer(typeChecker *checker.Checker, initializer *ast.Node, depth int) (map[string]any, bool) {
	// comptimeargs' wrapper set (`as` / parens / `satisfies`) — recovery must
	// accept exactly what the CompTimeArgs validation accepted upstream.
	node := comptimeargs.UnwrapWrappers(initializer)
	if node == nil || depth > 16 {
		return nil, false
	}
	switch node.Kind {
	case ast.KindRegularExpressionLiteral:
		if source, flags, ok := comptimeargs.TraceRegexpLiteral(typeChecker, node); ok {
			return map[string]any{"source": source, "flags": flags}, true
		}
	case ast.KindObjectLiteralExpression:
		return formatPatternFromObjectLiteral(typeChecker, node)
	case ast.KindCallExpression:
		return formatPatternFromCall(typeChecker, node)
	case ast.KindIdentifier:
		if next := constInitializerOf(typeChecker, node); next != nil {
			return formatPatternFromInitializer(typeChecker, next, depth+1)
		}
	}
	return nil, false
}

// formatPatternFromObjectLiteral reads the {regexp|source, flags, mockSamples,
// message} fields from an object-literal node into a resolved pattern bundle.
// Shared by the registerFormatPattern call reader and the value-first inline
// `pattern: {source, flags}` form. Requires a recoverable `source`.
func formatPatternFromObjectLiteral(typeChecker *checker.Checker, argument *ast.Node) (map[string]any, bool) {
	if argument == nil || argument.Kind != ast.KindObjectLiteralExpression {
		return nil, false
	}
	objectLiteral := argument.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return nil, false
	}
	out := map[string]any{}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil || property.Kind != ast.KindPropertyAssignment {
			continue
		}
		assignment := property.AsPropertyAssignment()
		if assignment == nil || assignment.Name() == nil || assignment.Initializer == nil {
			continue
		}
		switch assignment.Name().Text() {
		case "regexp":
			if source, flags, ok := comptimeargs.TraceRegexpLiteral(typeChecker, assignment.Initializer); ok {
				out["source"] = source
				out["flags"] = flags
			}
		case "source":
			// The {source, flags} overload of registerFormatPattern — both
			// passed as string literals at the call site.
			if value, ok := comptimeargs.StringLiteralValue(assignment.Initializer); ok {
				out["source"] = value
			}
		case "flags":
			if value, ok := comptimeargs.StringLiteralValue(assignment.Initializer); ok {
				out["flags"] = value
			}
		case "mockSamples":
			if samples := comptimeargs.StringArrayLiteralValue(assignment.Initializer); len(samples) > 0 {
				out["mockSamples"] = samples
			}
		case "message":
			if message, ok := comptimeargs.StringLiteralValue(assignment.Initializer); ok {
				out["message"] = message
			}
		}
	}
	if _, ok := out["source"]; !ok {
		return nil, false
	}
	return out, true
}

// FormatAnnotationStructuralKey returns a canonical, key-order-independent
// string representation of a FormatAnnotation for inclusion in a parent
// type's structural id. Sorting keys at every nesting level guarantees
// `{a:1, b:2}` and `{b:2, a:1}` produce the same key — the idempotency
// contract documented in the FormatAnnotation field on reflection.RunType.
func FormatAnnotationStructuralKey(annotation *reflection.FormatAnnotation) string {
	if annotation == nil {
		return ""
	}
	var builder strings.Builder
	builder.WriteString("|fmt:")
	builder.WriteString(annotation.Name)
	if len(annotation.Params) > 0 {
		builder.WriteByte(':')
		builder.WriteString(canonicalLiteralMap(annotation.Params))
	}
	return builder.String()
}

// `mockSamples` is NOT id-relevant; every OTHER format param is (`message`
// included). Samples are generation metadata read only by createMockDataFn,
// not validation behaviour, so two formats identical but for their sample
// pools describe the SAME validator and MUST dedup onto one cache entry —
// folding samples in fragments the cache instead. `message` stays folded in
// because it changes the emitted validator's error `val` (real behaviour of
// the same function), and a pattern's `source`/`flags` stay because they ARE
// the check. When two sites that dedup onto one entry declare DIFFERENT
// sample pools, the shared entry could only carry one; that conflict is a
// build ERROR (diagnostics.CodeFMTSampleConflict, FMT006) rather than a guess
// hidden in the id.
const mockSamplesKey = "mockSamples"

// canonicalLiteralMap serialises a literal-value map with sorted keys at
// every nesting depth so equivalent maps hash to the same string. The
// `mockSamples` key is skipped at every depth (top-level params, a nested
// `pattern`, or a `disallowed*`/`allowed*` op object) so samples never enter
// the id.
func canonicalLiteralMap(values map[string]any) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		if key == mockSamplesKey {
			continue
		}
		keys = append(keys, key)
	}
	if len(keys) == 0 {
		return "{}"
	}
	sort.Strings(keys)
	var builder strings.Builder
	builder.WriteByte('{')
	for i, key := range keys {
		if i > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.Quote(key))
		builder.WriteByte(':')
		builder.WriteString(canonicalLiteralValue(values[key]))
	}
	builder.WriteByte('}')
	return builder.String()
}

func canonicalLiteralValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return "null"
	case string:
		return strconv.Quote(typed)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case float64:
		// json.Marshal canonicalises ints vs floats (`1` vs `1.0` both → "1") so
		// we re-use it for a stable numeric repr.
		bytes, err := json.Marshal(typed)
		if err == nil {
			return string(bytes)
		}
		return fmt.Sprintf("%v", typed)
	case map[string]any:
		return canonicalLiteralMap(typed)
	case []any:
		var builder strings.Builder
		builder.WriteByte('[')
		for i, item := range typed {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(canonicalLiteralValue(item))
		}
		builder.WriteByte(']')
		return builder.String()
	default:
		return strconv.Quote(fmt.Sprintf("%v", value))
	}
}
