package typefunctions

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// union_flat_layout.go holds the structural decisions every flat-union emitter shares: bucketing members
// into atomic vs object, the merged-property list, and the wrap flags. Layout lives ONLY here, never on
// reflection.RunType: the merged-prop view is an encoding-side dispatch fiction no canonical RunType
// represents, and the protocol describes types, not chosen wire formats.

// FlatLayout is the pre-computed flat-union layout; iterating it should be the only structural work an emitter does.
type FlatLayout struct {
	// AtomicMembers are the members on per-member dispatch: atomics, indexed objects, classes with a non-default SubKind.
	// Order is the surviving member order, so OriginalIndex doubles as the wire `[idx, value]` index.
	AtomicMembers []FlatAtomic
	// ObjectMembers are the mergeable object/class members, in member order minus the atomics.
	ObjectMembers []FlatObject
	// MergedProps is the deduplicated property list across ObjectMembers, ordered by first appearance.
	MergedProps []FlatMergedProp
	// AtomicNeedsTuple is the all-or-nothing wrap flag, the negation of roundTripsRaw.
	// True iff some member carries a transform: the union wraps `[armIndex, value]` (atomic) or `[-1, merged]` (object).
	// False when every member is JSON-compatible: no envelope, identity decode.
	// Governs the JSON emitters only; binary always writes its discriminant.
	AtomicNeedsTuple bool
	// HasDiscriminant is true iff the object members share one required, plain-literal discriminant property.
	// The merged-prop sub-dispatch then picks a candidate by discriminant VALUE (see FlatPropCandidate.DiscValues).
	// The discriminant survives a round-trip, so the sub-index stays byte-stable even when a prop's value
	// normalises to an ambiguous shape (`Record<string, undefined>` → `{}` once JSON drops undefined entries).
	HasDiscriminant bool
	// DiscName is the discriminant property name (valid only with HasDiscriminant); DiscIsSafeName is its safe-name flag.
	DiscName       string
	DiscIsSafeName bool
	// AtomicsExtraProof is true iff no atomic member can hide an undeclared key anywhere in its subtree.
	// An array is an ATOMIC member, so `{a: string}[] | number` has no ObjectMembers at all: without this the
	// object inside the array is never compiled and its undeclared keys ride straight through.
	// A conjunct rather than a verdict, because buildCompactFlatLayout mutates AtomicNeedsTuple afterwards.
	AtomicsExtraProof bool
}

// discAccessor renders the JS accessor for the union discriminant on `v`, empty when there is no usable discriminant.
func (layout FlatLayout) discAccessor(v string) string {
	if !layout.HasDiscriminant {
		return ""
	}
	return propertyAccessor(v, layout.DiscName, layout.DiscIsSafeName)
}

type FlatAtomic struct {
	Ref           *reflection.RunType
	Resolved      *reflection.RunType
	OriginalIndex int
	// ClassName is the class name when this member is a named plain user class (KindClass + SubKindNone).
	// Set means per-member index dispatch, so its class-serializer wrapper reconstructs the instance on decode.
	// Its arm guards by EXACT constructor ahead of the structural fallback, never `instanceof`, which a
	// subclass instance would also satisfy (see atomicEncodeDispatch).
	ClassName string
}

type FlatObject struct {
	Ref      *reflection.RunType
	Resolved *reflection.RunType
}

type FlatMergedProp struct {
	Name       string
	IsSafeName bool
	// Required is true iff every ObjectMember declared the property AND no declaration is `?:` optional.
	// Lets the emit skip the per-prop `=== undefined` guard for these slots.
	Required bool
	// NeedsSubWrap is the all-or-nothing wrap flag for this prop's multi-candidate sub-dispatch:
	// true iff at least one candidate is non-JSON-natural.
	NeedsSubWrap bool
	// HasStrippedCandidate is true iff an object member declared this name with a DataOnly-stripped type,
	// dropped from Candidates.
	// A value from that STRIPPED member still carries the key (`f2: Uint8Array` where a sibling declares `f2: Date`),
	// so the encode must guard the surviving codec with a value check and DROP the key when it matches none.
	// Always implies !Required (the stripped member never marks the prop present).
	HasStrippedCandidate bool
	Candidates           []FlatPropCandidate
}

type FlatPropCandidate struct {
	ChildRef *reflection.RunType
	Resolved *reflection.RunType
	Optional bool
	// DiscValues lists the discriminant JS literals of the object members that declared THIS candidate for the prop.
	// Populated only with a usable discriminant; a candidate shared by two members carries both their values.
	// The encoders dispatch to this candidate on a discriminant match instead of re-validating.
	DiscValues []string
}

