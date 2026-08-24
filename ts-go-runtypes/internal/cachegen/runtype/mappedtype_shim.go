package runtype

import (
	"unsafe"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// mappedTypeLayout mirrors checker.MappedType's field layout (typescript-go
// internal/checker/types.go, `type MappedType struct`) so the accessors below
// can read the unexported `declaration` / `modifiersType` fields — the exact
// technique tsgolint's generated shim uses for its extra_* field accessors
// (shim/checker/shim.go, `extra_MappedType`). Stand-in until the tsgolint
// submodule pin advances to a shim generation that exports
// MappedType_declaration / MappedType_modifiersType; when it does, these two
// can be replaced by the shim calls (same signatures). Layout drift across
// typescript-go bumps is guarded by TestMappedTypeLayoutMatchesChecker.
type mappedTypeLayout struct {
	checker.ObjectType
	declaration          *ast.MappedTypeNode
	typeParameter        *checker.Type
	constraintType       *checker.Type
	nameType             *checker.Type
	templateType         *checker.Type
	modifiersType        *checker.Type
	resolvedApparentType *checker.Type
	containsError        bool
}

/** mappedTypeDeclaration reads MappedType.declaration — the AST mapped-type node the checker built the type from. **/
func mappedTypeDeclaration(mapped *checker.MappedType) *ast.MappedTypeNode {
	if mapped == nil {
		return nil
	}
	return ((*mappedTypeLayout)(unsafe.Pointer(mapped))).declaration
}

/** mappedTypeModifiersType reads MappedType.modifiersType — the T a homomorphic mapped type was instantiated over. **/
func mappedTypeModifiersType(mapped *checker.MappedType) *checker.Type {
	if mapped == nil {
		return nil
	}
	return ((*mappedTypeLayout)(unsafe.Pointer(mapped))).modifiersType
}
