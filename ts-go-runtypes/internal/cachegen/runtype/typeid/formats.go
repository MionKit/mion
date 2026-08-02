package typeid

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/comptimeargs"
	"github.com/mionkit/ts-runtypes/internal/protocol"
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
	// notChildProp marks a negation sentinel member
	// (`Base & {readonly __rtNot?: Child}`) — the internal encoding of JSON
	// Schema `not` and the format-scoped `Not<F>`. The prop carries the
	// TRANSLATED CHILD TYPE (not schema data), so both collapse passes lift
	// it the same way they lift format sentinels: the serialize side turns
	// the child into a protocol.RunType under node.Negations, the id side
	// folds the child's structural id under a `!` tag. Deliberately NOT
	// spelled `not` — real-world schemas contain properties named `not`.
	notChildProp = "__rtNot"
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
	// oneOfProp marks the exactly-one CARRIER — the internal encoding of
	// the OneOf<[…]> combinator and JSON Schema oneOf: every non-nullish
	// union member intersects an object whose ONLY prop is this one,
	// OPTIONAL, holding the branch tuple
	// (`A & {__rtOneOf?: Bs} | B & {__rtOneOf?: Bs} | null`). Per-member
	// carriage is deliberate: a whole-union sentinel cannot survive the
	// checker (an intersection over the union distributes and destroys
	// null branches; an extra tag member breaks plain-union consumption —
	// property access, discriminated switches, widening). The optional
	// prop keeps each member assignable with its plain form; nullish
	// branches stay plain and any one surviving carrier provides the
	// tuple. Union-level detection (OneOfFromMembers) lifts the branch
	// list onto the node / an `oo{…}` id fold, and both intersection
	// collapses skip the carrier so members serialize as their plain
	// selves.
	oneOfProp = "__rtOneOf"
)

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
	return properties[0].Name == formatBrandProp
}

