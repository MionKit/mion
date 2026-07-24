package enrichment

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Resolved is the result of resolving a named type in a file: the canonical
// top-level RunType node plus the cache lookup the enrichment walkers use to
// follow KindRef sentinels (child slots ride as `{kind:-1, id}` refs).
type Resolved struct {
	// Node is the canonical full RunType for the named type (not a ref).
	Node *protocol.RunType
	// Resolve looks up a KindRef's canonical node by id — pass this as the
	// skeleton / closure emitters' resolve arg.
	Resolve func(id string) *protocol.RunType
	// DeclFiles maps a named type's RunType.ID to the absolute path of its
	// declaration source file (followed through re-exports/aliases to the
	// original). Populated by ResolveTypeRaw (the closure path needs it to split
	// the mirror tree cross-file); ResolveType leaves it nil. A type whose decl
	// file could not be determined is simply absent.
	DeclFiles map[string]string
}

// ResolveType is the out-of-band resolution bridge: given an already-built
// Program plus the resolver's checker + runtype cache and an absolute source
// path, it finds the type alias / interface / class declaration named
// typeName, asks the checker for its declared type, and projects it through
// the cache to a canonical *protocol.RunType. The returned Resolve closure
// (cache.NodeByID) lets the emit walkers follow ref sentinels in the
// child slots.
//
// Callers pass the resolver's OWN checker + cache (res.Checker() /
// res.Cache()) so projected child ids resolve; the parameters stay primitive
// so this package never imports the resolver (which imports this package for
// its checkEnrich pass). It never touches the marker scan or the vite render
// path.
func ResolveType(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, absPath, typeName string) (*Resolved, error) {
	if prog == nil {
		return nil, fmt.Errorf("enrich.ResolveType: program is nil")
	}
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("enrich.ResolveType: source file not in program: %s", absPath)
	}
	if typeChecker == nil {
		return nil, fmt.Errorf("enrich.ResolveType: no checker")
	}

	nameNode := findTypeNameNode(sourceFile, typeName)
	if nameNode == nil {
		return nil, fmt.Errorf("enrich.ResolveType: no type/interface/class named %q in %s", typeName, absPath)
	}

	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil {
		return nil, fmt.Errorf("enrich.ResolveType: no symbol for %q in %s", typeName, absPath)
	}
	tsType := checker.Checker_getDeclaredTypeOfSymbol(typeChecker, symbol)
	if tsType == nil {
		return nil, fmt.Errorf("enrich.ResolveType: no declared type for %q in %s", typeName, absPath)
	}

	resolved := ProjectType(cache, tsType)
	if resolved == nil {
		return nil, fmt.Errorf("enrich.ResolveType: projection produced no node for %q", typeName)
	}
	return resolved, nil
}

// ResolveTypeRaw is the named-type-closure resolution bridge: like ResolveType,
// but it returns the RAW (non-inlined) projected node. The raw graph keeps every
// `{kind:-1, id}` ref sentinel intact, so the closure emitter can tell a
// named-type reference (a ref whose resolved target carries TypeName != "") from
// an anonymous inline shape. The returned Resolve closure (cache.NodeByID) is how
// the emitter follows those refs.
//
// Use this for EmitClosure (multi-const, references between named types); the
// single-const gen path stays on ResolveType (which inlines).
func ResolveTypeRaw(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, absPath, typeName string) (*Resolved, error) {
	if prog == nil {
		return nil, fmt.Errorf("enrich.ResolveTypeRaw: program is nil")
	}
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("enrich.ResolveTypeRaw: source file not in program: %s", absPath)
	}
	if typeChecker == nil {
		return nil, fmt.Errorf("enrich.ResolveTypeRaw: no checker")
	}

	nameNode := findTypeNameNode(sourceFile, typeName)
	if nameNode == nil {
		return nil, fmt.Errorf("enrich.ResolveTypeRaw: no type/interface/class named %q in %s", typeName, absPath)
	}

	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil {
		return nil, fmt.Errorf("enrich.ResolveTypeRaw: no symbol for %q in %s", typeName, absPath)
	}
	tsType := checker.Checker_getDeclaredTypeOfSymbol(typeChecker, symbol)
	if tsType == nil {
		return nil, fmt.Errorf("enrich.ResolveTypeRaw: no declared type for %q in %s", typeName, absPath)
	}

	node := cache.SerializeTopLevel(tsType)
	if node == nil {
		return nil, fmt.Errorf("enrich.ResolveTypeRaw: projection produced no node for %q", typeName)
	}
	declFiles := collectDeclFiles(typeChecker, cache, tsType)
	return &Resolved{Node: node, Resolve: cache.NodeByID, DeclFiles: declFiles}, nil
}

