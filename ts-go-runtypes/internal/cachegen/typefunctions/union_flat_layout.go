package typefunctions

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// union_flat_layout.go owns the structural decisions every flat-union
// emitter shares — bucketing members into atomic vs object, building
// the merged-property list, and computing the all-or-nothing wrap
// flags via isJsonCompatible. Codegen lives in each emitter family;
// this file produces the layout the codegen iterates.
//
// Layout lives ONLY here, never on protocol.RunType: the merged-prop
// view is an encoding-side dispatch fiction (no canonical RunType
// represents the merged shape) and the protocol describes types,
// not chosen wire formats.

// FlatLayout is the pre-computed flat-union layout. Same instance is
// consumable by every flat encoder/decoder; iterating it should be
// the only structural work an emitter does.
type FlatLayout struct {
	// AtomicMembers carries members that round-trip raw (or via their
	// own per-member factory) — atomics, indexed objects, classes with
	// a non-default SubKind. Order is the original SafeUnionChildren
	// order so OriginalIndex doubles as the wire `[idx, value]` index.
	AtomicMembers []FlatAtomic
	// ObjectMembers carries the mergeable object/class members — the
	// ones whose properties join into the merged-prop set. Order is
	// the SafeUnionChildren order minus atomics.
	ObjectMembers []FlatObject
	// MergedProps is the deduplicated property list across ObjectMembers,
	// ordered by first appearance.
	MergedProps []FlatMergedProp
	// AtomicNeedsTuple is the all-or-nothing wrap flag, set to the
	// negation of roundTripsRaw. True iff at least one member (atomic
	// OR object/record) carries an encode/decode transform, so the whole
	// union wraps (`[armIndex, value]` atomic, `[-1, merged]` object) and
	// the decoder unconditionally unwraps. False when every member is
	// JSON-compatible: no envelope, identity decode. Governs the JSON
	// emitters only — binary always writes its discriminant.
	AtomicNeedsTuple bool
	// HasDiscriminant is true iff the object members share a single
	// required, plain-literal discriminant property (e.g. `kind: "t0"` |
	// `kind: "t1"` | …). When set, the merged-prop sub-dispatch selects
	// each candidate by the discriminant VALUE (DiscName) rather than by
	// re-classifying the prop value — the discriminant is preserved across
	// a round-trip, so the chosen sub-index stays byte-stable even when a
	// prop's value normalises to an ambiguous shape (e.g.
	// `Record<string, undefined>` → `{}` after JSON drops undefined
	// entries). See FlatPropCandidate.DiscValues.
	HasDiscriminant bool
	// DiscName is the discriminant property name (valid only when
	// HasDiscriminant). DiscIsSafeName mirrors propertyAccessor's safe-name
	// flag for it.
	DiscName       string
	DiscIsSafeName bool
}

// discAccessor renders the JS accessor for the union discriminant on `v`
// (e.g. `v.kind` or `v["weird key"]`). Empty when the layout has no usable
// discriminant.
func (layout FlatLayout) discAccessor(v string) string {
	if !layout.HasDiscriminant {
		return ""
	}
	return propertyAccessor(v, layout.DiscName, layout.DiscIsSafeName)
}

type FlatAtomic struct {
	Ref           *protocol.RunType
	Resolved      *protocol.RunType
	OriginalIndex int
	// ClassName is the user-facing class name when this atomic member is a
	// named plain user class (KindClass + SubKindNone) routed through
	// per-member index dispatch so its class-serializer wrapper reconstructs
	// the instance. Empty for every other atomic member (atomics, indexed
	// objects, Date/Map/Set classes). When set, the encoders guard this
	// member's arm by instance identity (`cs_<name> && v instanceof
	// cs_<name>.cls`) ahead of the structural fallback.
	ClassName string
}

type FlatObject struct {
	Ref      *protocol.RunType
	Resolved *protocol.RunType
}

