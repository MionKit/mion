package typeid

import (
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// collapsedIntersectionID mirrors the serialize-side collapse so two
// structurally-equivalent post-collapse types share the same structural
// id (and therefore the same wire hash). The classification logic must
// stay in sync with internal/serialize/intersection_collapse.go.
//
// Rules:
//   - `A & B` where the result is an object literal (the TS checker
//     already provides the merged property set on the intersection
//     type) → id is the object literal's id.
//   - `string & {__brand}` → id is "<primitive-id>&{<sorted decorator ids>}"
//     so brand order doesn't matter (A & B == B & A) but the brand
//     content does (different brand → different id).
//   - `string & number` (or any incompatible primitive pair) → "never".
//   - everything-any → "unknown".
func (computer *Computer) collapsedIntersectionID(tsType *checker.Type) string {
	members := tsType.AsUnionOrIntersectionType().Types()

	var (
		primitiveMember *checker.Type
		literalMember   *checker.Type
		carrierMember   *checker.Type
		objectMembers   []*checker.Type
		hasNever        bool
		hasIncompat     bool
	)

	for _, member := range members {
		memberFlags := member.Flags()
		switch {
		case memberFlags&checker.TypeFlagsNever != 0:
			hasNever = true
		case memberFlags&checker.TypeFlagsAny != 0,
			memberFlags&checker.TypeFlagsUnknown != 0:
			// identity under &
		case isLiteralFlags(memberFlags):
			if literalMember == nil {
				literalMember = member
				continue
			}
			if literalMember != member {
				hasIncompat = true
			}
		case isPrimitiveBaseFlags(memberFlags):
			if primitiveMember == nil {
				primitiveMember = member
				continue
			}
			if !samePrimitiveBaseFlags(primitiveMember.Flags(), member.Flags()) {
				hasIncompat = true
			}
		case memberFlags&checker.TypeFlagsObject != 0,
			// The bare `object` keyword (TypeFlagsNonPrimitive) — mirror the
			// serialize side so `object & {__rtNot?: …}` hashes base+`!{…}`
			// instead of silently dropping the base member.
			memberFlags&checker.TypeFlagsNonPrimitive != 0:
			// OneOf carriers never classify — the id twin of the serialize
			// side's skip: a carrier'd member hashes as its plain self.
			// Captured for the duplicate-branch degenerate below.
			if IsOneOfCarrierMember(computer.typeChecker, member) {
				if carrierMember == nil {
					carrierMember = member
				}
				continue
			}
			objectMembers = append(objectMembers, member)
		}
	}

	if hasNever || hasIncompat {
		return strconv.Itoa(int(protocol.KindNever))
	}

	// Duplicate-branch degenerate — the id twin of the serialize-side arm:
	// identical branches dedup the oneOf union to this lone carrier'd
	// intersection, which must hash as the one-member union + `oo{…}` fold
	// (NOT as the plain base — the semantics differ: nothing validates).
	if carrierMember != nil {
		if _, branches := oneOfCarrierTuple(computer.typeChecker, carrierMember); branches != nil {
			branchIDs := make([]string, 0, len(branches))
			seenIDs := map[string]bool{}
			hasDuplicate := false
			for _, branch := range branches {
				branchID := computer.Compute(branch)
				if seenIDs[branchID] {
					hasDuplicate = true
				}
				seenIDs[branchID] = true
				branchIDs = append(branchIDs, branchID)
			}
			if hasDuplicate {
				var base *checker.Type
				baseCount := 0
				if primitiveMember != nil {
					base = primitiveMember
					baseCount++
				}
				if literalMember != nil {
					base = literalMember
					baseCount++
				}
				if len(objectMembers) == 1 {
					base = objectMembers[0]
					baseCount++
				} else if len(objectMembers) > 1 {
					baseCount += len(objectMembers)
				}
				if baseCount != 1 {
					return strconv.Itoa(int(protocol.KindNever))
				}
				return collectionJoined(int(protocol.KindUnion), computer.Compute(base), false) +
					"oo{" + computer.sortedJoin(branchIDs) + "}"
			}
		}
	}

	if literalMember != nil && primitiveMember != nil {
		if !literalExtendsPrimitiveFlags(literalMember.Flags(), primitiveMember.Flags()) {
			return strconv.Itoa(int(protocol.KindNever))
		}
		primitiveMember = nil
	}

	primary := primitiveMember
	if literalMember != nil {
		primary = literalMember
	}

	if primary != nil && len(objectMembers) > 0 {
		primaryID := computer.Compute(primary)
		brandIDs := make([]string, 0, len(objectMembers))
		var notIDs []string
		var annotations []*protocol.FormatAnnotation
		var formatKey string
		for _, objectMember := range objectMembers {
			// Negation sentinels (`{__rtNot?: Child}`) fold the CHILD's id
			// under a `!{…}` tag so `string` and `string ∧ ¬Email` can never
			// share a cache entry. Mirrors the serialize side's
			// node.Negations lift; sorted below so `¬A ∧ ¬B` ≡ `¬B ∧ ¬A`.
			if childType := NotChildTypeFromMember(computer.typeChecker, objectMember); childType != nil {
				notIDs = append(notIDs, computer.Compute(childType))
				continue
			}
			// Format brands are lifted out of TypeMeta on the serialize
			// side; here we mirror the lift in the ID so two intersections
			// that differ only in their format brand still hash distinctly.
			// Canonical params (sorted keys, recursed) make order-of-keys
			// in `{maxLength: 10}` irrelevant to the cache key. Multiple
			// same-family brands MERGE (sibling conjunction: `$ref`-target ∧
			// local keyword), mirroring the serialize side, so `A & B` and
			// `B & A` fold one canonical key.
			if annotation := FormatAnnotationFromType(computer.typeChecker, objectMember); annotation != nil {
				annotations = append(annotations, annotation)
				continue
			}
			// A pure `{__rtFormatBrand}` member is the TS-only nominal brand: it
			// must NOT enter the structural id (brand is id-neutral), else a
			// branded format would stop deduping with its unbranded twin.
			if IsFormatBrandMember(computer.typeChecker, objectMember) {
				continue
			}
			brandIDs = append(brandIDs, computer.Compute(objectMember))
		}
		if merged, ok := MergeFormatAnnotations(annotations); ok {
			if merged != nil {
				formatKey = FormatAnnotationStructuralKey(merged)
			}
		} else {
			// Unmergeable stack — the serialize side fails the build loudly;
			// fold a deterministic sorted concat so this id stays stable in
			// the meantime.
			keys := make([]string, 0, len(annotations))
			for _, annotation := range annotations {
				keys = append(keys, FormatAnnotationStructuralKey(annotation))
			}
			formatKey = computer.sortedJoin(keys)
		}
		result := primaryID
		if len(brandIDs) > 0 {
			result += "&{" + computer.sortedJoin(brandIDs) + "}"
		}
		if len(notIDs) > 0 {
			result += "!{" + computer.sortedJoin(notIDs) + "}"
		}
		return result + formatKey
	}

	if primary != nil {
		return computer.Compute(primary)
	}

	// Builtin-class × brand (`FormatDate<P>` → `Date & {brand}`): mirror
	// the serialize-side splitBuiltinClassBrand so the id reflects the
	// node's REAL shape — a Date class node + a format key — NOT an object
	// literal whose members include the __rtFormatName/__rtFormatParams
	// sentinels. Without this the id would encode the brand props as
	// properties (inconsistent with the projected KindClass/SubKindDate
	// node, and divergent from how an atomic format's id keeps the brand
	// out of the member set).
	if classMember, formatKey, ok := computer.splitBuiltinClassBrandID(objectMembers); ok {
		return computer.Compute(classMember) + formatKey
	}

	if len(objectMembers) > 0 {
		// Negation sentinels and structural format brands among object-only
		// intersections (`{a: number} & {__rtNot?: Child}`,
		// `unknown[] & {__rtFormatName?: …}`): lift them before the merged
		// hash. memberIDs skips the sentinel props from the merged property
		// walk, so the remaining hash equals the sentinel-free object's —
		// the negation contributes only the `!{…}` fold and the brand only
		// the format key, mirroring the serialize side.
		var notIDs []string
		var containsIDs []string
		var patternIDs []string
		var propNamesIDs []string
		var unevalIDs []string
		var annotations []*protocol.FormatAnnotation
		var restMembers []*checker.Type
		for _, objectMember := range objectMembers {
			if childType := NotChildTypeFromMember(computer.typeChecker, objectMember); childType != nil {
				notIDs = append(notIDs, computer.Compute(childType))
				continue
			}
			if childType, minCount, maxCount, ok := ContainsSpecFromMember(computer.typeChecker, objectMember); ok {
				containsIDs = append(containsIDs,
					computer.Compute(childType)+":"+strconv.FormatFloat(minCount, 'g', -1, 64)+":"+strconv.FormatFloat(maxCount, 'g', -1, 64))
				continue
			}
			if specs, ok := PatternPropsFromMember(computer.typeChecker, objectMember); ok {
				// Source + value pin the semantics; the key brand exists only
				// for mock pools and stays out of the id (its pattern equals
				// the source by construction).
				for _, spec := range specs {
					patternIDs = append(patternIDs, strconv.Quote(spec.Source)+":"+computer.Compute(spec.Value))
				}
				continue
			}
			if childType := PropNamesChildFromMember(computer.typeChecker, objectMember); childType != nil {
				propNamesIDs = append(propNamesIDs, computer.Compute(childType))
				continue
			}
			if spec, isUneval := UnevalSpecFromMember(computer.typeChecker, objectMember); isUneval {
				unevalIDs = append(unevalIDs, computer.unevaluatedKey(spec))
				continue
			}
			if annotation := FormatAnnotationFromType(computer.typeChecker, objectMember); annotation != nil {
				annotations = append(annotations, annotation)
				continue
			}
			if IsFormatBrandMember(computer.typeChecker, objectMember) {
				continue
			}
			restMembers = append(restMembers, objectMember)
		}
		restCount := len(restMembers)
		var soleRest *checker.Type
		if restCount == 1 {
			soleRest = restMembers[0]
		}
		formatKey := ""
		if merged, ok := MergeFormatAnnotations(annotations); ok {
			if merged != nil {
				formatKey = FormatAnnotationStructuralKey(merged)
			}
		} else {
			// Unmergeable stack — the serialize side fails the build loudly;
			// fold a deterministic sorted concat so this id stays stable in
			// the meantime (same fallback as the primitive branch above).
			keys := make([]string, 0, len(annotations))
			for _, annotation := range annotations {
				keys = append(keys, FormatAnnotationStructuralKey(annotation))
			}
			formatKey = computer.sortedJoin(keys)
		}
		notKey := ""
		if len(notIDs) > 0 {
			notKey = "!{" + computer.sortedJoin(notIDs) + "}"
		}
		containsKey := ""
		if len(containsIDs) > 0 {
			containsKey = "c{" + computer.sortedJoin(containsIDs) + "}"
		}
		if len(patternIDs) > 0 {
			containsKey += "pp{" + computer.sortedJoin(patternIDs) + "}"
		}
		if len(propNamesIDs) > 0 {
			containsKey += "pn{" + computer.sortedJoin(propNamesIDs) + "}"
		}
		if len(unevalIDs) > 0 {
			containsKey += "u{" + computer.sortedJoin(unevalIDs) + "}"
		}
		if restCount == 0 {
			// Every member was a sentinel — the base is `unknown`.
			return strconv.Itoa(int(protocol.KindUnknown)) + notKey + containsKey + formatKey
		}
		if restCount == 1 && (notKey != "" || formatKey != "" || containsKey != "") {
			// Single base ∧ sentinel(s): hash the base AS ITSELF plus the
			// negation / contains / pattern folds + format key — the
			// serialize side projects the base node directly (array /
			// record / class), never a merged objectLiteral.
			return computer.Compute(soleRest) + notKey + containsKey + formatKey
		}
		// Tuple ∩ tuple — merge slot-wise (tuplemerge.go) so the id equals
		// the equivalent hand-written tuple's; a genuine conflict hashes as
		// never (over-rejects, never silently under-validates). Twin of the
		// serialize-side merge in runtype/intersection_collapse.go.
		if restCount >= 2 && AllTupleOrArrayTypes(computer.typeChecker, restMembers) {
			picks, ok := MergeTupleIntersection(computer.typeChecker, restMembers, func(a, b *checker.Type) bool {
				return computer.Compute(a) == computer.Compute(b)
			})
			if !ok {
				return strconv.Itoa(int(protocol.KindNever))
			}
			ids := make([]string, 0, len(picks))
			for _, pick := range picks {
				// Same per-slot formulas as the plain tuple id (typeid.go):
				// optional slots resolve through optionalChildID + "?", rest
				// through "..." — so the merged id is byte-equal to the
				// equivalent hand-written tuple's.
				var child string
				if pick.Optional {
					child = computer.optionalChildID(pick.Type) + "?"
				} else {
					child = computer.Compute(pick.Type)
				}
				if pick.Rest {
					child += "..."
				}
				ids = append(ids, child)
			}
			return collectionID(int(protocol.KindTuple), ids, true) + notKey + containsKey + formatKey
		}
		// Object × object — the TS checker already merged properties on
		// the intersection type. Hash the merged members directly rather
		// than routing through objectID: the intersection isn't a Reference
		// or TupleType, and objectID's array/promise/class branches call
		// GetTypeArguments unconditionally which crashes on intersection
		// types in tsgo.
		ids := computer.memberIDs(tsType, false)
		// Embed call signatures alongside the members, exactly as objectID does
		// for a written object literal — so a CALLABLE intersection (`func &
		// {props}`, the value-first authoring of a callable interface) converges
		// with the type-first `{(): r; props}` (whose id carries the call
		// signature). Without this the call signature is dropped from the id and
		// the two forms diverge, even though their projected nodes match.
		if callSignatures := computer.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall); len(callSignatures) > 0 {
			for _, signature := range callSignatures {
				ids = append(ids, computer.signatureID(signature, protocol.KindCallSignature, ""))
			}
		}
		return collectionJoined(int(protocol.KindObjectLiteral), computer.sortedJoin(ids), false) + notKey + containsKey + formatKey
	}

	return strconv.Itoa(int(protocol.KindUnknown))
}

