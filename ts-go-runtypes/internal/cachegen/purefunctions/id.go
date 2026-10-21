package purefunctions

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// A pure function's id is `<package name>#pf_<hash of the body that SHIPS>`
// (`@mionjs/run-types#pf_Kq3f_xN9pQ2wLd`), the shipped body being the one with each dependency
// already replaced by that dependency's id: two files whose `utl.getPureFn(helper)` resolves
// `helper` to different imports have identical text, so hashing the text as written would collapse
// them into one entry. Renaming the binding or the export, or moving the file inside the package,
// leave the id alone; it moves when the function changes, so a stale reference is a clean miss and
// never a different body. The package half is what delivery reads ownership off: which installed
// package serves a pure fn, and which never ride the metadata wire to a client. The id is the
// registry key everywhere: injected into the registrar call, registered by the emitted module, and
// carried as a literal by a dependent body after lowering.

// IDFor builds the id of a registration written in filePath whose shipped body hashes to hash.
// A file under no NAMED package keeps the hash alone, the same answer whatever directory the build ran from.
func IDFor(markerOpts marker.Options, filePath, hash string) string {
	opts := marker.WithDefaults(markerOpts)
	packageName, _ := marker.PackageOfFile(filePath, opts.FS)
	return packageName + constants.PureFnHashPrefix + hash
}

// SplitID returns an id's package and hash halves. ok is false for a string
// with no separator, which is never an id this package produced.
func SplitID(id string) (packageName, hash string, ok bool) {
	sep := strings.LastIndex(id, constants.PureFnHashPrefix)
	if sep < 0 {
		return "", "", false
	}
	return id[:sep], id[sep+len(constants.PureFnHashPrefix):], true
}

// valueNodeOf climbs the wrappers that carry no runtime meaning and returns the outermost
// node still standing for the call's own value.
func valueNodeOf(call *ast.Node) *ast.Node {
	node := call
	for node != nil && node.Parent != nil {
		switch node.Parent.Kind {
		case ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindSatisfiesExpression,
			ast.KindTypeAssertionExpression, ast.KindNonNullExpression:
			node = node.Parent
			continue
		}
		return node
	}
	return node
}

// bindingNameOf returns the identifier a declaration binds the call's result to, empty elsewhere.
// It reaches no id, but a hash names nothing searchable, so diagnostics and the generated
// built-in constants use it.
func bindingNameOf(call *ast.Node) string {
	node := valueNodeOf(call)
	if node == nil || node.Parent == nil || node.Parent.Kind != ast.KindVariableDeclaration {
		return ""
	}
	decl := node.Parent.AsVariableDeclaration()
	if decl == nil || decl.Initializer != node {
		return ""
	}
	nameNode := decl.Name()
	if nameNode == nil || nameNode.Kind != ast.KindIdentifier {
		return ""
	}
	return nameNode.Text()
}
