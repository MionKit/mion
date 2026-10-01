package typeid

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// NativeUrlName is the runtime global the native URL class is reached through (`globalThis.URL`).
const NativeUrlName = "URL"

// IsNativeUrl reports whether tsType is the platform `URL`: lib.dom's, @types/node's global or `node:url`'s class.
// @types/node's sits outside the bundled lib, so LibDeclaredGlobalOf never sees it.
// Every declaration must be in a .d.ts, so a consumer's own `class URL` or .ts `declare global` stays theirs.
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
