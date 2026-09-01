package typeid

import (
	"strconv"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
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
			// serialize side so `object & {sentinel}` hashes the base
			// instead of silently dropping the base member.
			memberFlags&checker.TypeFlagsNonPrimitive != 0:
			objectMembers = append(objectMembers, member)
		}
	}

	if hasNever || hasIncompat {
		return strconv.Itoa(int(reflection.KindNever))
	}

	if literalMember != nil && primitiveMember != nil {
		if !literalExtendsPrimitiveFlags(literalMember.Flags(), primitiveMember.Flags()) {
			return strconv.Itoa(int(reflection.KindNever))
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
		var annotations []*reflection.FormatAnnotation
		var formatKey string
		for _, objectMember := range objectMembers {
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
		// Structural format brands and slot sentinels among object-only
		// intersections (`unknown[] & {__rtFormatName?: …}`): lift them
		// before the merged hash. memberIDs skips the sentinel props from
		// the merged property walk, so the remaining hash equals the
		// sentinel-free object's — the brand contributes only
		// the format key, mirroring the serialize side.
		var containsIDs []string
		var patternIDs []string
		var propNamesIDs []string
		var tupleLabels []string
		var haveTupleLabels bool
		var annotations []*reflection.FormatAnnotation
		var restMembers []*checker.Type
		for _, objectMember := range objectMembers {
			// Labeled-tuple sentinel (`[A, B] & {__rtLabels?: ['x', 'y']}`):
			// lift the labels and fold them INTO the tuple id below — the
			// per-element label fold the type-first labeled tuple gets — so
			// the value-first object form and `[x: A, y: B]` share one id.
			// Twin of the serialize side's label-aware projectTuple.
			if labels, isLabels := TupleLabelsFromMember(computer.typeChecker, objectMember); isLabels && !haveTupleLabels {
				tupleLabels, haveTupleLabels = labels, true
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
		if restCount == 0 {
			// Every member was a sentinel — the base is `unknown`.
			return strconv.Itoa(int(reflection.KindUnknown)) + containsKey + formatKey
		}
		if restCount == 1 && (formatKey != "" || containsKey != "" || haveTupleLabels) {
			// Single base ∧ sentinel(s): hash the base AS ITSELF plus the
			// contains / pattern folds + format key — the
			// serialize side projects the base node directly (array /
			// record / class), never a merged objectLiteral. Lifted tuple
			// labels fold INTO the tuple id (per-element, the type-first
			// spelling's fold); they apply only to a tuple base whose element
			// count they cover — anything else is a hand-rolled sentinel,
			// ignored on both sides.
			if haveTupleLabels && checker.IsTupleType(soleRest) &&
				len(tupleLabels) == len(computer.typeChecker.GetTypeArguments(soleRest)) {
				return computer.tupleID(soleRest, tupleLabels) + containsKey + formatKey
			}
			return computer.Compute(soleRest) + containsKey + formatKey
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
				return strconv.Itoa(int(reflection.KindNever))
			}
			ids := make([]string, 0, len(picks))
			for _, pick := range picks {
				// Same per-slot formulas as the plain tuple id (typeid.go):
				// optional slots resolve through optionalChildID + "?", rest
				// through "..." — so the merged id is byte-equal to the
				// equivalent hand-written tuple's.
				var child string
				switch {
				case pick.Fold != nil:
					// A folded slot is already undefined-stripped, so it needs
					// no optional-child resolution — just the `?` marker.
					child = pick.Fold.Structural(computer)
					if pick.Optional {
						child += "?"
					}
				case pick.Optional:
					child = computer.optionalChildID(pick.Type) + "?"
				default:
					child = computer.Compute(pick.Type)
				}
				if pick.Rest {
					child += "..."
				}
				ids = append(ids, child)
			}
			return collectionID(int(reflection.KindTuple), ids, true) + containsKey + formatKey
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
				ids = append(ids, computer.signatureID(signature, reflection.KindCallSignature, ""))
			}
		}
		return collectionJoined(int(reflection.KindObjectLiteral), computer.sortedJoin(ids), false) + containsKey + formatKey
	}

	return strconv.Itoa(int(reflection.KindUnknown))
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
