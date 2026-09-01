// resolve.go turns a recognized declaration into its RunType graph + id via
// the same projection the resolver uses for marker call sites
// (runtype.Cache.SerializeTopLevel), entered from the declaration instead.
package convert

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// resolvedDecl pairs a declaration with its projected reflection node.
// Resolve dereferences the `{kind:-1, id}` sentinels child slots carry
// (cache.NodeByID), so printers can recurse into composite kinds.
type resolvedDecl struct {
	Decl    *declaration
	Node    *reflection.RunType
	Resolve func(id string) *reflection.RunType
}

// resolveDecl projects the declaration's type. For a type alias / interface
// the declared type is projected directly; for a const form the type is the
// `T` of the const's `RunType<T>` — the checker has already computed it from
// the builder calls / schema literal, which is exactly the shipped input-side
// convergence this feature builds on.
func resolveDecl(typeChecker *checker.Checker, cache *runtype.Cache, decl *declaration) (*resolvedDecl, error) {
	symbol := typeChecker.GetSymbolAtLocation(decl.NameNode)
	if symbol == nil {
		return nil, fmt.Errorf("convert: no symbol for %q", declLabel(decl))
	}
	var tsType *checker.Type
	// A lazy pair resolves like a type form: its NameNode is the real type
	// declaration's name, and the handle const adds nothing to the graph.
	if decl.Form == TargetType || decl.EscapePair {
		tsType = checker.Checker_getDeclaredTypeOfSymbol(typeChecker, symbol)
	} else {
		runTypeRef := typeChecker.GetTypeOfSymbol(symbol)
		if runTypeRef == nil || runTypeRef.ObjectFlags()&checker.ObjectFlagsReference == 0 {
			return nil, fmt.Errorf("convert: const %q does not resolve to a RunType reference", declLabel(decl))
		}
		typeArguments := typeChecker.GetTypeArguments(runTypeRef)
		if len(typeArguments) == 0 {
			return nil, fmt.Errorf("convert: const %q carries no RunType type argument", declLabel(decl))
		}
		tsType = typeArguments[0]
	}
	if tsType == nil {
		return nil, fmt.Errorf("convert: no type for %q", declLabel(decl))
	}
	node := cache.SerializeTopLevel(tsType)
	if node == nil {
		return nil, fmt.Errorf("convert: projection produced no node for %q", declLabel(decl))
	}
	return &resolvedDecl{Decl: decl, Node: node, Resolve: cache.NodeByID}, nil
}

// declLabel names a declaration for error messages, whichever name it has.
func declLabel(decl *declaration) string {
	if decl.Name != "" {
		return decl.Name
	}
	return decl.ConstName
}
