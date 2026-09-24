package typefunctions

import "github.com/mionkit/mion/ts-go-runtypes/internal/reflection"

// The FUSED validator families behind `{checkUnknowns: true}`: one function, one walk, "valid AND no undeclared keys".
// Each strict emitter embeds its plain twin; the key check is spliced only into emitObjectValidate /
// emitObjectValidationErrors, gated on ctx.ChecksUnknownKeys(), so there is one switch, not two that can drift.
// Index signatures, Maps and Sets take no check. A union has no keys of its own: each member arm carries its own check,
// so `{kind:'cat', meows:true, barks:3}` fails on the `cat` arm (pinned in checkUnknowns.test.ts), and
// emitUnionValidationErrors must pick the STRICT validator or it reports nothing for a value its validator rejects.
// A FAMILY, not a ValidateOptions variant: a variant is root-scoped (a named nested type would dep-call the PLAIN entry),
// never disk-cached, and skips user overrides. The key check runs after the property checks, so the validator's leading
// guard is the only one (TestCheckUnknowns_ValidatorKeyCheckAddsNoGuard). Arrays take no key check, their elements do.
// An array reaching an OBJECT node (`[1, 2]` satisfies `{length: number}`) is undefined: the two families may disagree
// (key count vs key names, `length` is not enumerable), and guarding it would cost every object for a shape nobody writes.

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

// ValidationErrorsStrictEmitter is `validationErrors` plus one `{expected:'never'}` per undeclared key at its owning node,
// interleaved in walk order beside that object's type errors. Pinned by test.
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

// strictObjectKeyAssertion returns the expression asserting the object at ctx.Vλl carries NO undeclared keys; whether a
// check belongs here is emitsUnknownKeyCheck's call, and children splice their own.
// It must go LAST in the object's `&&` chain, after the property checks. Then every declared prop is known present, so
// the O(1) key count is sound at any depth (else `{a,b,x}` passes for `{a,b,c}`), and the leading object guard
// (or a union arm's) already ran.
func strictObjectKeyAssertion(rt *reflection.RunType, ctx *EmitContext) string {
	if n, ok := countFastPathN(rt, ctx); ok {
		return emitCountKeys(ctx, ctx.Vλl, n)
	}
	// Ineligible for the count compare (optional props or non-RT children): fall back to the key-array scan, negated into
	// the chain. Non-empty by now, since emitsUnknownKeyCheck already rejected the shapes whose scan returns "".
	return "!(" + callCheckUnknownPropertiesForHas(rt, ctx, false) + ")"
}
