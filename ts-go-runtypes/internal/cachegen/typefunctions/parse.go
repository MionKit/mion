package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// createParseFn takes a JSON.parse output and gives back the typed value, or throws. A parse body walks
// nothing itself, it composes the already-compiled families: loose = rj + val, strip = ukuw + rj + val
// (ukuw blanks undeclared keys before restore), fail = rj + vst, the fused validate{checkUnknowns} that
// costs one pass instead of validate + hasUnknownKeys. An earlier version emitted its own per-node walk that
// restored and checked at each node; it measured 0.46x of a plain validate, and composing also stops parse
// drifting behind the families it would duplicate. The rj call is wrapped because restoreFromJsonMutate
// assumes an already-validated caller and throws RAW on malformed input, and parse is the one family whose
// job is untrusted input, so every throw becomes RTParseError; the call is omitted outright when the restore
// is provably identity. The body THROWS rather than reporting through a status holder, because the return
// value is the restored data: the sentinel carries that restored value, which is what makes
// RTParseError.issues identical to getValidationErrors(restore(v)).

// ExtrasPolicy names what a parse family does with properties the type does not declare.
type ExtrasPolicy int

const (
	// ExtrasPreserve keeps them, and is the DEFAULT: the cheapest shape (no pre-pass, no key check), and what
	// zod does, which strips only under `.strict()`.
	ExtrasPreserve ExtrasPolicy = iota
	// ExtrasStrip blanks them with the ukuw pre-pass before restore walks the declared shape, the same two-step
	// the `strip` JSON decoder uses.
	ExtrasStrip
	// ExtrasFail rejects a value carrying them, checking through the fused validate{checkUnknowns} entry.
	ExtrasFail
)

// ParseEmitter implements the parse families: one value per strategy in the family registry, the policy
// picking which pieces the body composes.
type ParseEmitter struct{ Extras ExtrasPolicy }

// Args — `(v)`. No status holder: the body throws.
func (ParseEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports — the JSON wire kind set restoreFromJsonMutate covers. A kind outside it has no wire form to
// restore FROM, so the renderer emits an alwaysThrow entry: a parse that quietly accepts everything is worse
// than one that refuses to compile.
func (ParseEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (ParseEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// ReturnName — the restored value.
func (ParseEmitter) ReturnName() string {
	return "v"
}

// EmitDependencyCall is unreachable: Emit never calls CompileChild, so no child node is reached. It exists
// for the interface, and panics rather than emit something that would look plausible.
func (ParseEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	panic("parse: EmitDependencyCall is unreachable — the parse body composes whole families, it does not walk children")
}

// Finalize — a parse body is never the family identity: even loose over a type with nothing to restore still
// runs the check, which is the whole point of parse.
func (ParseEmitter) Finalize(raw string) (string, bool) {
	return raw, false
}

// Emit renders the WHOLE body at the root and compiles no children. registerRTLookup both wires each `?.fn`
// lookup and demands that entry, so the pieces are emitted and cached like any other dependency.
func (e ParseEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt)
	if resolved == nil || resolved.ID == "" {
		return RTCode{Code: "", Type: CodeNS}
	}
	v := ctx.Vλl
	mismatch := "throw utl.parseMismatch(" + v + ")"
	code := ""

	// Blank the undeclared keys BEFORE restore, so the restore walk sees only declared shape.
	if e.Extras == ExtrasStrip {
		stripHash := operations.PlainHash("stripUnknownKeysWire") + "_" + resolved.ID
		ctx.registerRTLookup(stripHash)
		code += v + "=" + stripHash + "?.fn(" + v + ")??" + v + ";"
	}

	// Wrapped because the restore arms throw raw on malformed input; omitted when the restore is identity.
	if !isNoopForRestoreJson(resolved, ctx) {
		restoreHash := operations.PlainHash("restoreFromJsonMutate") + "_" + resolved.ID
		ctx.registerRTLookup(restoreHash)
		// The raw throw travels as the mismatch's `cause`: it already says what is wrong with the wire value, and
		// the rebuilt report loses it, since validating the half-restored value can come back clean for a union
		// (the wire form failed to decode, the undecoded value still satisfies a member). See RTParseError.
		code += "try{" + v + "=" + restoreHash + "?.fn(" + v + ")??" + v + "}catch(e){throw utl.parseMismatch(" + v + ",e)}"
	}

	// `fail` routes through the fused validate{checkUnknowns} entry, so rejecting undeclared keys costs one pass.
	checkOp := "validate"
	if e.Extras == ExtrasFail {
		checkOp = "validateStrict"
	}
	checkHash := operations.PlainHash(checkOp) + "_" + resolved.ID
	ctx.registerRTLookup(checkHash)
	code += "if(!(" + checkHash + "?.fn(" + v + ")??true)){" + mismatch + "}"

	return RTCode{Code: code, Type: CodeS}
}