// hasDiscDispatch reports whether the prop can select candidates by discriminant: every candidate must
// carry at least one value, or it would be unreachable.
func (mp FlatMergedProp) hasDiscDispatch() bool {
	if len(mp.Candidates) < 2 || !mp.NeedsSubWrap {
		return false
	}
	for _, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		if len(cand.DiscValues) == 0 {
			return false
		}
	}
	return true
}

// buildFlatLayout computes the whole layout in one pass, recomputed on each call: the work is bounded and
// shared state would complicate the emitter pipeline.
func buildFlatLayout(rt *reflection.RunType, ctx *EmitContext) FlatLayout {
	layout := FlatLayout{}
	// DataOnly-strip members so `Date | symbol` lays out as `Date`; an all-stripped union keeps its members
	// and falls through to the alwaysThrow path (union_strip.go). Surviving refs stay gap-free so
	// OriginalIndex (the loop index) is the symmetric encode/decode wire index.
	children := dataOnlyUnionMembers(rt, ctx)
	for i, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil {
			continue
		}
		// Dynamic keys can't be expressed in the merged property set, so an indexed member keeps per-member dispatch.
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
			layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i})
			continue
		}
		// Other object-like kinds (Array, Tuple, Date, Map, Set …) expose no stable per-name property
		// surface, so only ObjectLiteral / Class with SubKindNone participate in the merge.
		if resolved.Kind == reflection.KindObjectLiteral || resolved.Kind == reflection.KindClass {
			if resolved.Kind == reflection.KindClass && resolved.SubKind != reflection.SubKindNone {
				layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i})
				continue
			}
			// A named plain user class routes through the atomic bucket, NOT the merge: it compiles via
			// CompileChild into the KindClass arms, so decode reconstructs the instance and the member
			// index says which class. An anonymous class (never registrable) or an object literal stays in the merge.
			if resolved.Kind == reflection.KindClass {
				if name := userClassName(resolved); name != "" {
					layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i, ClassName: name})
					continue
				}
			}
			layout.ObjectMembers = append(layout.ObjectMembers, FlatObject{Ref: ref, Resolved: resolved})
			continue
		}
		layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i})
	}

	layout.AtomicsExtraProof = true
	for _, member := range layout.AtomicMembers {
		if !atomicMemberExtraProof(member.Resolved, ctx) {
			layout.AtomicsExtraProof = false
			break
		}
	}

	// discValueByMember is parallel to layout.ObjectMembers and feeds per-candidate DiscValues into buildMergedProps.
	discName, discIsSafe, discValueByMember, discOK := detectFlatDiscriminant(layout.ObjectMembers, ctx)
	if discOK {
		layout.HasDiscriminant = true
		layout.DiscName = discName
		layout.DiscIsSafeName = discIsSafe
	}

	layout.MergedProps = buildMergedProps(layout.ObjectMembers, ctx, discValueByMember)

	// The envelope is needed iff the union does NOT round-trip raw: some member carries a transform, so the
	// decoder must know which arm produced a value. An object/record branch whose members are all
	// JSON-compatible does not force the wrap: that is the record-union optimisation.
	layout.AtomicNeedsTuple = !layout.roundTripsRaw(ctx)
	// A named class atomic reconstructs on decode yet is JSON-compatible, so roundTripsRaw would leave the
	// union identity-decoded, losing both the member index AND the reconstruction: force the envelope.
	if layout.hasClassAtomic() {
		layout.AtomicNeedsTuple = true
	}

	for i := range layout.MergedProps {
		mp := &layout.MergedProps[i]
		if len(mp.Candidates) < 2 {
			continue
		}
		for _, cand := range mp.Candidates {
			if cand.Resolved == nil {
				continue
			}
			if !isJsonCompatible(cand.Resolved, ctx) {
				mp.NeedsSubWrap = true
				break
			}
		}
	}

	return layout
}

// hasClassAtomic reports whether any atomic member is a named plain user class (FlatAtomic.ClassName set).
func (layout FlatLayout) hasClassAtomic() bool {
	for _, m := range layout.AtomicMembers {
		if m.ClassName != "" {
			return true
		}
	}
	return false
}

// atomicStructuralGuard is the JS boolean that selects an atomic member by its STRUCTURAL shape.
// Every non-class atomic member uses it, and a class atomic member uses it after its instance-identity arm.
func atomicStructuralGuard(resolved *reflection.RunType, ctx *EmitContext, v string) string {
	validateExpr := unionMemberValidateCheck(resolved, ctx, v)
	if isObjectLikeKind(resolved.Kind) {
		return objectGuard(v, validateExpr)
	}
	return validateExpr
}

