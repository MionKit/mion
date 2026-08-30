package typeid

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// LibDeclaredGlobalOf reports whether tsType is an interface or class declared
// ENTIRELY inside the bundled TypeScript standard library, returning its name.
//
// This is the closed-contract test, and it replaces the name lists it grew out
// of. The projection used to ask "is this one of the globals we know are NOT
// data", which is an attempt to enumerate an open set: every edition of the
// standard library adds more of them, so the list fell behind (the ESNext
// iterator objects, then `PromiseLike`) and each catch-up shipped as a build
// break for somebody. The question is now the finite one: a type is data when
// it is a shape the consumer wrote, or one of the natives we deliberately
// support (`Date`, `RegExp`, `Map`, `Set`, Temporal, binary). A standard-library
// interface is none of those, so it is not data — with no name anywhere.
//
// Callers must run this AFTER the supported natives are dispatched, or it would
// swallow them: they are lib-declared too.
//
// Two properties make it safe, and both already have precedent in this package:
//
//   - A type ALIAS can never be caught. `Partial<T>`, `Record<K, V>`,
//     `Readonly<T>`, `Pick` and `Omit` resolve to a mapped type whose symbol is
//     not interface- or class-flagged, so the consumer's own shape keeps being
//     walked. Same flag test projectObjectLiteral uses to stamp interface names.
//   - Declaration merging keeps the author's side. declaringLibFile returns ""
//     when ANY declaration sits outside the lib directory, so a consumer
//     augmenting a lib interface has written part of it and it stays data.
func LibDeclaredGlobalOf(tsType *checker.Type) (string, bool) {
	if tsType == nil {
		return "", false
	}
	symbol := symbolForLibLookup(tsType)
	if symbol == nil || symbol.Name == "" {
		return "", false
	}
	// Interfaces and classes only. An alias, a mapped type or an anonymous
	// object literal is the consumer's own shape even when the checker
	// materialised it from a lib alias.
	if symbol.Flags&(ast.SymbolFlagsInterface|ast.SymbolFlagsClass) == 0 {
		return "", false
	}
	if declaringLibFile(symbol) == "" {
		return "", false
	}
	return symbol.Name, true
}

// symbolForLibLookup resolves the declaration symbol behind a possibly
// instantiated type: a generic reference (`ArrayIterator<number>`) carries the
// instantiation, and only its target names the declaration.
func symbolForLibLookup(tsType *checker.Type) *ast.Symbol {
	if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if target := tsType.Target(); target != nil && target.Symbol() != nil {
			return target.Symbol()
		}
	}
	return tsType.Symbol()
}

// NotDataBuiltinOf is the single "this is not data, take it whole" predicate,
// and the one every projection site should ask. Three rules, in order:
//
//   - it is shaped like a view over bytes (IsBinaryViewShape) — every typed
//     array, `DataView`, Node's `Buffer`, and any subclass a consumer writes;
//   - it inherits from a raw buffer (BinaryRootBaseOf), the one binary case
//     with no member shape to test for;
//   - it is declared in the standard library (LibDeclaredGlobalOf).
//
// The last rule is the contract: data is the closed set the projection walks,
// and a standard-library type is not in it. Nothing is enumerated, so a new lib
// edition can add whatever it likes without a list falling behind.
//
// Callers must dispatch the supported natives (`Date`, `Map`, `Set`, `RegExp`,
// Promise, Temporal, arrays) BEFORE asking, since those are lib-declared too.
//
// The returned name becomes ClassRef.Builtin, which the emitter writes out as
// `classType = globalThis.<name>`, so it is always a name that exists at
// runtime, never the consumer's own subclass name.
func NotDataBuiltinOf(typeChecker *checker.Checker, tsType *checker.Type) (string, bool) {
	if IsBinaryViewShape(typeChecker, tsType) {
		return binaryViewClassRef(tsType), true
	}
	if name, ok := BinaryRootBaseOf(typeChecker, tsType); ok {
		return name, true
	}
	return LibDeclaredGlobalOf(tsType)
}

// IsBinaryViewShape reports whether tsType satisfies the lib's `ArrayBufferView`
// shape: it carries `buffer`, `byteLength` and `byteOffset`. That is every typed
// array, `DataView`, Node's `Buffer`, and any subclass a consumer writes.
//
// Shape, not name, and not heritage. Nothing in the standard library declares
// `extends ArrayBufferView` (the typed arrays simply have the same members), so
// a heritage walk could never reach it, and the name list that stood in for one
// was already missing `Float16Array`. Testing the members is what the TypeScript
// side does through assignability in `DataOnlyStripped`, so the two projections
// agree about binary by construction rather than by two lists being kept in sync.
func IsBinaryViewShape(typeChecker *checker.Checker, tsType *checker.Type) bool {
	if typeChecker == nil || tsType == nil {
		return false
	}
	// Only object types can carry members; asking anything else wastes a lookup
	// and, for a union, would answer for the wrong thing.
	if tsType.Flags()&checker.TypeFlagsObject == 0 {
		return false
	}
	for _, member := range reflection.BinaryViewMembers {
		if checker.Checker_getPropertyOfType(typeChecker, tsType, member) == nil {
			return false
		}
	}
	return true
}

// binaryViewClassRef names the runtime global for a binary view. The emitter
// writes the returned name out as `classType = globalThis.<name>`, so a type
// declared outside the lib (Node's `Buffer`, a user subclass) cannot use its own
// name — `globalThis.Buffer` is undefined off Node, and a user subclass is not a
// global at all. `Uint8Array` exists in every runtime and is the honest stand-in
// for "some view over bytes"; a lib-declared view keeps its own name.
func binaryViewClassRef(tsType *checker.Type) string {
	if name, ok := LibDeclaredGlobalOf(tsType); ok {
		return name
	}
	return "Uint8Array"
}
