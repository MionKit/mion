// Tuple ∩ tuple intersection merge — the collapse's answer to
// `[string, ...unknown[]] & [unknown?, number?, ...unknown[]]` (the shape
// JSON Schema's `allOf` over prefixItems produces, with `true` padding
// translating to unknown slots). Without this the object-merge path
// surfaced two tuples as a junk objectLiteral whose validator was a NOOP —
// the one forbidden outcome.
//
// The merge is deliberately BOUNDED: a slot pair resolves when either side
// is unknown/any (pick the other) or both sides are the same type (by the
// caller's id-equality on the undefined-STRIPPED slot types); the picks
// carry the RAW slot types so each caller runs its own optional-child
// resolution, exactly like the plain tuple projections — the merged id
// CONVERGES with the equivalent hand-written tuple by construction.
// Anything outside that — genuinely conflicting slot types, impossible
// length windows, variadic spreads — reports ok=false and the callers
// project KindNever: the validator rejects everything, which can
// over-reject but can never silently under-validate. Labels are dropped on
// merge (schema tuples carry none; a labeled hand-written merge is out of
// the convergence contract — logged decision).
package typeid

import (
	"github.com/microsoft/typescript-go/shim/checker"
)

// TupleMergePick is one resolved slot of an intersected tuple set. Type is
// the RAW slot type (undefined kept on optional slots) — callers must
// apply the same optional-child resolution the plain tuple formulas use
// (optionalChildID / serializeOptionalChild). Rest marks the single
// trailing open-tail slot, when the merge stays open.
type TupleMergePick struct {
	Type     *checker.Type
	Optional bool
	Rest     bool
}

// tupleSlot pairs a slot's raw type with its undefined-stripped view.
// stripped == nil marks an OPAQUE optional (`T | null | undefined` — no
// single checker type expresses the strip): mergeable only when nothing
// real contests the slot.
type tupleSlot struct {
	raw      *checker.Type
	stripped *checker.Type
}

type tupleShape struct {
	slots    []tupleSlot
	restType *checker.Type
	required int
}

// AllTupleOrArrayTypes is the gate both collapse halves use before attempting
// the merge. It covers `tuple ∩ array` too — the shape JSON
// Schema produces whenever a `prefixItems` in one applicator meets an `items`
// in another (`[number?, ...unknown[]] & number[]`). A plain array reads as a
// tuple with NO fixed slots and an open tail of its element type, so the same
// slot-wise merge covers it. At least one member must be a real tuple:
// array ∩ array is already handled upstream (single-base + sentinels) and
// re-routing it here would change ids for no gain.
func AllTupleOrArrayTypes(typeChecker *checker.Checker, members []*checker.Type) bool {
	if len(members) == 0 {
		return false
	}
	tuples := 0
	for _, member := range members {
		switch {
		case member == nil:
			return false
		case checker.IsTupleType(member):
			tuples++
		case arrayElementType(typeChecker, member) != nil:
		default:
			return false
		}
	}
	return tuples > 0
}

// arrayElementType returns the element type of a plain (non-tuple) array
// reference, or nil. The Reference gate mirrors serialize.go / typeid.go: an
// array-LIKE mapped hybrid passes IsArrayLikeType with no reference target and
// would segfault GetTypeArguments.
func arrayElementType(typeChecker *checker.Checker, tsType *checker.Type) *checker.Type {
	if tsType == nil || checker.IsTupleType(tsType) {
		return nil
	}
	if !typeChecker.IsArrayLikeType(tsType) || tsType.ObjectFlags()&checker.ObjectFlagsReference == 0 {
		return nil
	}
	typeArguments := typeChecker.GetTypeArguments(tsType)
	if len(typeArguments) == 0 {
		return nil
	}
	return typeArguments[0]
}

