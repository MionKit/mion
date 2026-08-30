package typeid

import (
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// maxBaseChainDepth bounds the heritage walk. Real inheritance chains are a
// handful of links (`Buffer` → `Uint8Array` is one); the cap only exists so a
// malformed or error-recovered graph cannot spin here.
const maxBaseChainDepth = 16

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

// NonSerializableBuiltinOf reports whether tsType is one of the non-serialisable
// globals, and returns the name of the GLOBAL it matched.
//
// That returned name is not cosmetic: it becomes ClassRef.Builtin, which the
// emitter writes out as `classType = globalThis.<name>`. For an exact match it
// is the type's own name; for a base match it is the BASE's, because that is
// the one that exists at runtime — a user's `class MyBytes extends Uint8Array`
// would emit `globalThis.MyBytes`, which is undefined.
//
// Exact-set names match only themselves (see NonSerializableExactGlobals for
// why `class RpcError extends Error` must stay a normal class). Base-set names
// also match anything that inherits from them, which is what makes `Buffer` and
// the lib's iterator objects resolve without naming either.
func NonSerializableBuiltinOf(typeChecker *checker.Checker, tsType *checker.Type) (string, bool) {
	if tsType == nil {
		return "", false
	}
	if symbol := tsType.Symbol(); symbol != nil && reflection.IsNonSerializableSymbol(symbol.Name) {
		return symbol.Name, true
	}
	if name, ok := nonSerializableBase(typeChecker, tsType, 0, map[*checker.Type]struct{}{}); ok {
		return name, true
	}
	return "", false
}

// nonSerializableBase walks tsType's heritage looking for a base-set global.
// `seen` guards the interface graph, which (unlike single-inheritance classes)
// can reach the same type by more than one path.
func nonSerializableBase(
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
		if symbol := baseType.Symbol(); symbol != nil && reflection.IsNonSerializableBaseSymbol(symbol.Name) {
			return symbol.Name, true
		}
		if name, ok := nonSerializableBase(typeChecker, baseType, depth+1, seen); ok {
			return name, true
		}
	}
	return "", false
}
