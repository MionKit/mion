package typeid

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// NativeUrlName is the runtime global the native URL class is reached through (`globalThis.URL`).
const NativeUrlName = "URL"

// IsNativeUrl reports whether tsType is the platform `URL` class: lib.dom's global, @types/node's global
// (declared outside the bundled lib, so LibDeclaredGlobalOf never sees it) or the class `node:url` exports.
// Every declaration must sit in a declaration file, so a consumer's own `class URL` or a `declare global`
// augmentation written in a .ts file stays the author's shape and is walked.
func IsNativeUrl(tsType *checker.Type) bool {
	if tsType == nil {
		return false
	}
	symbol := symbolForLibLookup(tsType)
	if symbol == nil || symbol.Name != NativeUrlName || len(symbol.Declarations) == 0 {
		return false
	}
	if symbol.Flags&(ast.SymbolFlagsInterface|ast.SymbolFlagsClass) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil || !sourceFile.IsDeclarationFile {
			return false
		}
	}
	return true
}
