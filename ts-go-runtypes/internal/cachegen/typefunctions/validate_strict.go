package typefunctions

import "github.com/mionkit/ts-runtypes/internal/reflection"

// The FUSED validator families behind `{checkUnknowns: true}` on
// createValidateFn / createGetValidationErrorsFn.
//
// Strict validation used to cost two compiled functions run back to back:
//
//	isUser(v) && !hasUnknownKeys(v)
//
// which walks the value twice and visits every nested object twice. The fused
// families emit ONE function whose object-ish arms carry the property checks AND
// the unknown-key check, so a single walk answers "valid AND free of undeclared
// keys".
//
// Why an embed and not a new per-kind switch: the fused body IS the plain body
// with one extra term at the object-ish nodes. Every other kind is byte-identical.
// So each strict emitter embeds its plain twin and overrides nothing — the
// difference is spliced inside the shared OBJECT emit arms — emitObjectValidate
// and emitObjectValidationErrors — gated on ctx.ChecksUnknownKeys(). One switch
// to maintain, not two that can drift.
//
// Those two arms are the ONLY splice points, and that is not an oversight:
//
//   - An index-signature shape declares every key matching the index, so
//     "undeclared" has no meaning there. strictObjectKeyAssertion returns "".
//   - A Map or Set holds entries, not properties. Nothing to check.
//   - A UNION needs no splice because it has no keys of its own. Its members do,
//     and each member compiles through this same emitter, so each arm carries
//     its own check. That is what makes the fused validator answer per BRANCH
//     (see the union section below).
//
// The one place a union does need a word is the error family, which delegates
// its verdict to a validator: emitUnionValidationErrors picks the STRICT
// validator under this family, or it would report nothing for a value its own
// validator rejects.
//
// # Unions answer per branch, and that is a deliberate divergence
//
// `hasUnknownKeys` never validates, so it cannot know which member a value
// matched; it pools every member's property names into one merged allowlist and
// runs a single flat loop. The fused validator inherits validate's OR chain, so
// each arm carries ITS OWN key check and nothing is pooled.
//
// The two therefore DISAGREE on a value carrying another member's key:
// `{kind:'cat', meows:true, barks:3}` is admitted by the merged allowlist and
// rejected by the fused validator, which follows the branch that matched. The
// fused answer is the one that tracks `isType`, so it is the one that ships; a
// key belonging to NO member is rejected by both, which is the part that must
// never drift. Pinned by test in checkUnknowns.test.ts.
//
// Why a FAMILY and not a ValidateOptions variant: a variant is root-scoped (the
// renderer keeps the plain family's InnerPrefix, so a named nested type would
// dep-call the PLAIN entry and lose the check entirely), is never disk-cached,
// and skips user overrides. A family renders its own transitive subtree — every
// child entry is rendered with the same emitter, which is exactly why the strict
// mode needs no propagation plumbing: it rides the emitter identity.
//
// The uniform per-node meaning is what makes fusion work at all. hasUnknownKeys
// composes its nodes with `||` ("something below has an extra key") while
// validate composes with `&&`. Fusing on the CONJUNCTION — "valid and clean" —
// inverts the `||` into the `&&` chain, so a child still returns one boolean and
// the parent still has one thing to compose.
//
// # An array is never key-checked
//
// The one shape guard the fused families keep, and the reason is policy rather
// than safety: a JSON array cannot carry undeclared object properties, so
// neither family asks. The standalone unknown-keys families already answer that
// way. It looks like dead weight once validate has run, and it is not: an array
// really can pass an object shape's property checks (`[1, 2]` is a
// `{length: number}`), so without it the key check runs on one. See
// arraySkipsKeyCheck for the full reasoning, including why the count fast path
// makes skipping the only answer the two families can both give.

// StrictUnknownKeys marks a family whose emitted body folds the unknown-key
// check into its own walk. The shared emit arms assert it through
// EmitContext.ChecksUnknownKeys to decide whether to splice the check; the
// walker's Emitter IS the family, so the verdict is automatically the same for
// the root and every child entry the family renders.
//
// Marker method (empty implementations), same shape as NoopChildComposesAround:
// asserting it is the family's claim that its body rejects undeclared keys.
type StrictUnknownKeys interface {
	ChecksUnknownKeys()
}

