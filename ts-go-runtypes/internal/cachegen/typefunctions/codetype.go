// Package typefunctions precompiles the RunType function families (validate, validationErrors,
// prepareForJson, …) into static JS source at build time instead of assembling them at runtime via
// `new Function`. walker.go dispatches each node through the family's Emitter; a kind with no arm
// answers the CodeNS sentinel so the renderer can skip that entry's factory.
package typefunctions

// CodeType is the shape of a snippet's source text, which tells the parent frame whether it can
// interpolate it as-is, wrap it in a self-invoking function, terminate it, or skip the entry.
type CodeType string

const (
	// CodeE — a single JS expression, concatenable with `&&`, `||`, `+`.
	CodeE CodeType = "E"
	// CodeS — one or more JS statements, concatenable with `;`.
	CodeS CodeType = "S"
	// CodeRB — a block returning via an explicit `return …;`, wrapped in a self-invoking function to embed in an expression.
	CodeRB CodeType = "RB"
	// CodeNS — not JS: the kind reached here has no emit arm, and every parent must propagate it up to the root.
	// Distinct from an empty Code carrying CodeE / CodeS / CodeRB, which drops only that one slot in the parent.
	// An unsupported root renders an alwaysThrow factory, or is skipped silently when its leaf has no diag code.
	CodeNS CodeType = "NS"
)

// RTCode is one emitter's output; `Code == ""` is the reference's `undefined`, a noop the orchestrator drops.
// A CodeNS leaf carries no throw text: module.go's buildAlwaysThrowMessage builds it at the root from the leaf's diag code.
type RTCode struct {
	Code string
	Type CodeType
}