// MergeTupleIntersection resolves an intersection of tuple types into one
// slot list. equalTypes is the caller's structural identity (id equality on
// its own side of the pipeline), so both halves stay twins by construction.
func MergeTupleIntersection(
	typeChecker *checker.Checker,
	tuples []*checker.Type,
	equalTypes func(a, b *checker.Type) bool,
) ([]TupleMergePick, bool) {
	shapes := make([]tupleShape, 0, len(tuples))
	for _, tupleType := range tuples {
		shape, ok := readTupleShape(typeChecker, tupleType)
		if !ok {
			return nil, false
		}
		shapes = append(shapes, shape)
	}

	// Length window: every tuple's required prefix must fit inside every
	// closed tuple's fixed length.
	minRequired := 0
	maxAllowed := -1 // -1 = unbounded
	maxFixed := 0
	for _, shape := range shapes {
		if shape.required > minRequired {
			minRequired = shape.required
		}
		if len(shape.slots) > maxFixed {
			maxFixed = len(shape.slots)
		}
		if shape.restType == nil && (maxAllowed < 0 || len(shape.slots) < maxAllowed) {
			maxAllowed = len(shape.slots)
		}
	}
	if maxAllowed >= 0 && minRequired > maxAllowed {
		return nil, false
	}
	mergedFixed := maxFixed
	if maxAllowed >= 0 && maxAllowed < mergedFixed {
		mergedFixed = maxAllowed
	}

	picks := make([]TupleMergePick, 0, mergedFixed+1)
	for i := 0; i < mergedFixed; i++ {
		var winner tupleSlot
		var fallback *checker.Type
		var neverType *checker.Type
		for _, shape := range shapes {
			var contribution tupleSlot
			if i < len(shape.slots) {
				contribution = shape.slots[i]
			} else if shape.restType != nil {
				contribution = tupleSlot{raw: shape.restType, stripped: shape.restType}
			} else {
				// Closed tuple shorter than i — unreachable (mergedFixed is
				// capped by maxAllowed), defensive conflict.
				return nil, false
			}
			if contribution.raw == nil {
				return nil, false
			}
			if contribution.stripped != nil && isUnknownOrAny(contribution.stripped) {
				if fallback == nil {
					fallback = contribution.raw
				}
				continue
			}
			// A `never` slot (JSON Schema `false` subschema) wins the slot
			// outright: T ∧ never = never — "this position must be absent".
			if contribution.stripped != nil && contribution.stripped.Flags()&checker.TypeFlagsNever != 0 {
				neverType = contribution.stripped
				continue
			}
			if winner.raw == nil {
				winner = contribution
				continue
			}
			// An opaque optional contesting (or contested by) a real slot —
			// no honest single type; bounded merge gives up.
			if winner.stripped == nil || contribution.stripped == nil {
				return nil, false
			}
			if winner.stripped != contribution.stripped && !equalTypes(winner.stripped, contribution.stripped) {
				return nil, false
			}
		}
		optional := i >= minRequired
		if neverType != nil {
			// A REQUIRED never slot means no array length satisfies the
			// intersection — the whole merge is never (semantically exact,
			// not just bounded).
			if !optional {
				return nil, false
			}
			picks = append(picks, TupleMergePick{Type: neverType, Optional: true})
			continue
		}
		if winner.raw == nil {
			if fallback == nil {
				return nil, false
			}
			winner = tupleSlot{raw: fallback, stripped: fallback}
		}
		pickType := winner.raw
		if !optional {
			// A merged-REQUIRED slot must not leak the optionality-encoding
			// `undefined` from an optional-sourced winner; the stripped view
			// is the honest required type. Opaque strip → bounded give-up.
			if winner.stripped == nil {
				return nil, false
			}
			pickType = winner.stripped
		}
		picks = append(picks, TupleMergePick{Type: pickType, Optional: optional})
	}

	// Open tail only when EVERY tuple is open; a single closed tuple closes
	// the merge (its fixed length already capped mergedFixed above).
	if maxAllowed < 0 {
		var pick *checker.Type
		var fallback *checker.Type
		for _, shape := range shapes {
			if shape.restType == nil {
				return nil, false // defensive — maxAllowed < 0 implies all open
			}
			if isUnknownOrAny(shape.restType) {
				if fallback == nil {
					fallback = shape.restType
				}
				continue
			}
			if pick == nil {
				pick = shape.restType
				continue
			}
			if pick != shape.restType && !equalTypes(pick, shape.restType) {
				return nil, false
			}
		}
		if pick == nil {
			pick = fallback
		}
		if pick == nil {
			return nil, false
		}
		picks = append(picks, TupleMergePick{Type: pick, Rest: true})
	}
	return picks, true
}

func readTupleShape(typeChecker *checker.Checker, tupleType *checker.Type) (tupleShape, bool) {
	if element := arrayElementType(typeChecker, tupleType); element != nil {
		// No fixed slots, no required prefix, every index typed by the element.
		return tupleShape{restType: element}, true
	}
	if !checker.IsTupleType(tupleType) {
		return tupleShape{}, false
	}
	elementInfos := tupleType.TargetTupleType().ElementInfos()
	typeArguments := typeChecker.GetTypeArguments(tupleType)
	shape := tupleShape{}
	seenTail := false
	for i, info := range elementInfos {
		if i >= len(typeArguments) {
			return tupleShape{}, false
		}
		elementFlags := info.TupleElementFlags()
		if elementFlags&checker.ElementFlagsVariadic != 0 {
			// A `...T` spread of a non-array — out of the bounded merge.
			return tupleShape{}, false
		}
		if elementFlags&checker.ElementFlagsRest != 0 {
			if seenTail {
				return tupleShape{}, false
			}
			seenTail = true
			shape.restType = typeArguments[i]
			continue
		}
		if seenTail {
			return tupleShape{}, false // fixed slot after a rest — not mergeable here
		}
		optional := elementFlags&checker.ElementFlagsOptional != 0
		raw := typeArguments[i]
		slot := tupleSlot{raw: raw, stripped: raw}
		if optional && raw != nil {
			// Optional slots type as `T | undefined`; the STRIPPED view is
			// what merging compares — via the same resolution the plain
			// tuple formulas apply (a bare `unknown?` slot stays unknown, a
			// null-preserving union has no single stripped type → opaque).
			child := ResolveOptionalChild(typeChecker, raw)
			if child.Members != nil {
				slot.stripped = nil
			} else {
				slot.stripped = child.Type
			}
		}
		shape.slots = append(shape.slots, slot)
		if !optional {
			if len(shape.slots)-1 != shape.required {
				return tupleShape{}, false // required after optional — malformed
			}
			shape.required = len(shape.slots)
		}
	}
	return shape, true
}

func isUnknownOrAny(tsType *checker.Type) bool {
	return tsType != nil && tsType.Flags()&(checker.TypeFlagsUnknown|checker.TypeFlagsAny) != 0
}
