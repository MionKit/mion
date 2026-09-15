package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// unknownkeys_union.go owns the union-arm emit for every member of the
// unknown-keys RT family — stripUnknownKeys, unknownKeysToUndefined,
// hasUnknownKeys, unknownKeyErrors. The legacy per-family code each
// re-derived "what counts as a declared key on a union" inline; this
// helper consolidates the decision onto FlatLayout's MergedProps.
//
// Semantic — "loose" merged allowlist:
//   For a union of object members, the declared key set is the UNION of
//   every object member's declared property names. A key present in
//   member A but absent in member B is still "declared" from the union's
//   perspective. This matches the flat encoder's structural identity
//   (the wire merges member properties), and avoids a per-member validate
//   walk on every cleanup call. Trade-off documented on the JS-side
//   doc comments of the public createXxx APIs.
//
// Index-signature carve-out:
//   When the union contains ANY member with an index signature (which
//   FlatLayout buckets into AtomicMembers), the emit is a no-op for the
//   WHOLE family. The runtime value might match the indexed member,
//   where "every key" is declared via the index pattern; applying the
//   merged allowlist would falsely strip valid keys.

// UnknownKeysOpts parameterises the per-family behaviour. Each family's
// KindUnion arm builds an opts struct and calls
// emitUnionUnknownKeysMerged.
type UnknownKeysOpts struct {
	// Snippet is the JS statement run for each undeclared key.
	// `accessor` is the JS expression for the target object (`v` for
	// runtime-shape inputs, `v[1]` for the wire-format reach-in);
	// `keyVar` is the loop variable holding the key name string.
	Snippet func(ctx *EmitContext, accessor, keyVar string) string
	// CodeShape is the resulting RTCode.Type. CodeS for strip/uku/uke
	// (emit statements); CodeE for hasUnknownKeys (the for-loop is
	// wrapped in an IIFE expression that returns `true` on the first
	// undeclared key, `false` after the loop completes).
	CodeShape CodeType
	// JsonWireFormat — true only for ukuWire (the decoder-internal
	// emitter). For an ENVELOPING union (AtomicNeedsTuple true) it prepends
	// `if (Array.isArray(v) && v.length === 2 && v[0] === -1)` and walks
	// `v[1]` instead of `v`. For a round-trips-raw union (no envelope) the
	// wire value is the bare runtime shape, so ukuWire falls back to the
	// plain runtime-shape strip on `v` (see emitUnionUnknownKeysMerged).
	// Always false for the four public-API emitters.
	JsonWireFormat bool
}