// atomicDispatchArm is one encode arm: the member it selects and the JS boolean that routes a value to it.
type atomicDispatchArm struct {
	Member FlatAtomic
	Guard  string
}

// atomicEncodeDispatch returns the class-serializer lookup prologue and the ORDERED atomic-member encode
// arms every flat JSON encoder shares. The order is what makes class reconstruction sound:
//
//  1. Class members by EXACT constructor: precise even for two same-shape classes, independent of member
//     order (the checker's, not the source's), and skipped when the class is unregistered.
//  2. Non-class atomic members by their structural guard.
//  3. Class members by their STRUCTURAL guard, the fallback for an unregistered class, a subclass instance
//     or a plain object of that shape (two same-shape classes fall to the first, harmless: a structural
//     decode rebuilds the declared class either way).
//
// There is deliberately NO `instanceof` arm: a subclass instance is not the declared class, so it takes the
// structural road and its undeclared keys stay the unknown-keys machinery's business.
// A class member therefore appears in TWO arms selecting the SAME OriginalIndex, so each encoder compiles
// that member's body once and renders it in both.
func (layout FlatLayout) atomicEncodeDispatch(v string, ctx *EmitContext) (prologue string, arms []atomicDispatchArm) {
	var decls []string
	seenDecl := make(map[string]bool)
	for _, m := range layout.AtomicMembers {
		if m.ClassName == "" {
			continue
		}
		// Key the lookup by the member's TYPE ID (the registry key) in a distinct `cix_` var, so it never
		// collides with the child body's own `cs_` lookup declared by wrap*WithClassSerializer.
		// Epoch-cached in the closure like classSerializerLookup: re-look-up only when the registry epoch moves.
		csVar := "cix_" + sanitizeIdent(m.Resolved.ID)
		if !seenDecl[csVar] {
			seenDecl[csVar] = true
			epVar := csVar + "_ep"
			ctx.SetContextItem("csvar_"+csVar, "let "+csVar+", "+epVar+" = -1")
			decls = append(decls, "if ("+epVar+" !== utl.csEpoch()) { "+csVar+" = utl.getClassSerializer("+quoteJS(m.Resolved.ID)+", "+quoteJS(m.ClassName)+"); "+epVar+" = utl.csEpoch(); }")
		}
		arms = append(arms, atomicDispatchArm{Member: m, Guard: csVar + " && " + v + "?.constructor === " + csVar + ".cls"})
	}
	for _, m := range layout.AtomicMembers {
		if m.ClassName != "" {
			continue
		}
		arms = append(arms, atomicDispatchArm{Member: m, Guard: atomicStructuralGuard(m.Resolved, ctx, v)})
	}
	for _, m := range layout.AtomicMembers {
		if m.ClassName == "" {
			continue
		}
		arms = append(arms, atomicDispatchArm{Member: m, Guard: atomicStructuralGuard(m.Resolved, ctx, v)})
	}
	if len(decls) > 0 {
		prologue = strings.Join(decls, ";") + ";"
	}
	return prologue, arms
}

// atomicOnlyJsonIdentity reports whether the union is atomic members only, all JSON-compatible and
// extra-proof: JSON preserves the shape and the decoder is identity, so the JSON encoders collapse to a
// straight pass-through instead of a per-member validate-and-return-unchanged chain.
// Literal members are JSON-identity, so this covers `'a' | 'b' | 'c'`, `true | false`, `'a' | 2 | string`.
// Binary is unaffected: it keeps the compact per-member discriminant.
func (layout FlatLayout) atomicOnlyJsonIdentity() bool {
	return len(layout.ObjectMembers) == 0 && !layout.AtomicNeedsTuple && layout.AtomicsExtraProof
}

// atomicMemberExtraProof is isExtraProof plus `any`, `unknown` and bare `object`, reached through any array
// or tuple nesting. Nothing in them is declared, so a strip walk has nothing to remove and the arm would
// compile a dispatch chain that does no work (`any[] | number` emitted a `.map` that strips nothing).
// isExtraProof answers false for those three because it also decides whether a value may be SHARED by
// reference, so widening it would start sharing `any[]` somewhere unrelated: this gate stays local.
func atomicMemberExtraProof(resolved *reflection.RunType, ctx *EmitContext) bool {
	switch resolved.Kind {
	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject:
		return true
	case reflection.KindArray, reflection.KindTupleMember:
		if resolved.Child == nil {
			return true
		}
		leaf := ctx.ResolveRef(resolved.Child)
		return leaf != nil && atomicMemberExtraProof(leaf, ctx)
	case reflection.KindTuple:
		for _, child := range resolved.Children {
			if member := ctx.ResolveRef(child); member != nil && !atomicMemberExtraProof(member, ctx) {
				return false
			}
		}
		return true
	}
	return isExtraProof(resolved, ctx)
}