type FlatMergedProp struct {
	Name       string
	IsSafeName bool
	// Required is true iff every ObjectMember declared the property AND
	// no declaration is `?:` optional. Lets the emit skip the per-prop
	// `=== undefined` guard for these slots.
	Required bool
	// NeedsSubWrap is the all-or-nothing wrap flag for this prop's
	// multi-candidate sub-dispatch — true iff at least one candidate
	// is non-JSON-natural. Single-candidate or no-candidate props are
	// always false.
	NeedsSubWrap bool
	// HasStrippedCandidate is true iff at least one object member declared
	// this property name with a DataOnly-stripped type (symbol / function-
	// like / Promise / non-serializable native / never) that was dropped
	// from Candidates. The merge collapses the prop to its surviving
	// candidate(s), so a value belonging to the STRIPPED member still
	// carries the key (e.g. `f2: Uint8Array` for a member whose sibling
	// declares `f2: Date`) — the encode must guard the surviving codec
	// with a value check and DROP the key when it matches none, instead of
	// mis-applying the surviving codec to a foreign value. Always implies
	// !Required (the stripped member never marks the prop present).
	HasStrippedCandidate bool
	Candidates           []FlatPropCandidate
}

type FlatPropCandidate struct {
	ChildRef *protocol.RunType
	Resolved *protocol.RunType
	Optional bool
	// DiscValues lists the discriminant JS literals (e.g. `"t3"`, `1`) of
	// the object members that declared THIS candidate for the prop. Only
	// populated when the layout has a usable discriminant; a candidate
	// shared by two members (same canonical child id) carries both their
	// discriminant values. The encoders dispatch a value to this candidate
	// when its discriminant matches one of these, instead of re-validating.
	DiscValues []string
}

// hasDiscDispatch reports whether the merged prop can use discriminant-based
// candidate selection: there are multiple candidates needing a sub-wrap AND
// every candidate carries at least one discriminant value (so each one is
// reachable by a discriminant match). Single-candidate / no-sub-wrap props
// never need it.
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