// FormatAnnotationFromType inspects an object-literal *checker.Type for the
// two sentinel properties (formatNameProp / formatParamsProp) and returns
// the canonical FormatAnnotation if both are present and well-formed.
// Returns nil when the input is not a format brand — callers route those
// through the normal TypeMeta path.
func FormatAnnotationFromType(typeChecker *checker.Checker, tsType *checker.Type) *protocol.FormatAnnotation {
	if tsType == nil || typeChecker == nil {
		return nil
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	var nameSymbol, paramsSymbol *ast.Symbol
	for _, symbol := range properties {
		switch symbol.Name {
		case formatNameProp:
			nameSymbol = symbol
		case formatParamsProp:
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
	return &protocol.FormatAnnotation{Name: name, Params: params}
}

// MergeFormatAnnotations merges the format annotations of one collapsed
// intersection. Same-name annotations merge their param maps (the sibling
// conjunction case: a `$ref` to a branded number ∧ a local `maximum`);
// ok=false when the names differ (cross-family stacking needs sub-format
// nesting that does not exist yet) or when one param key carries two
// different values (a genuine contradiction the caller must surface LOUDLY
// — the historical behavior silently kept the LAST annotation, dropping a
// constraint the schema declared).
func MergeFormatAnnotations(annotations []*protocol.FormatAnnotation) (*protocol.FormatAnnotation, bool) {
	if len(annotations) == 0 {
		return nil, true
	}
	merged := &protocol.FormatAnnotation{Name: annotations[0].Name, Params: map[string]any{}}
	for key, value := range annotations[0].Params {
		merged.Params[key] = value
	}
	for _, annotation := range annotations[1:] {
		if annotation.Name != merged.Name {
			return nil, false
		}
		for key, value := range annotation.Params {
			if existing, exists := merged.Params[key]; exists && !reflect.DeepEqual(existing, value) {
				return nil, false
			}
			merged.Params[key] = value
		}
	}
	return merged, true
}

// IsNotSentinelPropName reports whether a property name is the negation
// sentinel (`__rtNot`). Property walks on BOTH sides (typeid.memberIDs and
// the serialize-side projectMembersInto) skip it so the sentinel never
// surfaces as a real object property when TS merges it into an
// intersection's property set.
func IsNotSentinelPropName(name string) bool {
	return name == notChildProp
}

// IsFormatSentinelPropName is the TypeFormat twin of IsNotSentinelPropName:
// once the collapse lifts a structural brand (`unknown[] & {__rtFormatName?:
// …}`) onto node.FormatAnnotation / the id's format key, the merged property
// walks must not surface the brand sentinels as real members.
func IsFormatSentinelPropName(name string) bool {
	return name == formatNameProp || name == formatParamsProp || name == formatBrandProp
}

// IsContainsSentinelPropName is the contains twin for the property walks.
// The patternProperties / propertyNames / oneOf-carrier sentinels ride the
// same skip: merged property walks over a carrier'd intersection
// (GetPropertiesOfType on the whole type) surface `__rtOneOf` as a prop,
// and it must never become a real member or an id contribution.
func IsContainsSentinelPropName(name string) bool {
	return name == containsChildProp || name == patternPropsProp || name == propNamesProp || name == oneOfProp
}

// oneOfCarrierTuple inspects one intersection CONSTITUENT for the oneOf
// carrier shape — an object whose ONLY prop is the optional `__rtOneOf`
// holding a ≥2-branch tuple — and returns the tuple type (the carrier's
// identity for level resolution) plus its element types in written order.
// The type-level OneOf requires two branches, so anything else is a
// hand-rolled spelling we refuse to guess at.
func oneOfCarrierTuple(typeChecker *checker.Checker, constituent *checker.Type) (*checker.Type, []*checker.Type) {
	if constituent == nil || typeChecker == nil {
		return nil, nil
	}
	properties := typeChecker.GetPropertiesOfType(constituent)
	if len(properties) != 1 || properties[0].Name != oneOfProp {
		return nil, nil
	}
	return oneOfTupleFromSymbol(typeChecker, properties[0])
}

// oneOfCarrierFromProps reads the carrier off a member's MERGED property
// set: type-level projections that map over the intersection (DataOnly)
// merge the carrier into one object type, where the branch tuple survives
// only as the `__rtOneOf` prop among the member's own props. The `__rt`
// prefix is the sentinel namespace (same claim `__rtNot` makes), so a prop
// spelled exactly like this IS the carrier.
func oneOfCarrierFromProps(typeChecker *checker.Checker, member *checker.Type) (*checker.Type, []*checker.Type) {
	if member == nil || typeChecker == nil || member.Flags()&checker.TypeFlagsObject == 0 {
		return nil, nil
	}
	for _, symbol := range typeChecker.GetPropertiesOfType(member) {
		if symbol.Name == oneOfProp {
			return oneOfTupleFromSymbol(typeChecker, symbol)
		}
	}
	return nil, nil
}

func oneOfTupleFromSymbol(typeChecker *checker.Checker, symbol *ast.Symbol) (*checker.Type, []*checker.Type) {
	// The prop is optional (so a carrier'd member stays assignable with its
	// plain form) — strip the optionality-induced undefined.
	tupleType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(symbol))
	if tupleType == nil || tupleType.Flags()&checker.TypeFlagsUndefined != 0 || !checker.IsTupleType(tupleType) {
		return nil, nil
	}
	branches := typeChecker.GetTypeArguments(tupleType)
	if len(branches) < 2 {
		return nil, nil
	}
	return tupleType, branches
}

// IsOneOfCarrierMember reports whether an intersection member is a oneOf
// carrier. Both intersection collapses SKIP it at classification time, so
// a carrier'd member serializes and hashes as its plain self (the branch
// semantics live on the UNION node via OneOfFromMembers, never on the
// members).
func IsOneOfCarrierMember(typeChecker *checker.Checker, tsType *checker.Type) bool {
	tupleType, _ := oneOfCarrierTuple(typeChecker, tsType)
	return tupleType != nil
}

// OneOfCarrierBranches exposes a carrier constituent's branch tuple to the
// serialize-side collapse: when DUPLICATE branches dedup the whole oneOf
// union to a single member, the carrier'd intersection stands alone and
// the collapse must project the degenerate one-member union with counting
// instead of silently dropping the exclusivity.
func OneOfCarrierBranches(typeChecker *checker.Checker, tsType *checker.Type) []*checker.Type {
	_, branches := oneOfCarrierTuple(typeChecker, tsType)
	return branches
}

// OneOfFromMembers scans a union's distributed members for oneOf carriers
// and resolves WHICH carrier belongs to THIS union level: a nested OneOf
// branch flattens its own carrier'd members into the outer list (where
// they carry BOTH tuples), so the level carrier is the one no other
// carrier's branch tuple contains. Returns the level branch list and ok.
// ok=false when no carrier is present or the level is ambiguous (two
// unclaimed carriers — only a hand-rolled spelling produces that; callers
// keep the plain union projection). Members are returned to the caller
// UNCHANGED — the collapse skips the carrier constituents, so children
// already serialize plain.
func OneOfFromMembers(typeChecker *checker.Checker, members []*checker.Type) ([]*checker.Type, bool) {
	// Carriers dedupe by the tuple's CANONICAL PRINT, never by pointer: two
	// members of one big written type can carry pointer-DISTINCT
	// instantiations of the identical tuple literal (tsgo does not
	// guarantee interning of anonymous structural types), and treating
	// them as two tags would mis-read the level as ambiguous and silently
	// drop the exclusivity. Identical print = identical structure = one
	// carrier.
	carrierBranches := make(map[string][]*checker.Type)
	for _, member := range members {
		if member == nil {
			continue
		}
		if member.Flags()&checker.TypeFlagsIntersection != 0 {
			for _, constituent := range member.AsUnionOrIntersectionType().Types() {
				if tupleType, branches := oneOfCarrierTuple(typeChecker, constituent); tupleType != nil {
					carrierBranches[typeChecker.TypeToString(tupleType)] = branches
				}
			}
			continue
		}
		// Merged shadow (DataOnly and other homomorphic projections).
		if tupleType, branches := oneOfCarrierFromProps(typeChecker, member); tupleType != nil {
			carrierBranches[typeChecker.TypeToString(tupleType)] = branches
		}
	}
	if len(carrierBranches) == 0 {
		return nil, false
	}
	claimed := make(map[string]bool)
	for _, branches := range carrierBranches {
		for _, branch := range branches {
			if branch == nil || branch.Flags()&checker.TypeFlagsUnion == 0 {
				continue
			}
			for _, part := range branch.Distributed() {
				if part.Flags()&checker.TypeFlagsIntersection != 0 {
					for _, constituent := range part.AsUnionOrIntersectionType().Types() {
						if tupleType, _ := oneOfCarrierTuple(typeChecker, constituent); tupleType != nil {
							claimed[typeChecker.TypeToString(tupleType)] = true
						}
					}
					continue
				}
				if tupleType, _ := oneOfCarrierFromProps(typeChecker, part); tupleType != nil {
					claimed[typeChecker.TypeToString(tupleType)] = true
				}
			}
		}
	}
	var levelBranches []*checker.Type
	unclaimed := 0
	for tupleKey, branches := range carrierBranches {
		if !claimed[tupleKey] {
			unclaimed++
			levelBranches = branches
		}
	}
	if unclaimed != 1 {
		return nil, false
	}
	return levelBranches, true
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
	if len(properties) != 1 || properties[0].Name != patternPropsProp {
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
// member is something else. Same optional-sentinel discipline as __rtNot.
func PropNamesChildFromMember(typeChecker *checker.Checker, tsType *checker.Type) *checker.Type {
	if tsType == nil || typeChecker == nil {
		return nil
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	if len(properties) != 1 || properties[0].Name != propNamesProp {
		return nil
	}
	childType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(properties[0]))
	if childType == nil || childType.Flags()&checker.TypeFlagsUndefined != 0 {
		return nil
	}
	return childType
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
	if len(properties) != 1 || properties[0].Name != containsChildProp {
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

// NotChildTypeFromMember inspects an object-literal *checker.Type for the
// negation sentinel (`{readonly __rtNot?: Child}`) and returns the CHILD type
// with the optionality-induced `undefined` stripped. Returns nil when the
// member is not a negation sentinel — callers route those through the normal
// TypeMeta / property path. The member must carry ONLY the sentinel prop:
// a real object type that happens to include `__rtNot` alongside other
// properties is not a sentinel and must not be silently rewritten.
func NotChildTypeFromMember(typeChecker *checker.Checker, tsType *checker.Type) *checker.Type {
	if tsType == nil || typeChecker == nil {
		return nil
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	if len(properties) != 1 || properties[0].Name != notChildProp {
		return nil
	}
	// Same optional-sentinel discipline as the format props: the prop is
	// declared optional so the branded type stays mutually assignable with
	// its base; strip the `undefined` before handing the child to the walk.
	childType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(properties[0]))
	if childType == nil || childType.Flags()&checker.TypeFlagsUndefined != 0 {
		return nil
	}
	return childType
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
// contract documented in the FormatAnnotation field on protocol.RunType.
func FormatAnnotationStructuralKey(annotation *protocol.FormatAnnotation) string {
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

// EVERY format param is id-relevant, `mockSamples` and `message` included.
// They used to be excluded as "mock/diagnostic metadata, not validation
// behaviour" — but cache entries are shared singletons and for
// `createMockDataFn` the samples ARE behaviour: two same-shape formats
// differing only in samples collapsed onto one entry, and whichever call
// site interned first supplied the mock samples for BOTH (first-intern
// nondeterminism — the same failure mode as tuple labels). Folding
// them in also lets emitters surface a pattern's custom `message` as the
// error val without cache-identity risk. Formats sharing every param still
// dedup exactly as before.

// canonicalLiteralMap serialises a literal-value map with sorted keys at
// every nesting depth so equivalent maps hash to the same string.
func canonicalLiteralMap(values map[string]any) string {
	keys := make([]string, 0, len(values))
	for key := range values {
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