// emitUnionUnknownKeysMerged is the consolidated union-arm emit. Reads
// the FlatLayout for the union and produces the per-family for-loop +
// merged-allowlist guard. Returns empty RTCode when there's no work
// to do (a union of primitives, the index-signature carve-out).
func emitUnionUnknownKeysMerged(rt *reflection.RunType, ctx *EmitContext, opts UnknownKeysOpts) RTCode {
	layout := buildFlatLayout(rt, ctx)

	// Index-sig carve-out: any indexed member kills the merged-allowlist
	// approach for the whole union (the runtime value might match the
	// indexed branch, where every key is declared via the pattern).
	if layout.hasIndexSignatureMember(ctx) {
		return RTCode{Code: "", Type: opts.CodeShape}
	}

	// Named class members ride their own `[idx, value]` arm on the wire, not
	// the merged object branch, so the decoder strip reaches into each one by
	// its index (see unionClassMemberWireStrip). Runtime-shape families work
	// on live instances and leave them alone, as before.
	classArms := ""
	if opts.JsonWireFormat && opts.CodeShape == CodeS {
		classArms = unionClassMemberWireStrip(layout, ctx)
	}

	// A round-trips-raw union (AtomicNeedsTuple false) carries NO
	// `[-1, merged]` envelope — its JSON wire value IS the bare runtime
	// shape (union_flat_layout.go). So ukuWire has nothing to reach into:
	// it strips `v` directly, gated on `typeof v === 'object'`, exactly like
	// the runtime-shape families. The wire-format reach-in on `v[1]` applies
	// only to an ENVELOPING union (AtomicNeedsTuple true), where the encoder
	// wrapped the merged object.
	wireFormat := opts.JsonWireFormat && layout.AtomicNeedsTuple

	// The runtime-shape families see a live value, where a named class member
	// is an instance (or a plain object assignable to it) with no wire index to
	// tell it apart, so its declared props join the loose merged allowlist
	// exactly like an object member's: `string | BaseErr` answers for `BaseErr`
	// the way a bare `BaseErr` does. The wire object branch keeps the object
	// members only, a class rides its own index arm there (classArms).
	mergedProps := layout.MergedProps
	if !wireFormat {
		mergedProps = unionMergedPropsWithClasses(layout, ctx)
	}

	// An atomic member can still HOLD keys: an array and a tuple are atomic in the
	// flat layout, so `{a: string}[] | number` has no merged props at all and used
	// to return here with the object inside the array never looked at.
	atomicDescent := unionAtomicMemberDescent(layout, ctx, opts, wireFormat)

	// Atomic-only union — atomic primitives carry no keys; the family
	// has nothing to do beyond the class arms and the descent above.
	if len(mergedProps) == 0 {
		return finishUnionUnknownKeys(ctx, opts, "", atomicDescent, classArms, wireFormat)
	}

	target := ctx.Vλl
	if wireFormat {
		target = ctx.Vλl + "[1]"
	}

	keyVar := ctx.NextLocalVar("uk")
	allowlist := buildAllowlistGuard(mergedProps, keyVar)
	snippet := opts.Snippet(ctx, target, keyVar)
	body := "for (const " + keyVar + " in " + target + ") { if (!(" + allowlist + ")) { " + snippet + "; } }"

	// DESCENT. The loop above answers only for the union's OWN keys; without
	// this, a nested object inside a member is never looked at, so
	// `{tag:'n', inner:{x:1, evil:2}}` came back clean. Same shape the object
	// arms use: walk every node, emit only where a node owns keys.
	if !wireFormat {
		descentLayout := layout
		descentLayout.MergedProps = mergedProps
		body = joinSemicolons(body, unionMergedPropDescent(descentLayout, ctx, target, opts.CodeShape))
	}

	// Non-wire-format runtime gate. The union may match a non-object
	// atomic member at runtime (primitive, array, Date, …); applying
	// the merged-allowlist for-loop in those cases would corrupt
	// array indices or throw on immutable primitives. The merged
	// allowlist only makes sense when v is a plain object. The
	// wire-format path is independently gated by the
	// `[-1, mergedObject]` wrapper check below and keeps its own shape.
	if !wireFormat {
		body = "if (typeof " + ctx.Vλl + " === 'object' && " + ctx.Vλl + " !== null && !Array.isArray(" + ctx.Vλl + ")) { " + body + " }"
	}

	return finishUnionUnknownKeys(ctx, opts, body, atomicDescent, classArms, wireFormat)
}

// finishUnionUnknownKeys renders the merged-allowlist body, the atomic-member descent and the class
// arms in the calling family's own code shape. The two bodies stay SIDE BY SIDE rather than nested:
// the merged body walks the union's own keys (and on an enveloping wire lives under the
// `v[0] === -1` gate), while the descent carries its own per-member guard.
func finishUnionUnknownKeys(ctx *EmitContext, opts UnknownKeysOpts, body, atomicDescent, classArms string, wireFormat bool) RTCode {
	v := ctx.Vλl
	envelopeGate := "Array.isArray(" + v + ") && " + v + ".length === 2 && " + v + "[0] === -1"

	switch opts.CodeShape {
	case CodeE:
		// hasUnknownKeys hoists the loop into a context fn: snippet emits
		// `return true` inside the loop; the fn returns `false` after the
		// loop terminates with no hit. The call is a single CodeE
		// expression and the closure is created once per materialization,
		// not per call. The wire-format variant nests: the outer gate fn
		// calls the inner scan fn (declared first — context lines emit in
		// allocation order, so the reference always resolves).
		if body == "" && atomicDescent == "" {
			return RTCode{Code: "", Type: CodeE}
		}
		params := ctx.CtxFnParams(v)
		if atomicDescent == "" {
			scanCall := ctx.CreateFnInContext(body+" return false;", CodeRB, params, params)
			if wireFormat {
				gate := "if (" + envelopeGate + ") return " + scanCall + "; return false;"
				return RTCode{Code: ctx.CreateFnInContext(gate, CodeRB, params, params), Type: CodeE}
			}
			return RTCode{Code: scanCall, Type: CodeE}
		}
		// With a descent in play both halves have to run before the answer is false, so the whole
		// union becomes ONE gate fn instead of the bare scan call.
		var lines []string
		if body != "" {
			scanCall := ctx.CreateFnInContext(body+" return false;", CodeRB, params, params)
			if wireFormat {
				lines = append(lines, "if ("+envelopeGate+") return "+scanCall+";")
			} else {
				lines = append(lines, "if ("+scanCall+") return true;")
			}
		}
		lines = append(lines, atomicDescent, "return false;")
		return RTCode{Code: ctx.CreateFnInContext(strings.Join(lines, " "), CodeRB, params, params), Type: CodeE}
	default:
		if body != "" && wireFormat {
			body = "if (" + envelopeGate + ") { " + body + " }"
		}
		code := joinSemicolons(classArms, body)
		code = joinSemicolons(code, atomicDescent)
		return RTCode{Code: code, Type: CodeS}
	}
}

