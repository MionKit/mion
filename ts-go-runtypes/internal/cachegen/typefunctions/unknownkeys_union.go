package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// unknownkeys_union.go owns the union arm of every unknown-keys family (strip, toUndefined, has, errors), consolidating
// "what counts as a declared key on a union" onto FlatLayout's MergedProps. The allowlist is LOOSE: the declared key set
// is the union of every object member's property names, so a key only member A declares still counts as declared. That
// matches the flat encoder's structural identity and avoids a per-member validate walk on every cleanup call. When ANY
// member carries an index signature the emit is a no-op for the WHOLE family: the value might match that member, where
// every key is declared via the pattern, and the merged allowlist would strip valid keys.

// UnknownKeysOpts parameterises the per-family behaviour of emitUnionUnknownKeysMerged.
type UnknownKeysOpts struct {
	// Snippet is the JS statement run for each undeclared key; `accessor` is `v`, or `v[1]` on the wire-format reach-in.
	Snippet func(ctx *EmitContext, accessor, keyVar string) string
	// CodeShape is CodeS for strip/uku/uke, CodeE for hasUnknownKeys, whose loop is hoisted into a fn returning true on a hit.
	CodeShape CodeType
	// JsonWireFormat is true only for ukuWire, the decoder-internal emitter; always false for the four public-API emitters.
	// On an ENVELOPING union (AtomicNeedsTuple) it gates on the `[-1, merged]` wrapper and walks `v[1]`; a round-trips-raw
	// union carries no envelope, so its wire value IS the runtime shape and ukuWire strips `v` directly.
	JsonWireFormat bool
}

// emitUnionUnknownKeysMerged emits the per-family loop plus merged-allowlist guard, empty when there is no work
// (a union of primitives, the index-signature carve-out).
func emitUnionUnknownKeysMerged(rt *reflection.RunType, ctx *EmitContext, opts UnknownKeysOpts) RTCode {
	layout := buildFlatLayout(rt, ctx)

	// Index-sig carve-out: the value might match the indexed branch, where every key is declared via the pattern.
	if layout.hasIndexSignatureMember(ctx) {
		return RTCode{Code: "", Type: opts.CodeShape}
	}

	// A named class member rides its own `[idx, value]` wire arm, not the merged object branch (unionClassMemberWireStrip).
	classArms := ""
	if opts.JsonWireFormat && opts.CodeShape == CodeS {
		classArms = unionClassMemberWireStrip(layout, ctx)
	}

	// A round-trips-raw union carries no `[-1, merged]` envelope, so its wire value IS the runtime shape (union_flat_layout.go)
	// and ukuWire strips `v` directly; the `v[1]` reach-in applies only to an ENVELOPING union.
	wireFormat := opts.JsonWireFormat && layout.AtomicNeedsTuple

	// On a live value a named class member has no wire index to tell it apart, so its declared props join the loose merged
	// allowlist like an object member's: `string | BaseErr` answers for `BaseErr` the way a bare `BaseErr` does.
	mergedProps := layout.MergedProps
	if !wireFormat {
		mergedProps = unionMergedPropsWithClasses(layout, ctx)
	}

	// An atomic member can still HOLD keys: an array and a tuple are atomic here, so `{a: string}[] | number` has no merged props.
	atomicDescent := unionAtomicMemberDescent(layout, ctx, opts, wireFormat)

	// Atomic primitives carry no keys, so nothing is left beyond the class arms and the descent above.
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

	// DESCENT. The loop above answers only for the union's OWN keys, so without it `{tag:'n', inner:{x:1, evil:2}}` reads clean.
	if !wireFormat {
		descentLayout := layout
		descentLayout.MergedProps = mergedProps
		body = joinSemicolons(body, unionMergedPropDescent(descentLayout, ctx, target, opts.CodeShape))
	}

	// The union may match a non-object member at runtime (primitive, array, Date), where the loop would corrupt array
	// indices or throw on a primitive. The wire-format path is gated by the `[-1, merged]` wrapper check below instead.
	if !wireFormat {
		body = "if (typeof " + ctx.Vλl + " === 'object' && " + ctx.Vλl + " !== null && !Array.isArray(" + ctx.Vλl + ")) { " + body + " }"
	}

	return finishUnionUnknownKeys(ctx, opts, body, atomicDescent, classArms, wireFormat)
}

// finishUnionUnknownKeys renders the merged body, the atomic-member descent and the class arms in the caller's code shape.
// The merged body and the descent stay SIDE BY SIDE, never nested: each carries its own gate.
func finishUnionUnknownKeys(ctx *EmitContext, opts UnknownKeysOpts, body, atomicDescent, classArms string, wireFormat bool) RTCode {
	v := ctx.Vλl
	envelopeGate := "Array.isArray(" + v + ") && " + v + ".length === 2 && " + v + "[0] === -1"

	switch opts.CodeShape {
	case CodeE:
		// hasUnknownKeys hoists the loop into a context fn, created once per materialization rather than per call.
		// The wire-format variant nests: the inner scan fn is declared first, since context lines emit in allocation order.
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
		// With a descent in play both halves must run before the answer is false, so the union becomes ONE gate fn.
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

// unionAtomicMemberDescent walks the atomic members that can HOLD an undeclared key: an array and a tuple are atomic in
// the flat layout, so without this an object one level inside a member is never looked at.
// A member atomicMemberExtraProof clears is skipped (nothing declared for a key to be undeclared against), and so are
// named class members, which ride their own arms.
// The guard is the member's own structural guard, the one the encoders dispatch on, EXCEPT on an enveloping wire where
// the member arrives as `[index, value]` and the arm keys on the index.
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

// unionMergedPropsWithClasses merges the object members' declared props with the named class members', which a
// runtime-shape walk sees as one more object shape. No discriminant is derived: the mixed set never dispatches by one.
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

// unionClassMemberWireStrip renders the decoder-strip arms for the named class members of an ENVELOPING union.
// Each encodes as `[idx, value]` (a class atomic forces the envelope, see buildFlatLayout), so the wire index says which
// class it is and that member's strip body sweeps `v[1]`.
// Without this a `string | BaseErr` kept every undeclared key under `strip` while a bare `BaseErr` dropped them.
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

// buildAllowlistGuard renders the test that keyVar is one of the merged property names.
// An inline disjunction beats a Set.has lookup at the typical 2-6 property counts and allocates nothing.
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

// unionMergedPropDescent compiles the union's merged properties so a nested object inside a member gets its own check.
// It emits in the caller's shape: statements for the accumulate/mutate families, `if (<expr>) return true;` for hasUnknownKeys.
//
// # Only single-candidate props descend, and that is a soundness rule
//
// Two candidates means two members declared the same name with different types, so descending either reports the other's
// keys as undeclared and a clean `{tag:'a', data:{x:1}}` comes back with an error. Picking the right one means knowing
// which member matched, which means validating, the one thing this family refuses to do. So an ambiguous prop is skipped
// and the merged allowlist stays loose all the way down, the same trade-off as the file header.
//
// No presence guard is needed for a prop a sibling member does not declare: the accessor reads `undefined` and every arm
// that would act on it carries its own shape guard.
// Skipped for the wire-format reach-in, where the walked `v[1]` holds the encoder's shape rather than the runtime one.
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