// builtinClassNamesID is the id-side mirror of the serialize-side
// builtinClassNames (internal/cachegen/runtype/intersection_collapse.go).
// The two MUST list the same names so the structural id and the projected
// node agree on which members are builtin-class bases.
var builtinClassNamesID = map[string]bool{"Date": true, "Map": true, "Set": true, "RegExp": true}

// splitBuiltinClassBrandID detects the `Builtin & {brand}` shape among an
// intersection's object members: exactly one recognised builtin-class
// member plus exactly one TypeFormat-brand member. Returns the class
// member, the canonical format key (folded into the id so two brands that
// differ only in params hash distinctly), and ok=true. Mirrors the
// serialize-side splitBuiltinClassBrand — keep them in sync.
// unevaluatedKey folds an `__rtUnevaluated` payload into the structural id.
// TWIN of the serialize side's serializeUnevaluated: same fields, same order,
// so a cache entry and its id can never part company. Literal lists go in
// verbatim (the door already emits them deterministically) and every guard
// subschema contributes its own structural id.
func (computer *Computer) unevaluatedKey(spec UnevalSpec) string {
	var builder strings.Builder
	builder.WriteString("k[" + strings.Join(spec.Keys, ",") + "]")
	builder.WriteString("s[" + strings.Join(spec.Sources, ",") + "]")
	builder.WriteString("p" + strconv.Itoa(spec.Prefix))
	if spec.Value != nil && spec.Value.Flags()&checker.TypeFlagsNever == 0 {
		builder.WriteString("v" + computer.Compute(spec.Value))
	}
	for _, group := range spec.Groups {
		builder.WriteString("g{")
		if group.When != nil {
			builder.WriteString("w" + computer.Compute(group.When))
		}
		if group.WhenNot != nil {
			builder.WriteString("n" + computer.Compute(group.WhenNot))
		}
		if group.WhenKey != "" {
			builder.WriteString("p" + group.WhenKey)
		}
		if group.All {
			builder.WriteString("*")
		}
		builder.WriteString("k[" + strings.Join(group.Keys, ",") + "]")
		builder.WriteString("s[" + strings.Join(group.Sources, ",") + "]")
		builder.WriteString("p" + strconv.Itoa(group.Prefix) + "}")
	}
	return builder.String()
}