// collectDeclFiles walks the checker type graph rooted at tsType and records, for
// every NAMED type it reaches, a map entry id → absolute declaration source file.
// The id is the cache's structural id (cache.AssignID) so the result keys line up
// with the RunType.ID the closure emitter sees. A type whose declaration file
// cannot be determined is simply omitted (the emitter falls back to the root file).
//
// The walk mirrors the projection's reach — properties, array/promise element,
// type arguments, tuple/Map/Set slots — but is intentionally tolerant: it never
// errors, and a node it cannot descend just stops there.
func collectDeclFiles(typeChecker *checker.Checker, cache *runtype.Cache, tsType *checker.Type) map[string]string {
	out := map[string]string{}
	visited := map[*checker.Type]bool{}
	walkDeclFiles(typeChecker, cache, tsType, out, visited, 0)
	return out
}

// declFileWalkDepth bounds the type-graph walk so a pathological / mutually
// recursive type cannot spin (the per-type visited guard handles ordinary cycles;
// this is the backstop, matching enrich.maxWalkDepth).
const declFileWalkDepth = 64

// bundledLibPrefix is the bundled default-lib directory (normalized). A type
// declared under it is a LIB type and is never AssignID'd or descended
// member-wise here: the architecture projects builtins atomically and never
// walks or interns lib members, and the newer libs' deeply generic
// self-referential structures (lib.esnext's IteratorObject family) instantiate
// FRESH types on every member query — pointer-based cycle detection never
// fires and the structural-id walk overflows the stack. Only reached when the
// project tsconfig selects such a lib (target esnext / target unset); a lib
// file is also never a valid mirror target. Type ARGUMENTS still descend, so a
// user type inside Map<string, User> is found.
var bundledLibPrefix = tspath.NormalizePath(bundled.LibPath())

func walkDeclFiles(typeChecker *checker.Checker, cache *runtype.Cache, tsType *checker.Type, out map[string]string, visited map[*checker.Type]bool, depth int) {
	if tsType == nil || depth > declFileWalkDepth || visited[tsType] {
		return
	}
	visited[tsType] = true

	// Record this type's decl file when it is a NAMED type (alias or interface/
	// class symbol with a declaration). AssignID projects it into the cache and
	// returns the same structural id the closure emitter keys on. Lib-declared
	// types record nothing and stop the member descent (see bundledLibPrefix).
	if file := declFileForType(tsType); file != "" {
		if strings.HasPrefix(tspath.NormalizePath(file), bundledLibPrefix) {
			if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
				for _, typeArgument := range typeChecker.GetTypeArguments(tsType) {
					walkDeclFiles(typeChecker, cache, typeArgument, out, visited, depth+1)
				}
			}
			return
		}
		id := cache.AssignID(tsType)
		if id != "" {
			out[id] = file
		}
	}

	// Descend into the type's reachable children. GetPropertiesOfType covers
	// objects/interfaces/classes; GetTypeArguments covers generic instantiations,
	// arrays, Promise, Map, Set (their element/args are type arguments).
	for _, property := range typeChecker.GetPropertiesOfType(tsType) {
		propertyType := typeChecker.GetTypeOfSymbol(property)
		walkDeclFiles(typeChecker, cache, propertyType, out, visited, depth+1)
	}
	// GetTypeArguments only works on TypeReference targets — calling it on a plain
	// interface (e.g. the lib.d.ts Date interface) panics. Guard with the
	// ObjectFlagsReference flag, the same gate serialize.go uses.
	if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		for _, typeArgument := range typeChecker.GetTypeArguments(tsType) {
			walkDeclFiles(typeChecker, cache, typeArgument, out, visited, depth+1)
		}
	}
}

// declFileForType returns the absolute source file a NAMED type is declared in,
// or "" when the type is anonymous/inline or its declaration file is unknown.
// Prefers the alias symbol (`type User = …`) then the type's own symbol
// (interface / class). Re-exports resolve naturally because the symbol's
// declaration points at the original declaration node.
func declFileForType(tsType *checker.Type) string {
	if alias := checker.Type_alias(tsType); alias != nil {
		if file := declFileForSymbol(alias.Symbol()); file != "" {
			return file
		}
	}
	return declFileForSymbol(tsType.Symbol())
}

