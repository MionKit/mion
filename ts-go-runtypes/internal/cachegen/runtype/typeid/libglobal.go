// A platform class is not data, decided by where it is declared, never by its name. The platform is the bundled lib
// plus what the tsconfig `types` list or any `/// <reference types>` loads (program.EnvironmentFile); importing a
// library never makes it platform. Limits: an ambient `declare module` class in a loaded package counts
// (`EventEmitter`), `types: ["*"]` loads every `@types` package, and with no `types` list only the lib and what a
// reference loads count. Pinned by platform_declared_test.go and program/environment_test.go; keep
// ts-go-runtypes/CLAUDE.md and the runtypes validation page in step.
package typeid

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// platformDeclaredGlobalOf finds a lib or environment class; run it AFTER the supported natives.
func platformDeclaredGlobalOf(typeChecker *checker.Checker, environment Environment, tsType *checker.Type) (string, bool) {
	if tsType == nil {
		return "", false
	}
	symbol := symbolForLibLookup(tsType)
	if symbol == nil || symbol.Name == "" {
		return "", false
	}
	// Interfaces and classes only: an alias or mapped type is the consumer's shape, even one built from a lib alias.
	if symbol.Flags&(ast.SymbolFlagsInterface|ast.SymbolFlagsClass) == 0 {
		return "", false
	}
	if !declaredByPlatform(typeChecker, environment, tsType, symbol) {
		return "", false
	}
	return symbol.Name, true
}

// declaredByPlatform: a platform declaration exists and no other one adds a member or a heritage clause.
func declaredByPlatform(typeChecker *checker.Checker, environment Environment, tsType *checker.Type, symbol *ast.Symbol) bool {
	return declaredBy(typeChecker, tsType, symbol, func(declaration *ast.Node) bool {
		return isPlatformDeclaration(declaration, environment)
	})
}

// declaredBy is declaredByPlatform with a caller-chosen platform test (IsNativeUrl passes `.d.ts` files).
func declaredBy(typeChecker *checker.Checker, tsType *checker.Type, symbol *ast.Symbol, isPlatform func(*ast.Node) bool) bool {
	hasPlatform, hasAuthored := false, false
	for _, declaration := range symbol.Declarations {
		if isPlatform(declaration) {
			hasPlatform = true
		} else {
			hasAuthored = true
		}
	}
	if !hasPlatform || !hasAuthored {
		return hasPlatform
	}
	platformMembers := platformMemberNames(typeChecker, tsType, symbol, isPlatform)
	for _, declaration := range symbol.Declarations {
		if !isPlatform(declaration) && addsMembers(declaration, platformMembers) {
			return false
		}
	}
	return true
}

// isPlatformDeclaration: lib or environment globals only; a module export of a loaded package stays data.
func isPlatformDeclaration(declaration *ast.Node, environment Environment) bool {
	if declaration == nil {
		return false
	}
	sourceFile := ast.GetSourceFileOfNode(declaration)
	if sourceFile == nil {
		return false
	}
	fileName := sourceFile.FileName()
	if isDefaultLibFileName(fileName) && strings.HasPrefix(tspath.NormalizePath(fileName), bundledLibPrefix) {
		return true
	}
	if environment == nil || !sourceFile.IsDeclarationFile || !environment(sourceFile) {
		return false
	}
	return !ast.IsExternalModule(sourceFile) || insideGlobalAugmentation(declaration)
}

func insideGlobalAugmentation(declaration *ast.Node) bool {
	for node := declaration.Parent; node != nil; node = node.Parent {
		if ast.IsGlobalScopeAugmentation(node) {
			return true
		}
	}
	return false
}

// platformMemberNames is every member name the platform declarations give the type, own and inherited.
// Authored heritage is refused by addsMembers first, so the base types here are the platform's.
func platformMemberNames(typeChecker *checker.Checker, tsType *checker.Type, symbol *ast.Symbol, isPlatform func(*ast.Node) bool) map[string]bool {
	names := map[string]bool{}
	for _, declaration := range symbol.Declarations {
		if !isPlatform(declaration) {
			continue
		}
		for _, member := range shapeMembers(declaration) {
			if memberSymbol := member.Symbol(); memberSymbol != nil {
				names[memberSymbol.Name] = true
			}
		}
	}
	for _, baseType := range BaseTypesOf(typeChecker, tsType) {
		for _, property := range typeChecker.GetPropertiesOfType(baseType) {
			names[property.Name] = true
		}
	}
	return names
}

// shapeMembers are the member nodes of an interface or class declaration; a `var`, function or namespace has none.
func shapeMembers(declaration *ast.Node) []*ast.Node {
	if declaration.Kind == ast.KindInterfaceDeclaration || declaration.Kind == ast.KindClassDeclaration {
		return declaration.Members()
	}
	return nil
}

// addsMembers matches by name, so an extra overload is a restatement, not an added member.
func addsMembers(declaration *ast.Node, platformMembers map[string]bool) bool {
	switch declaration.Kind {
	case ast.KindInterfaceDeclaration:
		if declaration.AsInterfaceDeclaration().HeritageClauses != nil {
			return true
		}
	case ast.KindClassDeclaration:
		if declaration.AsClassDeclaration().HeritageClauses != nil {
			return true
		}
	default:
		return false
	}
	for _, member := range shapeMembers(declaration) {
		memberSymbol := member.Symbol()
		if memberSymbol == nil || !platformMembers[memberSymbol.Name] {
			return true
		}
	}
	return false
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

// NotDataBuiltinOf is the one "not data, take it whole" test: binary view, raw-buffer subclass or platform class.
// Run it AFTER the supported natives (`Date`, `URL`, `Map`, `Set`, arrays...), which are lib-declared too.
// The name becomes `globalThis.<name>`, which nothing reads for not-data, so it may be undefined (`EventEmitter`).
func NotDataBuiltinOf(typeChecker *checker.Checker, environment Environment, tsType *checker.Type) (string, bool) {
	if IsBinaryViewShape(typeChecker, tsType) {
		return binaryViewClassRef(typeChecker, tsType), true
	}
	if name, ok := BinaryRootBaseOf(typeChecker, tsType); ok {
		return name, true
	}
	return platformDeclaredGlobalOf(typeChecker, environment, tsType)
}

// IsBinaryViewShape reports whether tsType satisfies the lib's `ArrayBufferView` shape: it carries
// `buffer`, `byteLength` and `byteOffset` — every typed array, `DataView`, Node's `Buffer`, and any
// subclass a consumer writes. Shape, not name, and not heritage: nothing in the standard library declares
// `extends ArrayBufferView`, so a heritage walk could never reach it, and the name list that stood in for
// one was already missing `Float16Array`. The TypeScript side tests the members too (assignability in
// `DataOnlyStripped`), so the two projections agree about binary by construction, not by two lists.
func IsBinaryViewShape(typeChecker *checker.Checker, tsType *checker.Type) bool {
	if typeChecker == nil || tsType == nil {
		return false
	}
	// Only object types can carry members; asking anything else wastes a lookup and, for a union, would answer
	// for the wrong thing.
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

// binaryViewClassRef is the view's `globalThis.<name>`; `Uint8Array` stands in for a non-lib one.
func binaryViewClassRef(typeChecker *checker.Checker, tsType *checker.Type) string {
	// Lib only: a name a runtime types package declares (`Buffer`) is no global in every runtime.
	if name, ok := platformDeclaredGlobalOf(typeChecker, nil, tsType); ok {
		return name
	}
	return "Uint8Array"
}
