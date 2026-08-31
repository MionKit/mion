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
// difference is spliced inside the shared emit arms (emitObjectValidate,
// emitObjectValidationErrors, and the index-signature / union / Map-Set arms),
// gated on ctx.ChecksUnknownKeys(). One switch to maintain, not two that can drift.
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

// strictObjectKeyAssertion returns the JS expression asserting the object at
// ctx.Vλl carries NO undeclared keys, or "" when this node needs no check.
// Empty for a non-strict family, for an index-signature-bearing shape (any key
// matching the index IS declared, so "unknown" is meaningless there), and for a
// shape with no declared names to compare against.
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
	if !ctx.ChecksUnknownKeys() {
		return ""
	}
	// An index signature makes every key matching it declared, so there is no
	// parent-level "unknown" to test. Mirrors emitInterfaceHasUnknownKeys, which
	// suppresses its own parent check on `hasIndex`. countFastPathN rejects these
	// too, but the scan fallback below does NOT know about index signatures, so
	// the gate has to sit here rather than inside either helper.
	if objectHasIndexSignatureChild(rt, ctx) {
		return ""
	}
	if n, ok := countFastPathN(rt, ctx); ok {
		return emitCountKeysMatch(ctx, ctx.Vλl, n)
	}
	// Ineligible for the count compare (optional props or non-RT children):
	// fall back to the key-array scan, negated into the chain.
	check := callCheckUnknownPropertiesForHas(rt, ctx, false, false)
	if check == "" {
		return ""
	}
	return "!(" + check + ")"
}
