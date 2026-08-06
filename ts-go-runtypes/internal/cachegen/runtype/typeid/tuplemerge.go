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
//
// Sides that genuinely disagree get ONE more chance: when every contender is
// the same primitive base wearing a format brand, the slot FOLDS into that
// base plus the merged annotation (`minimum: 3 ∧ minimum: 5` is
// `minimum: 5`). The fold verdict is computed here, in the shared package, so
// both collapse halves reach it identically — a slot one half folds and the
// other rejects would part a cache entry from its id.
//
// Anything outside that — slots with no common base, impossible
// length windows, variadic spreads — reports ok=false and the callers
// project KindNever: the validator rejects everything, which can
// over-reject but can never silently under-validate. Labels are dropped on
// merge (schema tuples carry none; a labeled hand-written merge is out of
// the convergence contract — logged decision).
package typeid

import (
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// TupleMergePick is one resolved slot of an intersected tuple set. Type is
// the RAW slot type (undefined kept on optional slots) — callers must
// apply the same optional-child resolution the plain tuple formulas use
// (optionalChildID / serializeOptionalChild). Rest marks the single
// trailing open-tail slot, when the merge stays open.
//
// Fold, when set, REPLACES Type: the slot is the fold's base wearing the
// merged annotation, already undefined-stripped, so callers materialize it
// directly instead of running the optional-child resolution.
type TupleMergePick struct {
	Type     *checker.Type
	Fold     *SlotFold
	Optional bool
	Rest     bool
}

// SlotFold is a slot several tuples constrain differently, resolved. Three
// forms, and exactly one is in play:
//
//	Base alone            — a plain type, materialized as itself
//	Base + Annotation     — that base wearing the merged format annotation
//	Arms                  — a union, each arm resolved on its own
type SlotFold struct {
	Base       *checker.Type
	Annotation *protocol.FormatAnnotation
	Arms       []*SlotFold
}

// Structural is the fold's structural key. Each form reuses the formula the
// collapse already uses for its shape (a single base wearing format sentinels,
// a synthetic union), so a folded slot's id is byte-equal to the equivalent
// hand-written spelling's.
func (fold *SlotFold) Structural(computer *Computer) string {
	if len(fold.Arms) > 0 {
		ids := make([]string, 0, len(fold.Arms))
		for _, arm := range fold.Arms {
			ids = append(ids, arm.Structural(computer))
		}
		return collectionJoined(int(protocol.KindUnion), computer.sortedJoin(ids), false)
	}
	if fold.Annotation == nil {
		return computer.Compute(fold.Base)
	}
	return computer.Compute(fold.Base) + FormatAnnotationStructuralKey(fold.Annotation)
}

// foldSlotTypes is the bounded second chance for contending slot types. It
// conjoins them arm by arm: same-base arms merge their format annotations
// (`minimum: 3 ∧ minimum: 5` is `minimum: 5`), identical arms survive as
// themselves, and a pair nothing here can express is DROPPED — dropping a union
// arm narrows the slot, so the failure direction stays over-rejection.
//
// The whole path is new ground: every slot that reaches it previously reported
// a conflict and projected `never`, so no id that resolves today can move.
func foldSlotTypes(typeChecker *checker.Checker, contenders [][]*checker.Type, equalTypes func(a, b *checker.Type) bool) (*SlotFold, bool) {
	if len(contenders) < 2 {
		return nil, false
	}
	// Square up how each side spells `boolean` before anything pairs.
	var booleanType *checker.Type
	for _, contender := range contenders {
		for _, arm := range contender {
			if isBooleanUnion(arm) {
				booleanType = arm
			}
		}
	}
	normalized := make([][]*checker.Type, 0, len(contenders))
	for _, contender := range contenders {
		normalized = append(normalized, normalizeBooleanArms(contender, booleanType))
	}
	accumulated := armsOf(normalized[0])
	folded := false
	for _, contender := range normalized[1:] {
		var next []*SlotFold
		for _, left := range accumulated {
			for _, right := range contender {
				pair, isFold, ok := foldArmPair(typeChecker, left, right, equalTypes)
				if !ok {
					continue // cross-kind or inexpressible — the pair is never
				}
				folded = folded || isFold
				if !containsFold(next, pair, equalTypes) {
					next = append(next, pair)
				}
			}
		}
		if len(next) == 0 {
			return nil, false // every pair pruned: the slot is never
		}
		accumulated = next
	}
	// Nothing actually merged — the contenders differ for a reason this fold
	// cannot express, so hand the conflict back rather than silently widening.
	if !folded {
		return nil, false
	}
	if len(accumulated) == 1 {
		return accumulated[0], true
	}
	return &SlotFold{Arms: accumulated}, true
}

// armsOf wraps an already-flattened arm list as plain folds.
func armsOf(members []*checker.Type) []*SlotFold {
	arms := make([]*SlotFold, 0, len(members))
	for _, member := range members {
		arms = append(arms, &SlotFold{Base: member})
	}
	return arms
}

// armMembersOf flattens one slot contender into the arms the fold pairs up: a
// union's members, an OPAQUE optional's already-resolved member list (the
// stripped view of `T | null | undefined`, which has no single checker type),
// or the type itself.
//
// Flattening is recursive but stops at `boolean`, which the checker reports
// two different ways: a raw union splits it into its literals, the
// optional-child resolution hands it back whole. Pairing those at different
// granularity would prune the boolean arm out of existence, so
// normalizeBooleanArms squares the two up before any pairing happens.
func armMembersOf(slot tupleSlot) []*checker.Type {
	source := slot.members
	if slot.stripped != nil {
		source = []*checker.Type{slot.stripped}
	}
	var arms []*checker.Type
	for _, member := range source {
		arms = flattenArms(member, arms)
	}
	return arms
}

func flattenArms(tsType *checker.Type, arms []*checker.Type) []*checker.Type {
	if tsType != nil && tsType.Flags()&checker.TypeFlagsUnion != 0 && !isBooleanUnion(tsType) {
		for _, member := range tsType.AsUnionOrIntersectionType().Types() {
			arms = flattenArms(member, arms)
		}
		return arms
	}
	return append(arms, tsType)
}

// isBooleanUnion spots the `boolean` type itself — a union of its two literals
// that the checker flags as Boolean.
func isBooleanUnion(tsType *checker.Type) bool {
	return tsType != nil &&
		tsType.Flags()&checker.TypeFlagsUnion != 0 &&
		tsType.Flags()&checker.TypeFlagsBoolean != 0
}

// normalizeBooleanArms rewrites a contender's `true`-and-`false` pair into the
// whole `boolean` another contender already spelled that way, so every side
// pairs at the same granularity. With no side spelling it whole there is
// nothing to square up and the literals stay as they are.
func normalizeBooleanArms(arms []*checker.Type, booleanType *checker.Type) []*checker.Type {
	if booleanType == nil {
		return arms
	}
	literals := 0
	for _, arm := range arms {
		if arm != nil && arm.Flags()&checker.TypeFlagsBooleanLiteral != 0 {
			literals++
		}
	}
	if literals != 2 {
		return arms
	}
	normalized := make([]*checker.Type, 0, len(arms)-1)
	replaced := false
	for _, arm := range arms {
		if arm != nil && arm.Flags()&checker.TypeFlagsBooleanLiteral != 0 {
			if replaced {
				continue
			}
			replaced = true
			normalized = append(normalized, booleanType)
			continue
		}
		normalized = append(normalized, arm)
	}
	return normalized
}

// foldArmPair conjoins one accumulated arm with one incoming arm. isFold marks
// a pair that genuinely merged (as opposed to two identical arms passing
// through), which is what tells the caller the fold did any work at all.
func foldArmPair(
	typeChecker *checker.Checker,
	left *SlotFold,
	right *checker.Type,
	equalTypes func(a, b *checker.Type) bool,
) (pair *SlotFold, isFold bool, ok bool) {
	// A union arm inside a union arm is out of the bounded merge.
	if len(left.Arms) > 0 || left.Base == nil || right == nil {
		return nil, false, false
	}
	if left.Annotation == nil && (left.Base == right || equalTypes(left.Base, right)) {
		return left, false, true // identical arms — one survives
	}
	leftBase, leftAnnotations, leftOK := slotParts(typeChecker, left.Base)
	rightBase, rightAnnotations, rightOK := slotParts(typeChecker, right)
	if !leftOK || !rightOK || leftBase == nil || rightBase == nil {
		return nil, false, false
	}
	if leftBase != rightBase && !equalTypes(leftBase, rightBase) {
		return nil, false, false
	}
	annotations := make([]*protocol.FormatAnnotation, 0, len(leftAnnotations)+len(rightAnnotations)+1)
	if left.Annotation != nil {
		annotations = append(annotations, left.Annotation)
	}
	annotations = append(annotations, leftAnnotations...)
	annotations = append(annotations, rightAnnotations...)
	if len(annotations) == 0 {
		return &SlotFold{Base: leftBase}, false, true
	}
	merged, mergeOK := MergeFormatAnnotations(annotations)
	if !mergeOK || merged == nil {
		return nil, false, false
	}
	return &SlotFold{Base: leftBase, Annotation: merged}, true, true
}

// containsFold dedups the cross product — the six-kind unions JSON Schema
// produces pair up mostly into identical arms.
func containsFold(folds []*SlotFold, candidate *SlotFold, equalTypes func(a, b *checker.Type) bool) bool {
	for _, fold := range folds {
		if len(fold.Arms) > 0 || len(candidate.Arms) > 0 {
			continue
		}
		if fold.Base != candidate.Base && !equalTypes(fold.Base, candidate.Base) {
			continue
		}
		if (fold.Annotation == nil) != (candidate.Annotation == nil) {
			continue
		}
		if fold.Annotation == nil ||
			FormatAnnotationStructuralKey(fold.Annotation) == FormatAnnotationStructuralKey(candidate.Annotation) {
			return true
		}
	}
	return false
}

// slotParts splits a slot type into its primitive/literal base and whatever
// format annotations ride on it. Anything else in the intersection (a real
// object member, another sentinel) makes the slot unfoldable — those carry
// semantics no annotation merge can express.
func slotParts(typeChecker *checker.Checker, tsType *checker.Type) (*checker.Type, []*protocol.FormatAnnotation, bool) {
	if tsType == nil {
		return nil, nil, false
	}
	if tsType.Flags()&checker.TypeFlagsIntersection == 0 {
		if !isFoldableBaseFlags(tsType.Flags()) {
			return nil, nil, false
		}
		return tsType, nil, true
	}
	var base *checker.Type
	var annotations []*protocol.FormatAnnotation
	for _, member := range tsType.AsUnionOrIntersectionType().Types() {
		memberFlags := member.Flags()
		switch {
		case memberFlags&(checker.TypeFlagsAny|checker.TypeFlagsUnknown) != 0:
			// Identity under intersection — skip.
		case isFoldableBaseFlags(memberFlags):
			if base != nil && base != member {
				return nil, nil, false
			}
			base = member
		case memberFlags&checker.TypeFlagsObject != 0:
			annotation := FormatAnnotationFromType(typeChecker, member)
			if annotation == nil {
				if IsFormatBrandMember(typeChecker, member) {
					continue // an unbranded format carries no params
				}
				return nil, nil, false
			}
			annotations = append(annotations, annotation)
		default:
			return nil, nil, false
		}
	}
	return base, annotations, true
}

// isFoldableBaseFlags reports the primitive and literal bases a folded slot
// may sit on. Twin of the collapse's isPrimitiveBaseFlags / isLiteralFlags
// pair, kept here so the fold verdict needs nothing from package runtype.
func isFoldableBaseFlags(flags checker.TypeFlags) bool {
	return flags&(checker.TypeFlagsString|checker.TypeFlagsNumber|checker.TypeFlagsBoolean|
		checker.TypeFlagsBigInt|checker.TypeFlagsESSymbol|checker.TypeFlagsStringLiteral|
		checker.TypeFlagsNumberLiteral|checker.TypeFlagsBooleanLiteral|checker.TypeFlagsBigIntLiteral) != 0
}

// tupleSlot pairs a slot's raw type with its undefined-stripped view.
// stripped == nil marks an OPAQUE optional (`T | null | undefined` — no
// single checker type expresses the strip); members then carries the resolved
// arm list, which is all the annotation fold needs.
type tupleSlot struct {
	raw      *checker.Type
	stripped *checker.Type
	members  []*checker.Type
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
		// Every real contender for this slot, flattened to its arms and kept so
		// a disagreement can try the fold before the merge gives up.
		var contenders [][]*checker.Type
		contended := false
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
			contenders = append(contenders, armMembersOf(contribution))
			if winner.raw == nil {
				winner = contribution
				continue
			}
			// Contenders that disagree keep accumulating: the fold below needs
			// EVERY one of them, so a third shape's constraint can never be
			// dropped by settling the first disagreement early. An OPAQUE
			// optional on either side counts as a disagreement too — there is no
			// single type to compare, but its arms fold like any other union's.
			if winner.stripped == nil || contribution.stripped == nil ||
				(winner.stripped != contribution.stripped && !equalTypes(winner.stripped, contribution.stripped)) {
				contended = true
			}
		}
		optional := i >= minRequired
		// The never check comes FIRST: `T ∧ never` is never whatever the other
		// contenders say, so a contended slot with a never contribution is not
		// a fold candidate at all.
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
		if contended {
			// Contending constraints on one position: foldable when they are the
			// same base wearing format brands, a genuine conflict otherwise.
			fold, ok := foldSlotTypes(typeChecker, contenders, equalTypes)
			if !ok {
				return nil, false
			}
			picks = append(picks, TupleMergePick{Fold: fold, Optional: optional})
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
		var contenders [][]*checker.Type
		contended := false
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
			contenders = append(contenders, armMembersOf(tupleSlot{raw: shape.restType, stripped: shape.restType}))
			if pick == nil {
				pick = shape.restType
				continue
			}
			if pick != shape.restType && !equalTypes(pick, shape.restType) {
				contended = true
			}
		}
		if contended {
			// The tail folds on the same rule the fixed slots do.
			fold, ok := foldSlotTypes(typeChecker, contenders, equalTypes)
			if !ok {
				return nil, false
			}
			return append(picks, TupleMergePick{Fold: fold, Rest: true}), true
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
				slot.members = child.Members
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
