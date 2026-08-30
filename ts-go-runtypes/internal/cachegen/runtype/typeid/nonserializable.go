package typeid

import (
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// BaseTypesOf returns a type's declared base types, guarding the two shapes
// where the bare GetBaseTypes call panics: it is only valid on a class or
// interface, and a generic instantiation (`class B extends A<string>`) has to
// be asked through its target.
func BaseTypesOf(typeChecker *checker.Checker, tsType *checker.Type) []*checker.Type {
	if typeChecker == nil || tsType == nil {
		return nil
	}
	objectFlags := tsType.ObjectFlags()
	if objectFlags&checker.ObjectFlagsClassOrInterface != 0 {
		return typeChecker.GetBaseTypes(tsType)
	}
	if objectFlags&checker.ObjectFlagsReference != 0 {
		if target := tsType.Target(); target != nil && target.ObjectFlags()&checker.ObjectFlagsClassOrInterface != 0 {
			return typeChecker.GetBaseTypes(target)
		}
	}
	return nil
}

// maxBaseChainDepth bounds the heritage walk. Real inheritance chains are a
// handful of links; the cap only exists so a malformed or error-recovered graph
// cannot spin here.
const maxBaseChainDepth = 16

// BinaryRootBaseOf reports whether tsType INHERITS from `ArrayBuffer` or
// `SharedArrayBuffer`, and returns the base's name.
//
// That returned name is not cosmetic: it becomes ClassRef.Builtin, which the
// emitter writes out as `classType = globalThis.<name>`. It has to be the
// BASE's name, because that is the one that exists at runtime — a user's
// `class MyBuf extends ArrayBuffer` would emit `globalThis.MyBuf`, which is
// undefined.
//
// This is the only heritage test left in the projection, and it covers one
// narrow case: a consumer subclassing a raw buffer. Everything else is decided
// without walking bases (see NotDataBuiltinOf) — the buffer VIEWS by their
// member shape, and every standard-library type by where it is declared. The
// two roots need a name because a buffer has no distinguishing members of its
// own: `ArrayBuffer` is `{byteLength, slice()}`, which any model could match by
// accident.
func BinaryRootBaseOf(typeChecker *checker.Checker, tsType *checker.Type) (string, bool) {
	if tsType == nil {
		return "", false
	}
	return binaryRootBase(typeChecker, tsType, 0, map[*checker.Type]struct{}{})
}

// binaryRootBase walks tsType's heritage looking for a raw buffer global.
// `seen` guards the interface graph, which (unlike single-inheritance classes)
// can reach the same type by more than one path.
func binaryRootBase(
	typeChecker *checker.Checker,
	tsType *checker.Type,
	depth int,
	seen map[*checker.Type]struct{},
) (string, bool) {
	if depth >= maxBaseChainDepth {
		return "", false
	}
	for _, baseType := range BaseTypesOf(typeChecker, tsType) {
		if baseType == nil {
			continue
		}
		if _, visited := seen[baseType]; visited {
			continue
		}
		seen[baseType] = struct{}{}
		if symbol := baseType.Symbol(); symbol != nil && reflection.IsBinaryRootSymbol(symbol.Name) {
			return symbol.Name, true
		}
		if name, ok := binaryRootBase(typeChecker, baseType, depth+1, seen); ok {
			return name, true
		}
	}
	return "", false
}
