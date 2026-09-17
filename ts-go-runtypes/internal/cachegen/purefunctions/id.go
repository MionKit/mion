package purefunctions

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// A pure function's id is where it lives:
//
//	<package name>/<path from the package root, extension dropped>#<name>
//	@mionjs/run-types/src/runtypes/pure-fns-utils#newRunTypeErr
//	@acme/text/src/slug#slugify
//
// `<name>` is the identifier a variable declaration binds the registration to.
// A registration bound to no name (a callback handed straight to a wrapper) is
// identified by its body instead, through CodeHash, so two structurally equal
// bodies still collapse to one entry. A file under no NAMED package keeps the
// path half alone, which is what an in-memory overlay or a scratch project gets.
//
// The id is the registry key everywhere: the string the transform injects into
// the registrar call, the key the emitted module registers under, and the
// literal a dependent body carries after lowering.

// idSeparator splits the location half of an id from its name half. A path can
// hold neither `#` nor a `#`-bearing segment, so the LAST one always splits.
const idSeparator = "#"

// sourceExtensions are dropped from the path half, longest first so `.d.ts`
// wins over `.ts`. Dropping them is what lets one source file and the `.d.ts`
// or `.js` emitted from it agree on one id.
var sourceExtensions = []string{".d.ts", ".d.mts", ".d.cts", ".tsx", ".ts", ".mts", ".cts", ".jsx", ".js", ".mjs", ".cjs"}

// IDFor builds the id of a registration written in filePath and bound to name.
// Pass the CodeHash of the body as name for a registration bound to nothing.
func IDFor(markerOpts marker.Options, filePath, name string) string {
	packageName, packageRoot := marker.PackageOfFile(filePath, marker.WithDefaults(markerOpts).FS)
	path := pathFromRoot(tspath.NormalizePath(filePath), packageRoot)
	if packageName == "" {
		return path + idSeparator + name
	}
	return packageName + "/" + path + idSeparator + name
}

// SplitID returns an id's location and name halves. ok is false for a string
// with no separator, which is never an id this package produced.
func SplitID(id string) (location, name string, ok bool) {
	sep := strings.LastIndex(id, idSeparator)
	if sep < 0 {
		return "", "", false
	}
	return id[:sep], id[sep+len(idSeparator):], true
}

// pathFromRoot renders the path half: the file relative to its package root
// with the extension dropped. A file under no package.json at all falls back to
// its own path minus the leading slash, which stays deterministic per project.
func pathFromRoot(path, packageRoot string) string {
	rel := path
	if packageRoot != "" {
		if trimmed := strings.TrimPrefix(rel, packageRoot); trimmed != rel {
			rel = trimmed
		}
	}
	rel = strings.TrimPrefix(rel, "/")
	for _, ext := range sourceExtensions {
		if strings.HasSuffix(rel, ext) {
			return rel[:len(rel)-len(ext)]
		}
	}
	return rel
}

// bindingNameOf returns the identifier a `const` / `let` / `var` declaration
// binds the call's result to, unwrapping parentheses, `as`, `satisfies`, a
// legacy type assertion and `!` on the way up. Empty for a call in any other
// position — an argument to a wrapper, a bare statement, an object property —
// which is what sends the id rule to the body hash instead.
func bindingNameOf(call *ast.Node) string {
	node := call
	for node != nil && node.Parent != nil {
		parent := node.Parent
		switch parent.Kind {
		case ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindSatisfiesExpression,
			ast.KindTypeAssertionExpression, ast.KindNonNullExpression:
			node = parent
			continue
		case ast.KindVariableDeclaration:
			decl := parent.AsVariableDeclaration()
			if decl == nil || decl.Initializer != node {
				return ""
			}
			nameNode := decl.Name()
			if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
				return ""
			}
			return nameNode.Text()
		}
		return ""
	}
	return ""
}
