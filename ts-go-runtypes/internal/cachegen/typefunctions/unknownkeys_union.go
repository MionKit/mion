package typefunctions

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/reflection"
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
// to do (atomic-only union, all-index-sig union, …).
func emitUnionUnknownKeysMerged(rt *reflection.RunType, ctx *EmitContext, opts UnknownKeysOpts) RTCode {
	layout := buildFlatLayout(rt, ctx)

	// Index-sig carve-out — any indexed member kills the merged-allowlist
	// approach for the whole union (the runtime value might match the
	// indexed branch, where every key is declared via the pattern).
	for _, atomic := range layout.AtomicMembers {
		if atomic.Resolved == nil {
			continue
		}
		if isObjectLikeKind(atomic.Resolved.Kind) && objectHasIndexSignatureChild(atomic.Resolved, ctx) {
			return RTCode{Code: "", Type: opts.CodeShape}
		}
	}

	// Atomic-only union — atomic primitives carry no keys; the family
	// has nothing to do.
	if len(layout.ObjectMembers) == 0 {
		return RTCode{Code: "", Type: opts.CodeShape}
	}
	if len(layout.MergedProps) == 0 {
		return RTCode{Code: "", Type: opts.CodeShape}
	}

	// A round-trips-raw union (AtomicNeedsTuple false) carries NO
	// `[-1, merged]` envelope — its JSON wire value IS the bare runtime
	// shape (union_flat_layout.go). So ukuWire has nothing to reach into:
	// it strips `v` directly, gated on `typeof v === 'object'`, exactly like
	// the runtime-shape families. The wire-format reach-in on `v[1]` applies
	// only to an ENVELOPING union (AtomicNeedsTuple true), where the encoder
	// wrapped the merged object.
	wireFormat := opts.JsonWireFormat && layout.AtomicNeedsTuple

	target := ctx.Vλl
	if wireFormat {
		target = ctx.Vλl + "[1]"
	}

	keyVar := ctx.NextLocalVar("uk")
	allowlist := buildAllowlistGuard(layout.MergedProps, keyVar)
	snippet := opts.Snippet(ctx, target, keyVar)
	body := "for (const " + keyVar + " in " + target + ") { if (!(" + allowlist + ")) { " + snippet + "; } }"

	// DESCENT. The loop above answers only for the union's OWN keys; without
	// this, a nested object inside a member is never looked at, so
	// `{tag:'n', inner:{x:1, evil:2}}` came back clean. Same shape the object
	// arms use: walk every node, emit only where a node owns keys.
	if !wireFormat {
		body = joinSemicolons(body, unionMergedPropDescent(layout, ctx, target, opts.CodeShape))
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

	switch opts.CodeShape {
	case CodeE:
		// hasUnknownKeys hoists the loop into a context fn: snippet emits
		// `return true` inside the loop; the fn returns `false` after the
		// loop terminates with no hit. The call is a single CodeE
		// expression and the closure is created once per materialization,
		// not per call. The wire-format variant nests: the outer gate fn
		// calls the inner scan fn (declared first — context lines emit in
		// allocation order, so the reference always resolves).
		params := ctx.CtxFnParams(ctx.Vλl)
		scanCall := ctx.CreateFnInContext(body+" return false;", CodeRB, params, params)
		if wireFormat {
			gate := "if (Array.isArray(" + ctx.Vλl + ") && " + ctx.Vλl + ".length === 2 && " + ctx.Vλl + "[0] === -1) return " + scanCall + "; return false;"
			return RTCode{Code: ctx.CreateFnInContext(gate, CodeRB, params, params), Type: CodeE}
		}
		return RTCode{Code: scanCall, Type: CodeE}
	default:
		if wireFormat {
			gated := "if (Array.isArray(" + ctx.Vλl + ") && " + ctx.Vλl + ".length === 2 && " + ctx.Vλl + "[0] === -1) { " + body + " }"
			return RTCode{Code: gated, Type: CodeS}
		}
		return RTCode{Code: body, Type: CodeS}
	}
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
