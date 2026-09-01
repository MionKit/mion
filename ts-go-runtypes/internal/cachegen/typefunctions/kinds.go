package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Kind-classification predicates shared across the emitters. Relocated from
// istype.go (where they accreted as de-facto package utilities) so the shared
// classification logic is discoverable independent of the validate emitter.

// isObjectLikeKind reports whether kind's validate emit needs the
// shared `typeof === 'object' && !== null` guard before it. Used by
// the union emit to lift the guard out of the per-child checks.
func isObjectLikeKind(kind reflection.ReflectionKind) bool {
	switch kind {
	case reflection.KindObjectLiteral, reflection.KindClass,
		reflection.KindIndexSignature, reflection.KindArray,
		reflection.KindTuple:
		return true
	}
	return false
}

// isFunctionLikeKind reports whether kind would emit a function-shape
// check (or be skipped entirely as a property's wrapped child). Used
// in two places: object-emit to drop method-shaped Children directly,
// and property-emit to skip when the wrapped value is function-typed.
func isFunctionLikeKind(kind reflection.ReflectionKind) bool {
	switch kind {
	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return true
	}
	return false
}

// objectHasCallSignature reports whether an object-like RunType carries a
// KindCallSignature member — i.e. it is a CALLABLE interface
// (`interface F { (a): R; p: string }`). A call signature makes the whole
// interface function-like: DataOnly strips it to `never`, and validate guards it
// with `typeof === 'function'`. The serializers therefore treat it like a bare
// function (alwaysThrow at the root, dropped at a property position) by returning
// CodeNS for it, rather than walking it as a plain object and serializing its
// data props — which would disagree with validate. Mirrors the call-signature
// detection in emitObjectValidate / emitObjectValidationErrors.
func objectHasCallSignature(rt *reflection.RunType, ctx *EmitContext) bool {
	if rt == nil {
		return false
	}
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved != nil && resolved.Kind == reflection.KindCallSignature {
			return true
		}
	}
	return false
}

// callableLeafSubstitute maps an unsupported-leaf RunType to the RunType whose
// kind drives the per-family diag code. For a callable interface — an
// objectLiteral carrying a KindCallSignature child — it returns that call
// signature so DiagCodeForLeaf emits the family's FUNCTION code (and an
// alwaysThrow entry), exactly like a bare function. Every other leaf passes
// through unchanged.
//
// The serializer emitters return CodeNS for a callable interface (via
// objectHasCallSignature), so the walker latches the OBJECTLITERAL as the
// unsupported leaf. Without this substitution DiagCodeForLeaf's rootCodeMap has
// no objectLiteral arm and returns "", silently skipping the entry — which
// leaves a dangling same-family dependency (the entry cascades to a KindMissing
// stub). A JSON composite then binds that stub with an unguarded
// `utl.getRT(key).fn` (runtime `reading 'fn'`), and a binary site can't resolve
// its tuple ("no id injected"). See F2b in docs/todos.
//
// refTable resolves the objectLiteral's KindRef children; a nil table (or an
// unresolvable ref) falls back to the original leaf — the pre-fix silent-skip,
// preserving the unknown-future-kind safety net.
func callableLeafSubstitute(leaf *reflection.RunType, refTable map[string]*reflection.RunType) *reflection.RunType {
	if leaf == nil || leaf.Kind != reflection.KindObjectLiteral {
		return leaf
	}
	for _, child := range leaf.Children {
		resolved := child
		if child != nil && child.Kind == reflection.KindRef {
			if refTable == nil {
				continue
			}
			resolved = refTable[child.ID]
		}
		if resolved != nil && resolved.Kind == reflection.KindCallSignature {
			return resolved
		}
	}
	return leaf
}

// isRestTupleMember reports whether a resolved tuple-member RunType
// carries the "rest" flag the projection sets on rest elements
// (`[A, ...B[]]`). Mirrors TupleMember.isRest() on the wire.
func isRestTupleMember(rt *reflection.RunType) bool {
	if rt == nil || rt.Kind != reflection.KindTupleMember {
		return false
	}
	return hasFlag(rt.Flags, "rest")
}

// isSymbolKeyedIndexSig reports whether a KindIndexSignature has a
// symbol-typed key (`{[k: symbol]: T}`). Mirrors the
// IndexSignatureRunType.skipRT contract (indexProperty.ts:30-36), which
// returns true for every RT fn except toJSCode (we don't emit a
// toJSCode equivalent in this binary, so the skip applies
// unconditionally for us). The for-in loop in our emits would never
// enumerate a symbol-keyed property anyway (per JS semantics), so
// skipping is observable parity with the reference and elides dead emit.
func isSymbolKeyedIndexSig(rt *reflection.RunType, ctx *EmitContext) bool {
	if rt == nil || rt.Index == nil {
		return false
	}
	indexResolved := ctx.ResolveRef(rt.Index)
	return indexResolved != nil && indexResolved.Kind == reflection.KindSymbol
}

// hasFlag is a small membership helper for RunType.Flags.
func hasFlag(flags []string, target string) bool {
	for _, flag := range flags {
		if flag == target {
			return true
		}
	}
	return false
}