// unionAtomicMemberDescent walks the atomic members that can HOLD an undeclared key. An array and a
// tuple are atomic members in the flat layout, so without this the merged-allowlist loop is the
// family's only work and an object one level inside a member is never looked at.
//
// Skipped for a member isExtraProof already clears (a primitive, a literal, an enum, an array of
// those): there is nothing declared in it for a key to be undeclared against, so emitting an arm
// would compile a dispatch chain that does no work. Named class members are skipped too: they ride
// their own arms (unionClassMemberWireStrip on the wire, the merged allowlist at runtime).
//
// The guard is the member's own structural guard on `v`, the same one the encoders dispatch on,
// EXCEPT on an enveloping wire where the member arrives as `[index, value]` and the arm keys on the
// index instead, exactly like unionClassMemberWireStrip.
func unionAtomicMemberDescent(layout FlatLayout, ctx *EmitContext, opts UnknownKeysOpts, wireFormat bool) string {
	v := ctx.Vλl
	var arms []string
	for _, member := range layout.AtomicMembers {
		if member.Ref == nil || member.Resolved == nil || member.ClassName != "" {
			continue
		}
		if atomicMemberExtraProof(member.Resolved, ctx) {
			continue
		}
		guard := atomicStructuralGuard(member.Resolved, ctx, v)
		accessor := v
		if wireFormat {
			guard = "Array.isArray(" + v + ") && " + v + ".length === 2 && " + v + "[0] === " + strconv.Itoa(member.OriginalIndex)
			accessor = v + "[1]"
		}
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(member.Ref, opts.CodeShape)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS || childRT.Code == "" {
			continue
		}
		inner := childRT.Code
		if opts.CodeShape == CodeE {
			inner = "if (" + inner + ") return true;"
		}
		arms = append(arms, "if ("+guard+") { "+inner+" }")
	}
	return strings.Join(arms, ";")
}

// unionMergedPropsWithClasses merges the declared props of the object members
// AND the named class members (the atomic bucket routes a named class through
// per-member index dispatch for the encoders, but for a runtime-shape
// unknown-keys walk it is one more object shape). Same loose-allowlist merge
// buildMergedProps applies to object members; no discriminant is derived, the
// mixed set never dispatches by one.
func unionMergedPropsWithClasses(layout FlatLayout, ctx *EmitContext) []FlatMergedProp {
	members := append([]FlatObject(nil), layout.ObjectMembers...)
	for _, member := range layout.AtomicMembers {
		if member.ClassName == "" || member.Resolved == nil {
			continue
		}
		members = append(members, FlatObject{Ref: member.Ref, Resolved: member.Resolved})
	}
	if len(members) == len(layout.ObjectMembers) {
		return layout.MergedProps
	}
	return buildMergedProps(members, ctx, nil)
}

