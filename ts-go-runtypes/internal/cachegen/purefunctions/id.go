package purefunctions

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// A pure fn's id is `<package>:<hash of the body that SHIPS>` (`@acme/text:Kq3fxN9pQ2`, marker package `_rt`).
// The shipped body has each dependency replaced by its id: two files whose `utl.getPureFn(helper)` resolve
// `helper` to different imports have identical text, which would collapse into one entry. Renames and moves
// inside the package keep the id; a body change moves it, so a stale reference is a clean miss, never a different
// body. The package half tells delivery which installed package serves a pure fn and which never ride the
// metadata wire to a client. The id is the registry key everywhere, a dependent body's literal included.

// markerPackageInID is short since every emitted body names built-ins; npm forbids a leading `_`, so no package has it.
const markerPackageInID = "_rt"

// IDFor builds the id of a registration written in filePath whose shipped body hashes to hash.
// A file under no NAMED package keeps the hash alone, the same answer whatever directory the build ran from.
func IDFor(markerOpts marker.Options, filePath, hash string) string {
	opts := marker.WithDefaults(markerOpts)
	packageName, _ := marker.PackageOfFile(filePath, opts.FS)
	return IDPrefix(packageName) + hash
}

// IDPrefix is what every id a package owns starts with.
func IDPrefix(packageName string) string {
	if packageName == marker.DefaultModule {
		packageName = markerPackageInID
	}
	return packageName + constants.PureFnHashPrefix
}

// SplitID returns an id's package and hash halves; ok is false with no separator, never an id this package produced.
func SplitID(id string) (packageName, hash string, ok bool) {
	sep := strings.LastIndex(id, constants.PureFnHashPrefix)
	if sep < 0 {
		return "", "", false
	}
	packageName = id[:sep]
	if packageName == markerPackageInID {
		packageName = marker.DefaultModule
	}
	return packageName, id[sep+len(constants.PureFnHashPrefix):], true
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