// declFileForSymbol returns the file name of a symbol's first declaration whose
// source file is resolvable, or "" when none is.
func declFileForSymbol(symbol *ast.Symbol) string {
	if symbol == nil {
		return ""
	}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		if name := sourceFile.FileName(); name != "" {
			return name
		}
	}
	return ""
}

// ProjectType projects an already-resolved checker type through cache to a
// canonical, fully-inlined *Resolved — the shape the enrichment walkers expect.
// Use this when the caller already holds the *checker.Type for the type of
// interest (e.g. the `check` command, which reads T off a `FriendlyText<T>`
// annotation's type argument) rather than a named declaration in a file.
// Returns nil when the projection yields no node.
func ProjectType(cache *runtype.Cache, tsType *checker.Type) *Resolved {
	if cache == nil || tsType == nil {
		return nil
	}
	node := cache.SerializeTopLevel(tsType)
	if node == nil {
		return nil
	}
	// The cache hands back a REF graph: a compound node's Children / Child slots
	// are `{kind:-1, id}` sentinels into the type table. The enrichment walkers
	// inspect a parent's Children directly (propertyChildren / isObjectLike) and
	// only deref the per-property Child, so they expect those structural slots to
	// be the canonical nodes inline. inlineNode rewrites the slots to the
	// canonical shape (cycle-guarded; deep cycles keep their ref, which the
	// walkers' own deref still follows via the returned Resolve).
	inlined := inlineNode(node, cache.NodeByID, map[string]bool{})
	return &Resolved{Node: inlined, Resolve: cache.NodeByID}
}

// inlineNode returns a copy of rt with every ref-bearing structural slot
// (Children, Child, Return, Parameters, Index) replaced by the canonical node
// it points at, recursively, so the result matches the fully-inlined shape the
// enrichment walkers were authored against. seen guards genuine cycles: a node
// already on the current path keeps its ref form (Kind == KindRef), which the
// walkers' own deref re-follows at emit time.
func inlineNode(rt *protocol.RunType, resolve func(id string) *protocol.RunType, seen map[string]bool) *protocol.RunType {
	if rt == nil {
		return nil
	}
	if rt.Kind == protocol.KindRef {
		canonical := resolve(rt.ID)
		if canonical == nil || seen[rt.ID] {
			return rt
		}
		return inlineNode(canonical, resolve, seen)
	}
	if rt.ID != "" {
		if seen[rt.ID] {
			return protocol.NewRef(rt.ID)
		}
		seen[rt.ID] = true
		defer delete(seen, rt.ID)
	}

	clone := *rt
	if rt.Child != nil {
		clone.Child = inlineNode(rt.Child, resolve, seen)
	}
	if rt.Return != nil {
		clone.Return = inlineNode(rt.Return, resolve, seen)
	}
	if rt.Index != nil {
		clone.Index = inlineNode(rt.Index, resolve, seen)
	}
	clone.Children = inlineSlice(rt.Children, resolve, seen)
	clone.Parameters = inlineSlice(rt.Parameters, resolve, seen)
	return &clone
}

func inlineSlice(in []*protocol.RunType, resolve func(id string) *protocol.RunType, seen map[string]bool) []*protocol.RunType {
	if in == nil {
		return nil
	}
	out := make([]*protocol.RunType, len(in))
	for i, child := range in {
		out[i] = inlineNode(child, resolve, seen)
	}
	return out
}

// findTypeNameNode walks the source file's top-level statements for a type
// alias, interface, or class declaration whose name matches typeName, and
// returns its name identifier node (the location GetSymbolAtLocation expects).
// Returns nil when no such declaration exists.
func findTypeNameNode(sourceFile *ast.SourceFile, typeName string) *ast.Node {
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	for _, statement := range root.Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsTypeAliasDeclaration(statement),
			ast.IsInterfaceDeclaration(statement),
			ast.IsClassDeclaration(statement):
		default:
			continue
		}
		nameNode := statement.Name()
		if nameNode != nil && nameNode.Text() == typeName {
			return nameNode
		}
	}
	return nil
}
