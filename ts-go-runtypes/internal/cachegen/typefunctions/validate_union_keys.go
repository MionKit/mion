package typefunctions

import "github.com/mionkit/mion/ts-go-runtypes/internal/reflection"

// The UNION-SCOPED validator families behind `{checkUnionUnknowns: true}` on createValidateFn / createGetValidationErrorsFn.
//
// The gap they close: a stripping decoder (prepareForJsonClone / compactForJson) rebuilds the DECLARED shape, so a plain
// object's undeclared keys are gone before any validator runs. On a union it cannot do that. It pools every member's property
// names into one allowlist, because it never validates and so cannot know which member matched, and once ANY member carries an
// index signature it emits nothing at all, since a value matching that member really does declare every key. So a key belonging
// to a SIBLING member rides through, and on a record union every key does.
//
// These families check exactly that and nothing else: on a union arm, after the member's own validator has passed, the value
// must carry no key that member leaves undeclared. Everywhere else the emitted body is the plain one, byte for byte.
//
// # Why not just use the fused checkUnknowns families
//
// Those splice a key check into EVERY object-ish node, which is a different contract: it rejects an undeclared key on a plain
// object nested three levels down, where TypeScript assignability would allow it and a stripping decoder has already removed
// it. Paying that on every node to fix a union is the wrong trade, and it is why the router can run this pair alongside
// clone / compact while `mutateStrict`, which strips nothing, needs the fused pair.
//
// # The splice lives on the UNION arm, not the object arm
//
// It cannot live where the fused families put it. A named union member is dep-called into its own entry (walker.dispatch sends
// every compound external past depth 1), and at that entry's own root it no longer knows it sits under a union: ParentIsUnion
// is false there. emitUnionValidate holds the resolved member either way, so the assertion is built there and AND-ed onto the
// arm, whether the arm is an inline body or a dep call.
//
// Appended LAST in the arm, which is what makes strictObjectKeyAssertion's O(1) key-count compare sound: every declared
// property was just verified present by the expression to its left.
//
// # Two or more key-bearing members, or the check does not run
//
// With one such member there is nothing to disambiguate, and checking it anyway would turn `{a: string} | number` into a strict
// object check. Index-signature members COUNT toward the two (they are the case that motivates this) but never take an
// assertion of their own, since every key matching the index is declared. Below two, nothing is appended and the body is
// identical to plain validate's, which is asserted rather than assumed.

// UnionMemberKeys marks a family whose union arms assert that the matched member declares every key on the value.
// The verdict rides the emitter identity, so every child entry the family renders agrees with its root.
// A marker method with an empty body, like StrictUnknownKeys: asserting it claims the union arms carry the check.
type UnionMemberKeys interface {
	ChecksUnionMemberKeys()
}

// ValidateUnionKeysEmitter is `validate` plus the per-member key assertion on union arms; everything else is inherited.
type ValidateUnionKeysEmitter struct{ ValidateEmitter }

func (ValidateUnionKeysEmitter) ChecksUnionMemberKeys() {}

// ValidationErrorsUnionKeysEmitter is the error twin. A union failure stays ONE `{expected: 'union'}` error, since the
// offending key is only undeclared relative to a branch; emitUnionValidationErrors just delegates its verdict to the
// validator of THIS family instead of the plain one, or it would report nothing for a value its own validator rejects.
type ValidationErrorsUnionKeysEmitter struct{ ValidationErrorsEmitter }

func (ValidationErrorsUnionKeysEmitter) ChecksUnionMemberKeys() {}

// unionChecksMemberKeys reports whether this union qualifies: two or more members that can carry per-name properties.
// Counted over the SAME child list the arms are emitted from, so the count and the arms can never disagree.
func unionChecksMemberKeys(children []*reflection.RunType, ctx *EmitContext) bool {
	keyBearing := 0
	for _, child := range children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if unionMemberBearsKeys(resolved) && !isFunctionLikeKind(resolved.Kind) {
			keyBearing++
			if keyBearing > 1 {
				return true
			}
		}
	}
	return false
}

// unionMemberBearsKeys reports whether a member can carry per-name properties at all, the "key-bearing" count above.
// An array, a tuple, a Date / Map / Set / Temporal class and every atomic answer no: their enumerable keys are their
// elements or entries, never declarations, so pairing one with an object member leaves nothing to disambiguate.
func unionMemberBearsKeys(resolved *reflection.RunType) bool {
	switch resolved.Kind {
	case reflection.KindObjectLiteral, reflection.KindIndexSignature:
		return true
	case reflection.KindClass:
		// Date / Map / Set / Temporal ride a SubKind; only a plain user class declares properties by name.
		return resolved.SubKind == reflection.SubKindNone
	}
	return false
}

// unionMemberKeyAssertion returns the expression asserting the value at ctx.Vλl carries no key this member leaves
// undeclared, or "" when the member takes no assertion. Callers must already have established that the union qualifies.
//
// Empty for every member whose own arm does not go through emitObjectValidate, and empty again for the shapes
// nodeTakesUnknownKeyCheck rules out, an index-signature member above all: it declares every key matching the pattern,
// so a value that reached its arm has nothing undeclared on it.
func unionMemberKeyAssertion(resolved *reflection.RunType, ctx *EmitContext) string {
	switch resolved.Kind {
	case reflection.KindObjectLiteral:
	case reflection.KindClass:
		if resolved.SubKind != reflection.SubKindNone {
			return ""
		}
	default:
		return ""
	}
	if !nodeTakesUnknownKeyCheck(resolved, ctx, objectCallSignatureChild(resolved, ctx)) {
		return ""
	}
	return strictObjectKeyAssertion(resolved, ctx)
}
