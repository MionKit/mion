package typefunctions

import "github.com/mionkit/mion/ts-go-runtypes/internal/reflection"

// The union-scoped validator families behind `{checkUnionUnknowns: true}`: on a union arm, once the member's own validator
// has passed, the value must carry no key that member leaves undeclared; everywhere else the body is plain validate's, byte
// for byte. A stripping decoder cannot close this gap on a union: it never validates, so it pools every member's property
// names into one allowlist, and once ANY member carries an index signature it emits nothing at all, so a key belonging to a
// SIBLING member rides through. The fused checkUnknowns families would catch it, but they splice a check into EVERY
// object-ish node, rejecting a key TypeScript allows and a stripping decoder already removed, which is why the router runs
// this pair alongside clone / compact while `mutateStrict`, which strips nothing, needs the fused pair. The splice lives on
// the UNION arm and not the object arm because a named member is dep-called into its own entry, where ParentIsUnion is
// false. Below two key-bearing members nothing is appended: there is nothing to disambiguate, and checking anyway would
// turn `{a: string} | number` into a strict object check.

// UnionMemberKeys marks a family whose union arms assert that the matched member declares every key on the value.
// The verdict rides the emitter identity, so every child entry the family renders agrees with its root.
type UnionMemberKeys interface {
	ChecksUnionMemberKeys()
}

// ValidateUnionKeysEmitter is `validate` plus the per-member key assertion on union arms; everything else is inherited.
type ValidateUnionKeysEmitter struct{ ValidateEmitter }

func (ValidateUnionKeysEmitter) ChecksUnionMemberKeys() {}

// ValidationErrorsUnionKeysEmitter is the error twin: a union failure stays ONE `{expected: 'union'}` error, since the
// offending key is only undeclared relative to a branch, and the verdict comes from THIS family's validator.
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
// Arrays, tuples, Date / Map / Set / Temporal and atomics answer no: their keys are elements or entries, not declarations.
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
// undeclared, or "" when the member takes no assertion; callers must already have established that the union qualifies.
// Empty for an index-signature member above all, which declares every key matching its pattern.
func unionMemberKeyAssertion(resolved *reflection.RunType, ctx *EmitContext) string {
	if !unionMemberBearsKeys(resolved) || resolved.Kind == reflection.KindIndexSignature {
		return ""
	}
	if !nodeTakesUnknownKeyCheck(resolved, ctx, objectCallSignatureChild(resolved, ctx)) {
		return ""
	}
	return strictObjectKeyAssertion(resolved, ctx)
}
