package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TMP001, the Temporal flavor of the silent-`any` guard family, emitted by the written-syntax walk in
// unresolved_name_guard.go for a `Temporal.<KnownName>` reference that resolved any-flavored (a
// tsconfig `lib` without ESNext.Temporal). Unlike its MKR013 sibling the predicate accepts the true
// `any` intrinsic too, not only the error type: no builtin Temporal name may legitimately mean `any`,
// and a consumer stub (`type PlainDate = any`) destroys the temporal runtype just as a missing lib does.

// temporalDegradedToAny covers every any-flavored resolution: the `any` intrinsic, the checker's error type, an alias of `any`.
func temporalDegradedToAny(refType *checker.Type) bool {
	return refType != nil && checker.Type_flags(refType)&checker.TypeFlagsAny != 0
}

// temporalQualifiedName returns the `Temporal.<Name>` string when a TypeReference names a builtin Temporal type.
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
	if qualified.Left.Kind != ast.KindIdentifier || qualified.Left.Text() != reflection.TemporalNamespace {
		return "", false
	}
	typeName := qualified.Right.Text()
	if _, ok := reflection.TemporalInfoByName(typeName); !ok {
		return "", false
	}
	return reflection.TemporalNamespace + "." + typeName, true
}