// hasIndexSignatureMember reports whether an atomic member carries an index signature.
// Such a member declares every key from the union's point of view, so the unknown-keys families answer
// clean for the whole union and the safe decode keeps every key on its object branch.
func (layout FlatLayout) hasIndexSignatureMember(ctx *EmitContext) bool {
	for _, member := range layout.AtomicMembers {
		if member.Resolved != nil && isObjectLikeKind(member.Resolved.Kind) && objectHasIndexSignatureChild(member.Resolved, ctx) {
			return true
		}
	}
	return false
}

// roundTripsRaw reports whether every member, atomic AND object, is isJsonCompatible: none carries a transform.
// Such a union passes through native JSON unchanged, so no `[armIndex, value]` / `[-1, merged]` envelope is
// emitted and the decoder is identity; the object members still merge (the clone strategy keeps stripping
// undeclared keys), only the wrap is dropped. That is the record-union optimisation, e.g.
// `Record<string, number> | {type: string; isTypeError: true}` round-tripping as the bare object.
// Strictly broader than atomicOnlyJsonIdentity, which also requires zero object members.
// Drives AtomicNeedsTuple as its negation. Binary is unaffected: union_flat_binary.go ignores that flag.
func (layout FlatLayout) roundTripsRaw(ctx *EmitContext) bool {
	for _, m := range layout.AtomicMembers {
		if !isJsonCompatible(m.Resolved, ctx) {
			return false
		}
	}
	for _, m := range layout.ObjectMembers {
		if !isJsonCompatible(m.Resolved, ctx) {
			return false
		}
	}
	return true
}

// buildMergedProps groups every object member's non-static, non-function-like properties by name, ordered
// by the first appearance of each name across ObjectMembers.
// Required is set only when EVERY member declares the property non-optionally, which lets the emit drop the
// per-property `=== undefined` guard. Two members carrying the same canonical child id collapse to a single
// candidate (dedupe by ChildRef.ID).
// discValueByMember, when non-nil, is parallel to objectMembers and holds each member's discriminant JS
// literal; a candidate accumulates the values of every member that declared it, so the encoders can
// dispatch by discriminant instead of re-validating the prop value.
func buildMergedProps(objectMembers []FlatObject, ctx *EmitContext, discValueByMember []string) []FlatMergedProp {
	indexByName := make(map[string]int)
	presentInMember := make(map[string][]bool)
	hasOptionalDecl := make(map[string]bool)
	strippedByName := make(map[string]bool)
	var merged []FlatMergedProp
	for memberIdx, m := range objectMembers {
		discValue := ""
		if memberIdx < len(discValueByMember) {
			discValue = discValueByMember[memberIdx]
		}
		for _, propRef := range m.Resolved.Children {
			prop := ctx.ResolveRef(propRef)
			if prop == nil || prop.IsStatic {
				continue
			}
			// A method-like member is a DataOnly-dropped slot like a function-valued property, but a different
			// member KIND, so the stripped-child branch below never sees it. Record it so a surviving
			// same-name candidate gets the value guard: a value from THIS member still carries the key
			// holding a function, which the surviving codec must not be applied to.
			// No diagnostic: methods are silent skip slots in the standalone object walks too.
			if isFunctionLikeKind(prop.Kind) {
				if prop.Name != "" {
					strippedByName[prop.Name] = true
				}
				continue
			}
			if prop.Kind != reflection.KindProperty && prop.Kind != reflection.KindPropertySignature {
				continue
			}
			if prop.Child == nil {
				continue
			}
			childResolved := ctx.ResolveRef(prop.Child)
			if childResolved == nil {
				continue
			}
			// Drop a property whose child is DataOnly-stripped, the same set a standalone object absorbs in
			// emitProperty*: keeping it emits CodeNS and alwaysThrows the WHOLE union, while `{b: symbol}`
			// on its own would serialize as `{}` (K2). The warning keeps the drop visible.
			if isStrippedUnionMember(childResolved) {
				ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, prop.Name)
				// Record so the surviving candidate's codec is guarded: a value from THIS member still
				// carries the key with a foreign type (G3 / G4).
				strippedByName[prop.Name] = true
				continue
			}
			candidate := FlatPropCandidate{ChildRef: prop.Child, Resolved: childResolved, Optional: prop.Optional}
			if discValue != "" {
				candidate.DiscValues = []string{discValue}
			}
			if prop.Optional {
				hasOptionalDecl[prop.Name] = true
			}
			idx, exists := indexByName[prop.Name]
			if !exists {
				indexByName[prop.Name] = len(merged)
				merged = append(merged, FlatMergedProp{
					Name:       prop.Name,
					IsSafeName: prop.IsSafeName,
					Candidates: []FlatPropCandidate{candidate},
				})
				presentInMember[prop.Name] = make([]bool, len(objectMembers))
				presentInMember[prop.Name][memberIdx] = true
				continue
			}
			presentInMember[prop.Name][memberIdx] = true
			candidates := merged[idx].Candidates
			skip := false
			for k, existing := range candidates {
				if existing.ChildRef != nil && candidate.ChildRef != nil && existing.ChildRef.ID == candidate.ChildRef.ID {
					if discValue != "" {
						candidates[k].DiscValues = append(candidates[k].DiscValues, discValue)
					}
					skip = true
					break
				}
			}
			if !skip {
				merged[idx].Candidates = append(candidates, candidate)
			}
		}
	}
	for i := range merged {
		presence := presentInMember[merged[i].Name]
		allPresent := len(presence) == len(objectMembers)
		if allPresent {
			for _, ok := range presence {
				if !ok {
					allPresent = false
					break
				}
			}
		}
		merged[i].HasStrippedCandidate = strippedByName[merged[i].Name]
		// A stripped sibling means the prop is absent from one member's projection, so it can never be
		// Required: the emit would otherwise mis-drop the `=== undefined` check.
		merged[i].Required = allPresent && !hasOptionalDecl[merged[i].Name] && !merged[i].HasStrippedCandidate
	}
	return merged
}