func (computer *Computer) splitBuiltinClassBrandID(objectMembers []*checker.Type) (*checker.Type, string, bool) {
	var classMember *checker.Type
	var formatKey string
	var brandCount int
	for _, member := range objectMembers {
		if annotation := FormatAnnotationFromType(computer.typeChecker, member); annotation != nil {
			brandCount++
			if brandCount > 1 {
				return nil, "", false // two brands — not the shape we handle
			}
			formatKey += FormatAnnotationStructuralKey(annotation)
			continue
		}
		if computer.isBuiltinClassMemberID(member) {
			if classMember != nil {
				return nil, "", false // two builtin classes — ambiguous
			}
			classMember = member
		}
	}
	if classMember == nil || brandCount == 0 {
		return nil, "", false
	}
	return classMember, formatKey, true
}

// isBuiltinClassMemberID is the id-side mirror of the serialize-side
// isBuiltinClassMember: a brandable builtin class is a top-level
// Date/Map/Set/RegExp OR a namespace-qualified Temporal type.
func (computer *Computer) isBuiltinClassMemberID(member *checker.Type) bool {
	if _, ok := TemporalInfoForType(member); ok {
		return true
	}
	symbol := member.Symbol()
	return symbol != nil && builtinClassNamesID[symbol.Name]
}