// buildFlatLayout consolidates the four legacy helpers
// (splitUnionMembersFlat / buildMergedProps / atomicBranchNeedsTuple /
// mergedPropNeedsSubWrap) into one pass. Recomputed on each call —
// the work is bounded and avoiding shared state keeps the emitter
// pipeline simple.
func buildFlatLayout(rt *protocol.RunType, ctx *EmitContext) FlatLayout {
	layout := FlatLayout{}
	// DataOnly-strip members (symbol / function-like / Promise /
	// non-serializable / never) so a union like `Date | symbol` lays out as
	// `Date`. An all-stripped union keeps its members and falls through to the
	// alwaysThrow path (see union_strip.go). Surviving refs stay gap-free so
	// OriginalIndex (the loop index) is the symmetric encode/decode wire index.
	children := dataOnlyUnionMembers(rt, ctx)
	for i, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil {
			continue
		}
		// Object-like members carrying an index signature fall into the
		// atomic bucket — dynamic keys can't be expressed in the merged
		// property set so they keep per-member dispatch.
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
			layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i})
			continue
		}
		// Only ObjectLiteral / Class (with SubKindNone) participate in
		// the merge. Other object-like kinds (Array, Tuple, Date, Map,
		// Set …) don't expose a stable per-name property surface so
		// they keep per-member dispatch.
		if resolved.Kind == protocol.KindObjectLiteral || resolved.Kind == protocol.KindClass {
			if resolved.Kind == protocol.KindClass && resolved.SubKind != protocol.SubKindNone {
				layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i})
				continue
			}
			// A named plain user class routes through per-member INDEX dispatch
			// (the atomic bucket), NOT the object merge: it compiles via
			// CompileChild, hitting the KindClass encode/decode arms — i.e. the
			// class-serializer wrappers — so decode reconstructs the instance and
			// the numeric member index discriminates which class. An anonymous
			// class (never registrable) or a plain object literal stays in the
			// merge as before.
			if resolved.Kind == protocol.KindClass {
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

	// Detect a usable shared-name literal discriminant across the object
	// members. discValueByMember is parallel to layout.ObjectMembers and
	// feeds per-candidate DiscValues into buildMergedProps.
	discName, discIsSafe, discValueByMember, discOK := detectFlatDiscriminant(layout.ObjectMembers, ctx)
	if discOK {
		layout.HasDiscriminant = true
		layout.DiscName = discName
		layout.DiscIsSafeName = discIsSafe
	}

	layout.MergedProps = buildMergedProps(layout.ObjectMembers, ctx, discValueByMember)

	// AtomicNeedsTuple — the union needs the `[armIndex, value]` / `[-1, merged]`
	// envelope iff it does NOT round-trip raw: some member carries an
	// encode/decode transform, so the decoder must know which arm produced a
	// value. When every member (atomic AND object) is JSON-compatible the whole
	// union passes through native JSON untouched, so no envelope is emitted and
	// the decoder is identity (see roundTripsRaw). This subsumes the old rule
	// (object branch OR any non-JSON-natural atomic member forces wrapping): an
	// object/record branch whose members are all JSON-compatible no longer
	// forces the wrap — that's the record-union optimisation.
	layout.AtomicNeedsTuple = !layout.roundTripsRaw(ctx)
	// A named class atomic member reconstructs on decode (a transform), and it
	// is JSON-compatible (its props round-trip), so roundTripsRaw would
	// otherwise leave the union identity-decoded with no `[idx, value]`
	// envelope — losing both the member index AND the reconstruction. Force the
	// envelope whenever a class atomic is present so the decoder runs.
	if layout.hasClassAtomic() {
		layout.AtomicNeedsTuple = true
	}

	// Per-prop NeedsSubWrap — single-candidate or no-candidate props
	// never need a sub-wrap; multi-candidate props wrap iff at least
	// one candidate is non-JSON-natural.
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

// hasClassAtomic reports whether any atomic member is a named plain user class
// routed through per-member index dispatch (FlatAtomic.ClassName set).
func (layout FlatLayout) hasClassAtomic() bool {
	for _, m := range layout.AtomicMembers {
		if m.ClassName != "" {
			return true
		}
	}
	return false
}

// atomicStructuralGuard is the JS boolean that selects an atomic member by its
// STRUCTURAL shape — the leaf `typeof` / `=== null` fast path or the cross-family
// `val_<member>` check, wrapped in the object-null guard for object-like kinds.
// This is the guard every non-class atomic member uses, and the fallback guard a
// class atomic member uses after its instance-identity arm.
func atomicStructuralGuard(resolved *protocol.RunType, ctx *EmitContext, v string) string {
	validateExpr := unionMemberValidateCheck(resolved, ctx, v)
	if isObjectLikeKind(resolved.Kind) {
		return objectGuard(v, validateExpr)
	}
	return validateExpr
}

// atomicDispatchArm names one encode arm: the member it selects (by index into
// AtomicMembers) and the JS boolean guard that routes a value to it.
type atomicDispatchArm struct {
	Member FlatAtomic
	Guard  string
}

// atomicEncodeDispatch returns the class-serializer lookup prologue and the
// ORDERED atomic-member encode arms shared by every flat JSON encoder (pj / pjs
// / sj). Ordering is what makes class reconstruction sound:
//
//  1. Class members by instance identity (`cs_<name> && v instanceof
//     cs_<name>.cls`) — precise even for two same-shape classes (distinct
//     prototypes), and skipped when the class is unregistered (`cs_<name>`
//     undefined).
//  2. Non-class atomic members by their structural guard (unchanged).
//  3. Class members by their STRUCTURAL guard — the fallback for an unregistered
//     class instance or a plain object assignable to a class-union position
//     (best-effort: two same-shape classes fall to the first, which is harmless
//     since an unregistered class decodes structurally either way).
//
// A class member therefore appears in TWO arms (identity + structural) selecting
// the SAME OriginalIndex; each encoder compiles that member's body once and
// renders it in both arms. The prologue declares `cs_<name>` once per class.
func (layout FlatLayout) atomicEncodeDispatch(v string, ctx *EmitContext) (prologue string, arms []atomicDispatchArm) {
	var decls []string
	seenDecl := make(map[string]bool)
	for _, m := range layout.AtomicMembers {
		if m.ClassName == "" {
			continue
		}
		// Key the lookup by the member's TYPE ID (matching the registry key), and
		// use a distinct `cix_` var (class-identity) so it never collides with the
		// child prepare/restore body's own `cs_` lookup declared by
		// wrap*WithClassSerializer. Epoch-cache it in the closure (same scheme as
		// classSerializerLookup): re-look-up only when the registry epoch moves.
		csVar := "cix_" + sanitizeIdent(m.Resolved.ID)
		if !seenDecl[csVar] {
			seenDecl[csVar] = true
			epVar := csVar + "_ep"
			ctx.SetContextItem("csvar_"+csVar, "let "+csVar+", "+epVar+" = -1")
			decls = append(decls, "if ("+epVar+" !== utl.csEpoch()) { "+csVar+" = utl.getClassSerializer("+quoteJS(m.Resolved.ID)+", "+quoteJS(m.ClassName)+"); "+epVar+" = utl.csEpoch(); }")
		}
		arms = append(arms, atomicDispatchArm{Member: m, Guard: csVar + " && " + v + " instanceof " + csVar + ".cls"})
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

// atomicOnlyJsonIdentity reports whether the union lays out as JSON-identity
// atomic members only (no object branch, no non-JSON-compatible atomic member).
// Such a union round-trips raw: JSON preserves the value's shape and the decoder
// is identity (emitUnionRestoreFromJsonFlat short-circuits on !AtomicNeedsTuple),
// so the JSON encoders collapse to a straight pass-through instead of a per-member
// validate-and-return-unchanged dispatch chain. Literal members are JSON-identity,
// so this covers `'a' | 'b' | 'c'`, `true | false`, `'a' | 2 | string`, etc.
// (Binary is unaffected: it keeps the compact per-member discriminant.)
func (layout FlatLayout) atomicOnlyJsonIdentity() bool {
	return len(layout.ObjectMembers) == 0 && !layout.AtomicNeedsTuple
}

// roundTripsRaw reports whether every member — atomic AND object — is
// isJsonCompatible, i.e. no member carries an encode/decode transform. Such a
// union passes through native JSON unchanged: the encoder needs no
// `[armIndex, value]` / `[-1, merged]` envelope and the decoder is identity,
// even when object/record members are present. The object members still merge
// (the clone strategy keeps stripping undeclared keys); only the wrap is
// dropped. This is the record-union optimisation: e.g.
// `Record<string, number> | {type: string; isTypeError: true}` round-trips as
// the bare object with no `[-1, …]` envelope. Strictly broader than
// atomicOnlyJsonIdentity, which additionally requires zero object members.
// Drives AtomicNeedsTuple (as its negation), so the JSON emitters and the
// shared decoder read the decision off that single flag. Binary is unaffected
// — it always writes the discriminant (union_flat_binary.go ignores
// AtomicNeedsTuple).
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

// buildMergedProps walks every object member, groups its non-static,
// non-function-like Properties / PropertySignatures by name, and
// returns the ordered merged list. Order follows the first appearance
// of each property name across the iteration order of ObjectMembers.
//
// Required is set when EVERY member declares the property non-optionally;
// the emit uses this to drop the per-property `=== undefined` guard.
// Two members carrying the same canonical child id collapse to a
// single candidate (dedupe by ChildRef.ID).
//
// discValueByMember (when non-nil) is parallel to objectMembers and holds
// each member's discriminant JS literal; a candidate accumulates the
// discriminant values of every member that declared it, so the encoders can
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
			// A method-like member (`f0(): T` / `f0: () => T` scanned as a
			// method signature) is a DataOnly-dropped slot exactly like a
			// property whose VALUE is function-typed — but it is a different
			// member KIND, so the stripped-child branch below never sees it.
			// Record it so a surviving same-name candidate from a sibling
			// member gets the value guard: a value from THIS member still
			// carries the key holding a function, and the surviving codec
			// (e.g. serString) must not be applied to it. No diagnostic here —
			// methods are silent skip slots in the standalone object walks too.
			if isFunctionLikeKind(prop.Kind) {
				if prop.Name != "" {
					strippedByName[prop.Name] = true
				}
				continue
			}
			if prop.Kind != protocol.KindProperty && prop.Kind != protocol.KindPropertySignature {
				continue
			}
			if prop.Child == nil {
				continue
			}
			childResolved := ctx.ResolveRef(prop.Child)
			if childResolved == nil {
				continue
			}
			// Drop a property whose child is DataOnly-stripped (function-like,
			// symbol, Promise, non-serialisable, never) — the same set a
			// standalone object absorbs in emitProperty*. Without this the
			// candidate survives into the merge, emits CodeNS, and alwaysThrows
			// the WHOLE union, while `{b: symbol}` on its own would serialize as
			// `{}` (K2). Emit the member-dropped warning so the drop stays visible.
			if isStrippedUnionMember(childResolved) {
				ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, prop.Name)
				// Record so the surviving candidate's codec is guarded — a value
				// from THIS (stripped) member still carries the key with a foreign
				// type the surviving codec must not be applied to (G3 / G4).
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
					// Same canonical child shared by another member — fold this
					// member's discriminant value into the existing candidate.
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
		// A stripped sibling means the prop is absent from at least one member's
		// projection, so it can never be Required (the guard below would also
		// mis-drop the `=== undefined` check).
		merged[i].Required = allPresent && !hasOptionalDecl[merged[i].Name] && !merged[i].HasStrippedCandidate
	}
	return merged
}

// detectFlatDiscriminant looks for a single property name that every object
// member declares as a REQUIRED, plain-literal value with a value unique across
// the members — the classic discriminated-union shape (`kind: "t0"` | …). On
// success it returns the chosen name, its safe-name flag, and a slice parallel
// to objectMembers holding each member's discriminant JS literal.
//
// Self-contained on the resolved layout rather than rt.UnionDiscriminators: it
// only accepts the strictly-usable case (shared name, plain comparable literal)
// and yields the rendered JS literal the encoders compare against directly.
//
// The discriminant lets the merged-prop sub-dispatch pick each candidate by the
// member it belongs to instead of re-validating the prop value — the value is
// preserved across a round-trip, so the chosen sub-index stays byte-stable even
// when a prop normalises to an ambiguous shape (e.g. `Record<string, undefined>`
// collapsing to `{}` once JSON drops its undefined entries).
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
			if prop.Kind != protocol.KindProperty && prop.Kind != protocol.KindPropertySignature {
				continue
			}
			if prop.Child == nil {
				continue
			}
			child := ctx.ResolveRef(prop.Child)
			if child == nil || child.Kind != protocol.KindLiteral {
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
	// A usable name is present in EVERY member with a value unique per member.
	// Pick deterministically (lowest name) so codegen is stable.
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

// plainLiteralJS renders a KindLiteral's value as the JS literal used in an
// equality comparison (`=== "t3"`, `=== 1`, `=== true`). Reports false for
// bigint / symbol literals, whose Literal payload isn't a directly comparable
// plain value, so they're never chosen as a flat discriminant.
func plainLiteralJS(rt *protocol.RunType) (string, bool) {
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
