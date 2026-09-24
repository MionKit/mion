package typefunctions

import "github.com/mionkit/mion/ts-go-runtypes/internal/reflection"

// The FUSED validator families behind `{checkUnknowns: true}` on createValidateFn / createGetValidationErrorsFn.
//
// The fused families emit ONE function whose object-ish arms carry the property checks AND the unknown-key check, so a
// single walk answers "valid AND free of undeclared keys".
//
// Each strict emitter EMBEDS its plain twin and overrides nothing: the fused body is the plain body with one extra term
// at the object-ish nodes, so the difference is spliced inside the shared emitObjectValidate / emitObjectValidationErrors
// arms, gated on ctx.ChecksUnknownKeys(). One switch to maintain, not two that can drift.
//
// Those two arms are the ONLY splice points, and that is not an oversight:
//
//   - An index-signature shape declares every key matching the index, so "undeclared" has no meaning there.
//   - A Map or Set holds entries, not properties. Nothing to check.
//   - A UNION has no keys of its own; its members do, and each compiles through this same emitter, so every arm carries
//     its own check. That is what makes the fused validator answer per BRANCH.
//
// The one place a union needs a word is the error family, which delegates its verdict to a validator: emitUnionValidationErrors
// picks the STRICT validator under this family, or it would report nothing for a value its own validator rejects.
//
// # Unions answer per branch
//
// The fused validator inherits validate's OR chain, so each arm carries ITS OWN key check and nothing is pooled across
// members: `{kind:'cat', meows:true, barks:3}` is rejected because the matching `cat` arm does not declare `barks`.
// Pinned by test in checkUnknowns.test.ts.
//
// Why a FAMILY and not a ValidateOptions variant: a variant is root-scoped (a named nested type would dep-call the PLAIN
// entry and lose the check), is never disk-cached and skips user overrides. A family renders its whole transitive subtree
// with the same emitter, so strict mode needs no propagation plumbing: it rides the emitter identity.
//
// # The object guard is emitted ONCE, and the key check adds none of its own
//
// The key check is spliced after the property checks in the same expression, so validation has already run when it does.
// The guard the validator emits as its leading term is the only one, and the key check contributes no array term.
// Pinned by TestCheckUnknowns_ValidatorKeyCheckAddsNoGuard.
//
// # Arrays are out of scope, deliberately
//
// An ARRAY node emits no key check, only the traversal of its elements: a JSON array cannot carry undeclared object
// properties, its enumerable keys ARE its elements. Each element's own object arm still carries its own check.
// What is NOT a supported question is an array reaching an OBJECT node, which a pathological schema can arrange
// (`[1, 2]` structurally satisfies `{length: number}`). The key check runs on it, and the two fused families can then answer
// differently, because the validator compares key COUNTS while the error form names keys and `length` is not enumerable on
// an array. The validator adds no guard against it on purpose: the guard that would is the object guard, which validation
// already made unnecessary, and paying for it on every object in every codebase to define an answer for a shape nobody
// writes is the wrong trade. The behaviour there is undefined and documented as such.

// StrictUnknownKeys marks a family whose emitted body folds the unknown-key check into its own walk.
// The shared emit arms ask EmitContext.ChecksUnknownKeys whether to splice the check; the walker's Emitter IS the family,
// so the root and every child entry it renders get the same verdict.
// A marker method with an empty body, like NoopChildComposesAround: asserting it claims the body rejects undeclared keys.
type StrictUnknownKeys interface {
	ChecksUnknownKeys()
}

// ValidateStrictEmitter is `validate` plus the unknown-key check; everything else is inherited from ValidateEmitter.
type ValidateStrictEmitter struct{ ValidateEmitter }

func (ValidateStrictEmitter) ChecksUnknownKeys() {}

// ValidationErrorsStrictEmitter is `validationErrors` plus one `{expected:'never'}` entry per undeclared key, recorded at
// the node that owns the key.
// The errors interleave in walk order like every other error family, so an unknown-key error sits beside the type errors
// of the same object rather than after all of them. Pinned by test.
type ValidationErrorsStrictEmitter struct{ ValidationErrorsEmitter }

func (ValidationErrorsStrictEmitter) ChecksUnknownKeys() {}

// emitsUnknownKeyCheck is the ONE decision both fused families ask of an object node: does it carry a key check at all?
// The validator and its error twin must answer identically at every node, or a caller gets a rejection and an empty list
// of reasons, so the decision lives here rather than once per arm.
func emitsUnknownKeyCheck(rt *reflection.RunType, ctx *EmitContext, callSigChild *reflection.RunType) bool {
	// Only the fused families check keys at all.
	if !ctx.ChecksUnknownKeys() {
		return false
	}
	return nodeTakesUnknownKeyCheck(rt, ctx, callSigChild)
}

// nodeTakesUnknownKeyCheck is the family-independent half: given that SOME family wants a key check here, can this node
// carry one at all? Split out so the union-keys families can ask it about a member arm without claiming to be fused.
func nodeTakesUnknownKeyCheck(rt *reflection.RunType, ctx *EmitContext, callSigChild *reflection.RunType) bool {
	// A callable shape is a Function, not a plain object: its extra properties are the call signature's business.
	if callSigChild != nil {
		return false
	}
	// An index signature makes every key matching it declared, so there is no parent-level "unknown" to test.
	if objectHasIndexSignatureChild(rt, ctx) {
		return false
	}
	// Nothing declared to compare against would make every key "unknown" and reject every object.
	// collectObjectChildNames is the pure half of addObjectPropsToContext, so asking registers no key array for a node that emits nothing.
	rtNames, allNames := collectObjectChildNames(rt, ctx)
	return len(rtNames) > 0 || len(allNames) > 0
}

// strictObjectKeyAssertion returns the expression asserting the object at ctx.Vλl carries NO undeclared keys.
// It decides nothing about WHETHER a check belongs here, emitsUnknownKeyCheck owns that, and it answers only for THIS
// node: children compile through the same strict emitter and splice their own check.
//
// PLACEMENT the caller must honour: this expression goes LAST in the object's `&&` chain, after the per-property checks.
// Two things follow:
//
//   - The O(1) key-count compare is sound at EVERY depth. It is valid only once every declared prop is known present
//     (otherwise `{a,b,x}` against declared `{a,b,c}` slips through and a merely-missing prop false-positives), and here
//     the props were just verified in the same expression, so the precondition holds by construction.
//   - The object guard is redundant, hence keepObjectCheck=false: `typeof v === 'object' && v !== null` already ran as the
//     leading term of this chain (or, under a union, as the arm's shared guard).
func strictObjectKeyAssertion(rt *reflection.RunType, ctx *EmitContext) string {
	if n, ok := countFastPathN(rt, ctx); ok {
		return emitCountKeys(ctx, ctx.Vλl, n)
	}
	// Ineligible for the count compare (optional props or non-RT children): fall back to the key-array scan, negated into
	// the chain. Non-empty by now, since emitsUnknownKeyCheck already rejected the shapes whose scan returns "".
	return "!(" + callCheckUnknownPropertiesForHas(rt, ctx, false) + ")"
}