// unionClassMemberWireStrip renders the decoder-strip arms for the named class
// members of an ENVELOPING union. Each such member encodes as `[idx, value]`
// (a class atomic forces the envelope, see buildFlatLayout), so its wire
// index says which class the value is and the member's own strip body sweeps
// `v[1]` with that class's declared keys:
//
//	if (Array.isArray(v) && v.length === 2 && v[0] === <idx>) { <class strip on v[1]> }
//
// Without this a `string | BaseErr` kept every undeclared key under `strip`
// while a bare `BaseErr` dropped them.
func unionClassMemberWireStrip(layout FlatLayout, ctx *EmitContext) string {
	if !layout.AtomicNeedsTuple {
		return ""
	}
	v := ctx.Vλl
	var arms []string
	for _, member := range layout.AtomicMembers {
		if member.ClassName == "" || member.Ref == nil {
			continue
		}
		ctx.SetChildAccessor(v + "[1]")
		childRT := ctx.CompileChild(member.Ref, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS || childRT.Code == "" {
			continue
		}
		arms = append(arms, "if (Array.isArray("+v+") && "+v+".length === 2 && "+v+"[0] === "+strconv.Itoa(member.OriginalIndex)+") { "+childRT.Code+" }")
	}
	return strings.Join(arms, ";")
}

// buildAllowlistGuard renders the JS expression that's true when keyVar
// matches one of the merged property names. Inline disjunction over a
// Set.has lookup — for typical 2-6 property counts the cost is
// negligible and avoids the Set allocation.
func buildAllowlistGuard(props []FlatMergedProp, keyVar string) string {
	if len(props) == 0 {
		return "false"
	}
	parts := make([]string, 0, len(props))
	for _, mp := range props {
		parts = append(parts, keyVar+" === "+quoteJS(mp.Name))
	}
	return strings.Join(parts, " || ")
}

// unionMergedPropDescent compiles the union's merged properties so a nested
// object inside a member gets its own unknown-key check. Emits in the calling
// family's own shape: statements for the accumulate/mutate families, and
// `if (<expr>) return true;` lines for hasUnknownKeys, whose union arm is
// already a context fn that returns a boolean.
//
// # Only single-candidate props descend, and that is a soundness rule
//
// A merged prop with TWO candidates means two members declared the same name
// with different types, e.g. `{tag:'a', data:{x:number}}` vs
// `{tag:'b', data:{y:number}}`. Descending either one reports the other's keys
// as undeclared, so a perfectly clean `{tag:'a', data:{x:1}}` would come back
// with an error. Picking the right candidate means knowing which member the
// value matched, which means validating, which is the one thing this family
// refuses to do (it is the cheap flat loop the fused validator is not). So an
// ambiguous prop is skipped: the merged allowlist stays loose all the way down,
// which is the same trade-off already documented at the top of this file.
//
// The unambiguous case is the common one — a discriminated union where each
// member carries its own payload — and it is exactly the case that was silently
// returning clean.
//
// No presence guard is needed for a prop a sibling member does not declare: the
// accessor reads `undefined`, and every arm that would act on it carries its own
// shape guard (unknownKeysObjectGuard on an object, `instanceof` on Map/Set),
// so it contributes nothing.
//
// Skipped for the wire-format reach-in (ukuWire on an ENVELOPING union): there
// the walked value is `v[1]`, a merged wire object whose nested slots are the
// encoder's shape rather than the runtime one.
func unionMergedPropDescent(layout FlatLayout, ctx *EmitContext, target string, shape CodeType) string {
	var parts []string
	for _, mergedProp := range layout.MergedProps {
		if len(mergedProp.Candidates) != 1 {
			continue
		}
		candidate := mergedProp.Candidates[0]
		if candidate.ChildRef == nil {
			continue
		}
		ctx.SetChildAccessor(propertyAccessor(target, mergedProp.Name, mergedProp.IsSafeName))
		ctx.SetChildPathLiteral(quoteJS(mergedProp.Name))
		childRT := ctx.CompileChild(candidate.ChildRef, shape)
		ctx.SetChildAccessor("")
		ctx.SetChildPathLiteral("")
		if childRT.Type == CodeNS || childRT.Code == "" {
			continue
		}
		if shape == CodeE {
			parts = append(parts, "if ("+childRT.Code+") return true;")
			continue
		}
		parts = append(parts, childRT.Code)
	}
	return strings.Join(parts, ";")
}