// detectFlatDiscriminant looks for one property name every object member declares as a REQUIRED,
// plain-literal value unique across the members, returning that name, its safe-name flag and a slice
// parallel to objectMembers holding each member's discriminant JS literal.
// Self-contained on the resolved layout rather than rt.UnionDiscriminators: it accepts only the
// strictly-usable case and yields the rendered JS literal the encoders compare against directly.
// The discriminant survives a round-trip, so a sub-dispatch picking candidates by it stays byte-stable even
// when a prop normalises to an ambiguous shape (`Record<string, undefined>` collapsing to `{}` under JSON).
func detectFlatDiscriminant(objectMembers []FlatObject, ctx *EmitContext) (string, bool, []string, bool) {
	if len(objectMembers) < 2 {
		return "", false, nil, false
	}
	// Per member: the plain-literal JS value of each required literal prop.
	litByMember := make([]map[string]string, len(objectMembers))
	safeByName := make(map[string]bool)
	for memberIdx, m := range objectMembers {
		lits := make(map[string]string)
		for _, propRef := range m.Resolved.Children {
			prop := ctx.ResolveRef(propRef)
			if prop == nil || prop.IsStatic || prop.Optional {
				continue
			}
			if prop.Kind != reflection.KindProperty && prop.Kind != reflection.KindPropertySignature {
				continue
			}
			if prop.Child == nil {
				continue
			}
			child := ctx.ResolveRef(prop.Child)
			if child == nil || child.Kind != reflection.KindLiteral {
				continue
			}
			literal, ok := plainLiteralJS(child)
			if !ok {
				continue
			}
			lits[prop.Name] = literal
			safeByName[prop.Name] = prop.IsSafeName
		}
		litByMember[memberIdx] = lits
	}
	// Pick the lowest usable name so codegen is deterministic.
	best := ""
	for name := range litByMember[0] {
		seen := make(map[string]bool, len(objectMembers))
		usable := true
		for memberIdx := range objectMembers {
			value, present := litByMember[memberIdx][name]
			if !present || seen[value] {
				usable = false
				break
			}
			seen[value] = true
		}
		if usable && (best == "" || name < best) {
			best = name
		}
	}
	if best == "" {
		return "", false, nil, false
	}
	discValueByMember := make([]string, len(objectMembers))
	for memberIdx := range objectMembers {
		discValueByMember[memberIdx] = litByMember[memberIdx][best]
	}
	return best, safeByName[best], discValueByMember, true
}

// plainLiteralJS renders a KindLiteral's value as the JS literal used in an equality comparison.
// False for bigint / symbol literals, whose payload isn't directly comparable, so they are never chosen
// as a flat discriminant.
func plainLiteralJS(rt *reflection.RunType) (string, bool) {
	for _, flag := range rt.Flags {
		if flag == "bigint" || flag == "symbol" {
			return "", false
		}
	}
	literal, err := jsLiteralFromAny(rt.Literal)
	if err != nil {
		return "", false
	}
	return literal, true
}
