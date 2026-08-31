package typefunctions

import (
	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// createParseFn — take a JSON.parse output, give back the typed value, or throw.
//
// # The emitted shape: a composition, not a walk
//
// A parse body walks NOTHING itself. It calls the families that already exist,
// in order, and each of those is a compiled, cached, separately tuned function:
//
//	function prs(v){
//	  v = <ukuw>?.fn(v) ?? v;                              // strip only
//	  try{ v = <rj>?.fn(v) ?? v }catch(e){ throw utl.parseMismatch(v,e) }
//	  if(!(<val|vst>?.fn(v) ?? true)) throw utl.parseMismatch(v);
//	  return v
//	}
//
// An earlier version emitted its own per-node walk that restored and checked at
// each node, on the theory that one walk beats two. Measured against the
// composition it replaces, on a realworld order DTO, that walk ran at 0.46x of
// a plain `validate` while doing the same work — the statement form with its
// per-node status writes is simply worse code than the `&&` expression validate
// compiles to. Reusing the real functions is both faster and far less to own:
// every improvement to validate or restoreFromJson now reaches parse for free,
// and parse can no longer drift behind the families it duplicates.
//
// # Which pieces, per strategy
//
//	loose (default)  rj + val          nothing rebuilt, undeclared keys kept
//	strip            ukuw + rj + val   ukuw blanks undeclared keys before restore
//	fail             rj + vst          vst is validate{checkUnknowns}, one fused walk
//
// `fail` is where the fused validator earns its keep: it is the same check as
// `validate(v) && !hasUnknownKeys(v)` in a single pass, measured at 1.73x the
// two-call form, so the strict strategy costs one call like the others.
//
// # Why the rj call is wrapped
//
// restoreFromJson assumes its caller already validated, so on malformed input it
// throws RAW: `BigInt('nope')` is a SyntaxError, the RegExp arm indexes
// `.match()` output with no null check, and a non-object where an object belongs
// is a TypeError. Parse is the one family whose whole job is untrusted input, so
// the call is wrapped and any throw becomes the same mismatch signal. That is
// what makes parse total: no input, however malformed, escapes as anything but
// RTParseError.
//
// The wrap is also why the rj call is omitted entirely when the restore is
// provably identity (isNoopForRestoreJson) — no call, no try, nothing.
//
// # Signalling failure
//
// The body THROWS rather than reporting through a status holder. There is
// nowhere else to put the verdict: the return value is the restored data. The
// sentinel carries that restored value so `createParseFn` can build the report
// from it, which is what makes RTParseError.issues identical to
// `getValidationErrors(restore(v))`. Building the report is the caller's cold
// path, so a matching value never pays for it.

// ExtrasPolicy names what a parse family does with properties the type does not
// declare.
type ExtrasPolicy int

const (
	// ExtrasPreserve keeps them, and is the DEFAULT. It is the cheapest shape
	// (no pre-pass, no key check) and it matches zod's default, which strips
	// only under `.strict()`.
	ExtrasPreserve ExtrasPolicy = iota
	// ExtrasStrip blanks them with the ukuw pre-pass before restore walks the
	// declared shape — the same two-step the `strip` JSON decoder uses.
	ExtrasStrip
	// ExtrasFail rejects a value carrying them, by checking through the fused
	// validate{checkUnknowns} entry instead of plain validate.
	ExtrasFail
)

// ParseEmitter implements the parse families. One value per strategy is bound in
// the family registry; the policy picks which pieces the body composes.
type ParseEmitter struct{ Extras ExtrasPolicy }

// Args — `(v)`. No status holder: the body throws.
func (ParseEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports — the JSON wire kind set, the same one restoreFromJson covers. A kind
// outside it has no wire form to restore FROM, so parse cannot serve it either;
// the renderer emits an alwaysThrow entry rather than silently degrading to
// identity, because a parse that quietly accepts everything is worse than one
// that refuses to compile.
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

// EmitDependencyCall is unreachable: Emit never calls CompileChild, so the
// walker never reaches a child node under this emitter. Kept to satisfy the
// interface, and deliberately loud rather than silently emitting something that
// would look plausible.
func (ParseEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	panic("parse: EmitDependencyCall is unreachable — the parse body composes whole families, it does not walk children")
}

// Finalize — the body always ends in `return v`, and is never the family
// identity: even the loose strategy over a type with nothing to restore still
// runs the check, which is the whole point of parse.
func (ParseEmitter) Finalize(raw string) (string, bool) {
	return raw, false
}

// Emit renders the WHOLE body at the root and compiles no children. Each `?.fn`
// call reaches a separately compiled entry, and registerRTLookup both wires the
// lookup and demands that entry, so the pieces are emitted and cached like any
// other dependency.
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

	// strip: blank the undeclared keys BEFORE restore, so the restore walk sees
	// only declared shape. Same order the `strip` JSON decoder uses.
	if e.Extras == ExtrasStrip {
		stripHash := operations.PlainHash("unknownKeysToUndefinedWire") + "_" + resolved.ID
		ctx.registerRTLookup(stripHash)
		code += v + "=" + stripHash + "?.fn(" + v + ")??" + v + ";"
	}

	// The restore, wrapped because its arms throw raw on malformed input. Omitted
	// outright when the restore is provably identity over the whole subtree.
	if !isNoopForRestoreJson(resolved, ctx) {
		restoreHash := operations.PlainHash("restoreFromJson") + "_" + resolved.ID
		ctx.registerRTLookup(restoreHash)
		// The raw throw rides along as the mismatch's `cause`. A restore arm that
		// throws has ALREADY told us what is wrong with the wire value, and that
		// detail is otherwise lost: the report is rebuilt by validating the
		// half-restored value, which for a union can come back clean (the wire
		// form failed to decode, but the undecoded value still satisfies a
		// member). See RTParseError.
		code += "try{" + v + "=" + restoreHash + "?.fn(" + v + ")??" + v + "}catch(e){throw utl.parseMismatch(" + v + ",e)}"
	}

	// The check. `fail` routes through the fused validate{checkUnknowns} entry so
	// the undeclared-key rejection costs one pass, not two.
	checkOp := "validate"
	if e.Extras == ExtrasFail {
		checkOp = "validateStrict"
	}
	checkHash := operations.PlainHash(checkOp) + "_" + resolved.ID
	ctx.registerRTLookup(checkHash)
	code += "if(!(" + checkHash + "?.fn(" + v + ")??true)){" + mismatch + "}"

	return RTCode{Code: code, Type: CodeS}
}
