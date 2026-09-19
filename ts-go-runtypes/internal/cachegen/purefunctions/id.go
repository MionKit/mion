package purefunctions

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// A pure function's id is the package that owns it and a hash of the function
// itself:
//
//	<package name>#pf_<hash of the body that ships>
//	@mionjs/run-types#pf_Kq3f_xN9pQ2wLd
//	@acme/text#pf_9Zt1bRm4cVaPqL
//
// One rule for every registration, wherever it is written. The id depends on
// the function and nothing else: renaming the binding it is assigned to,
// renaming the export it is published under, or moving its file inside the
// package all leave it alone. It changes when the function changes, so a stale
// reference is always a clean miss and never a different body.
//
// The body it hashes is the one that SHIPS, with each dependency already
// replaced by that dependency's id. Hashing the body as the author wrote it
// would be cheaper, but two files whose `utl.getPureFn(helper)` resolves
// `helper` to different imports have identical text and different behaviour,
// and they would collapse into one entry. Shipped bodies differ, so their ids
// differ.
//
// The package half stays because delivery reads ownership off it: which
// installed package serves a pure fn, and which never ride the metadata wire
// to a client.
//
// The id is the registry key everywhere: the string the transform injects into
// the registrar call, the key the emitted module registers under, and the
// literal a dependent body carries after lowering.

// IDFor builds the id of a registration written in filePath whose shipped body
// hashes to hash. A file under no NAMED package keeps the hash alone, which is
// what an in-memory overlay or a scratch project gets; unlike a path, that is
// the same answer whatever directory the build ran from.
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

// valueNodeOf climbs the wrappers that carry no runtime meaning — parentheses,
// `as`, `satisfies`, a legacy type assertion and `!` — and returns the
// outermost node still standing for the call's own value.
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

// bindingNameOf returns the identifier a `const` / `let` / `var` declaration
// binds the call's result to. It no longer reaches the id — a name is not an
// identity here — but a hash names nothing a reader can search for, so it is
// what diagnostics quote and what the generated built-in constants are called.
// Empty for a call in any other position.
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