func isLiteralFlags(flags checker.TypeFlags) bool {
	return flags&checker.TypeFlagsStringLiteral != 0 ||
		flags&checker.TypeFlagsNumberLiteral != 0 ||
		flags&checker.TypeFlagsBooleanLiteral != 0 ||
		flags&checker.TypeFlagsBigIntLiteral != 0
}

func isPrimitiveBaseFlags(flags checker.TypeFlags) bool {
	if isLiteralFlags(flags) {
		return false
	}
	return flags&checker.TypeFlagsString != 0 ||
		flags&checker.TypeFlagsNumber != 0 ||
		flags&checker.TypeFlagsBoolean != 0 ||
		flags&checker.TypeFlagsBigInt != 0 ||
		flags&checker.TypeFlagsESSymbol != 0
}

func samePrimitiveBaseFlags(a, b checker.TypeFlags) bool {
	mask := checker.TypeFlagsString | checker.TypeFlagsNumber | checker.TypeFlagsBoolean |
		checker.TypeFlagsBigInt | checker.TypeFlagsESSymbol
	return (a & mask) == (b & mask)
}

func literalExtendsPrimitiveFlags(literal, primitive checker.TypeFlags) bool {
	switch {
	case literal&checker.TypeFlagsStringLiteral != 0:
		return primitive&checker.TypeFlagsString != 0
	case literal&checker.TypeFlagsNumberLiteral != 0:
		return primitive&checker.TypeFlagsNumber != 0
	case literal&checker.TypeFlagsBooleanLiteral != 0:
		return primitive&checker.TypeFlagsBoolean != 0
	case literal&checker.TypeFlagsBigIntLiteral != 0:
		return primitive&checker.TypeFlagsBigInt != 0
	}
	return false
}
