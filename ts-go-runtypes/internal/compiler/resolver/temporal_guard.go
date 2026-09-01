package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TMP001 — the Temporal flavor of the silent-`any` guard family. Emitted by the
// shared written-syntax walk in unresolved_name_guard.go for a
// `Temporal.<KnownName>` reference whose resolution degraded to `any`: the
// signature of a consumer whose tsconfig `lib` doesn't load the Temporal
// namespace (e.g. `lib: ["ES2023"]` with no ESNext.Temporal). Left unguarded,
// such a reference silently degrades to `any` and the generated validator
// accepts ANY value with no signal.
//
// Unlike its MKR013 sibling, the predicate accepts EVERY any-flavored
// resolution — the true `any` intrinsic included, not only the checker's error
// type — because no builtin `Temporal.<Name>` may legitimately mean `any`: with
// the lib missing the reference resolves to the error type, and a consumer-side
// stub (`declare namespace Temporal { type PlainDate = any }`) resolves to the
// real `any` intrinsic yet equally destroys the temporal runtype the call
// promises. When the lib IS loaded, `Temporal.PlainDate` resolves to a real
// (non-any) type, so this fires nothing — zero cost for correct setups.

// temporalDegradedToAny reports whether a known-Temporal reference's resolved
// type is any-flavored (the `any` intrinsic, the checker's error type, or an
// alias of `any`).
func temporalDegradedToAny(refType *checker.Type) bool {
	return refType != nil && checker.Type_flags(refType)&checker.TypeFlagsAny != 0
}

// temporalQualifiedName reports whether a TypeReference node names a builtin
// Temporal type (`Temporal.<Name>` where <Name> is in the registry), and
// returns the qualified string for the diagnostic message. Bare names and
// non-Temporal qualified names return ok=false.
func temporalQualifiedName(typeRefNode *ast.Node) (string, bool) {
	typeRef := typeRefNode.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeName == nil {
		return "", false
	}
	entity := typeRef.TypeName
	if !ast.IsQualifiedName(entity) {
		return "", false
	}
	qualified := entity.AsQualifiedName()
	if qualified == nil || qualified.Left == nil || qualified.Right == nil {
		return "", false
	}
	// Left must be the bare identifier `Temporal`; Right the type name.
	if qualified.Left.Kind != ast.KindIdentifier || qualified.Left.Text() != reflection.TemporalNamespace {
		return "", false
	}
	typeName := qualified.Right.Text()
	if _, ok := reflection.TemporalInfoByName(typeName); !ok {
		return "", false
	}
	return reflection.TemporalNamespace + "." + typeName, true
}
