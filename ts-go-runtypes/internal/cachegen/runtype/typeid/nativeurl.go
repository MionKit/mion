package typeid

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// NativeUrlName is the runtime global the native URL class is reached through (`globalThis.URL`).
const NativeUrlName = "URL"

// IsNativeUrl reports whether tsType is the platform `URL`: lib.dom's, @types/node's global or `node:url`'s class.
// A `.d.ts` declares it; a consumer's `.ts` merge that adds nothing leaves it the platform's, one that adds a member makes
// it theirs, the same rule declaredByPlatform applies to every other platform class.
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
	return declaredBy(nil, tsType, symbol, func(declaration *ast.Node) bool {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		return sourceFile != nil && sourceFile.IsDeclarationFile
	})
}