// ValidateStrictEmitter is `validate` + the unknown-key check. Everything —
// args, per-kind dispatch, noop predicate, circular guard, diagnostics — is
// inherited from ValidateEmitter; only the marker below is new.
type ValidateStrictEmitter struct{ ValidateEmitter }

func (ValidateStrictEmitter) ChecksUnknownKeys() {}

// ValidationErrorsStrictEmitter is `validationErrors` + one `{expected:'never'}`
// entry per undeclared key, recorded at the node that owns the key.
//
// Error ORDER differs from the two-call form on purpose. Calling
// `verr(v).concat(uke(v))` groups every type error ahead of every unknown-key
// error; a single walk cannot produce that grouping, so the fused errors
// interleave in walk order — which is what every other error family already
// does. Pinned by test.
type ValidationErrorsStrictEmitter struct{ ValidationErrorsEmitter }

func (ValidationErrorsStrictEmitter) ChecksUnknownKeys() {}

// emitsUnknownKeyCheck is the ONE decision both fused families ask of an object
// node: does it carry an unknown-key check at all?
//
// It exists because the two used to spell that decision out separately — the
// validator inside strictObjectKeyAssertion, the error form inline at its own
// call site — and merely happened to agree. Happening to agree is the problem:
// the validator and its error twin must answer identically at every node, or a
// caller gets a rejection and an empty list of reasons. This family has already
// paid for that twice (the union arm, and the array gate), so the decision lives
// in one place and both arms read it.
func emitsUnknownKeyCheck(rt *reflection.RunType, ctx *EmitContext, callSigChild *reflection.RunType) bool {
	// Only the fused families check keys at all.
	if !ctx.ChecksUnknownKeys() {
		return false
	}
	// A callable shape is a Function, not a plain object: its own extra
	// properties are the call signature's business.
	if callSigChild != nil {
		return false
	}
	// An index signature makes every key matching it declared, so there is no
	// parent-level "unknown" to test. Mirrors emitInterfaceHasUnknownKeys, which
	// suppresses its own parent check on `hasIndex`.
	return !objectHasIndexSignatureChild(rt, ctx)
}

// strictObjectKeyAssertion returns the JS expression asserting the object at
// ctx.Vλl carries NO undeclared keys, or "" for a shape with no declared names
// to compare against. Callers gate on emitsUnknownKeyCheck first.
//
// It answers only for THIS node. Nested objects need no handling here: children
// compile through the same strict emitter, so each one splices its own check
// into its own body. That is the whole reason the fused validators are families
// rather than variants — see the file header.
//
// PLACEMENT is the interesting part, and the caller must honour it: this
// expression goes LAST in the object's `&&` chain, after the per-property
// checks. Two things follow from that, and both are why fusing beats calling
// hasUnknownKeys separately:
//
//   - The O(1) key-count compare becomes sound at EVERY depth. It is only valid
//     once every declared prop is known present (otherwise `{a,b,x}` vs declared
//     `{a,b,c}` slips through and a merely-missing prop false-positives), which
//     standalone callers have to promise via the `runsAfterValidation` compile
//     option and can only honour at the root. Here the props were just verified
//     in the same expression, so the precondition holds by construction.
//   - The object guard is redundant, hence keepObjectCheck=false on the scan
//     path. `typeof v === 'object' && v !== null` already ran as the leading
//     term of this same chain (or, under a union, as the arm's shared guard).
func strictObjectKeyAssertion(rt *reflection.RunType, ctx *EmitContext) string {
	if n, ok := countFastPathN(rt, ctx); ok {
		return arraySkipsKeyCheck(ctx.Vλl, emitCountKeys(ctx, ctx.Vλl, n, true), CodeE)
	}
	// Ineligible for the count compare (optional props or non-RT children):
	// fall back to the key-array scan, negated into the chain.
	check := callCheckUnknownPropertiesForHas(rt, ctx, false, false)
	if check == "" {
		return ""
	}
	return arraySkipsKeyCheck(ctx.Vλl, "!("+check+")", CodeE)
}
