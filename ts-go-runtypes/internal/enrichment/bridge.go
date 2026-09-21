package enrichment

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Resolved is a named type's canonical top-level RunType plus the lookup the walkers follow its `{kind:-1, id}` refs with.
type Resolved struct {
	// Node is the canonical full RunType for the named type (not a ref).
	Node *reflection.RunType
	// Resolve looks up a KindRef's canonical node by id, the skeleton / closure emitters' resolve arg.
	Resolve func(id string) *reflection.RunType
	// DeclFiles maps a named type's ID to its declaration file, followed through re-exports; an undetermined type is absent.
	// Only ResolveTypeRaw populates it, the closure path needing it to split the mirror tree cross-file.
	DeclFiles map[string]string
}

// ResolveType finds the declaration named typeName in absPath and projects its declared type to a canonical RunType.
// Callers pass the resolver's OWN checker and cache so projected child ids resolve; the parameters stay primitive
// so this package never imports the resolver, which imports this one for its checkEnrich pass.
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
	if collision := cache.TakeHashCollision(); collision != nil {
		return nil, collisionError("enrich.ResolveType", collision)
	}
	return resolved, nil
}

// collisionError reports a type-id collision this lane's own cache found, outside the resolver that turns one into MKR014.
// Without it the mirror files would be keyed by an id two types share.
func collisionError(prefix string, collision *runtype.HashCollision) error {
	return fmt.Errorf("%s: two types get the same id %q at hashLength %d (%q and %q); raise hashLength to %d",
		prefix, collision.Hash, collision.Length, collision.Owner, collision.Structural, collision.Length+1)
}

// ResolveTypeRaw is ResolveType returning the RAW node: every ref sentinel stays intact, which is how the closure emitter
// tells a named-type reference from an anonymous inline shape. EmitClosure needs it; the single-const path inlines instead.
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
	if collision := cache.TakeHashCollision(); collision != nil {
		return nil, collisionError("enrich.ResolveTypeRaw", collision)
	}
	return &Resolved{Node: node, Resolve: cache.NodeByID, DeclFiles: declFiles}, nil
}

// collectDeclFiles records a declaration file per NAMED type reachable from tsType, keyed by the cache's structural id
// so the keys line up with the RunType.ID the closure emitter sees; an undeterminable type is omitted.
// The walk mirrors the projection's reach but is deliberately tolerant: it never errors and stops at a node it cannot descend.
func collectDeclFiles(typeChecker *checker.Checker, cache *runtype.Cache, tsType *checker.Type) map[string]string {
	out := map[string]string{}
	visited := map[*checker.Type]bool{}
	walkDeclFiles(typeChecker, cache, tsType, out, visited, 0)
	return out
}

// declFileWalkDepth is the backstop for a pathological type, matching maxWalkDepth; ordinary cycles are the visited guard's.
const declFileWalkDepth = 64

// bundledLibPrefix is the bundled default-lib directory; a type declared under it is never AssignID'd nor descended into.
// Builtins are projected atomically, and lib.esnext's IteratorObject family instantiates FRESH types on every member query,
// so pointer cycle detection never fires and the walk overflows the stack. Type ARGUMENTS still descend.
var bundledLibPrefix = tspath.NormalizePath(bundled.LibPath())

func walkDeclFiles(typeChecker *checker.Checker, cache *runtype.Cache, tsType *checker.Type, out map[string]string, visited map[*checker.Type]bool, depth int) {
	if tsType == nil || depth > declFileWalkDepth || visited[tsType] {
		return
	}
	visited[tsType] = true

	// AssignID projects the type into the cache and returns the same structural id the closure emitter keys on.
	// A lib-declared type records nothing and stops the member descent (see bundledLibPrefix).
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

	// GetPropertiesOfType covers objects; GetTypeArguments covers generics, arrays, Promise, Map and Set, whose slots are args.
	for _, property := range typeChecker.GetPropertiesOfType(tsType) {
		propertyType := typeChecker.GetTypeOfSymbol(property)
		walkDeclFiles(typeChecker, cache, propertyType, out, visited, depth+1)
	}
	// GetTypeArguments panics on a plain interface such as lib.d.ts Date, hence the ObjectFlagsReference gate serialize.go uses.
	if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		for _, typeArgument := range typeChecker.GetTypeArguments(tsType) {
			walkDeclFiles(typeChecker, cache, typeArgument, out, visited, depth+1)
		}
	}
}

// declFileForType returns the file a NAMED type is declared in, "" when anonymous or unknown, preferring the alias symbol.
// A re-export resolves naturally, the symbol's declaration pointing at the original declaration node.
func declFileForType(tsType *checker.Type) string {
	if alias := checker.Type_alias(tsType); alias != nil {
		if file := declFileForSymbol(alias.Symbol()); file != "" {
			return file
		}
	}
	return declFileForSymbol(tsType.Symbol())
}

// declFileForSymbol returns the file of a symbol's first resolvable declaration, "" when none is.
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

// ProjectType projects a checker type the caller already holds into the fully-inlined shape the enrichment walkers expect.
// That is the check lane, which reads T off a `FriendlyText<T>` annotation rather than a named declaration in a file.
func ProjectType(cache *runtype.Cache, tsType *checker.Type) *Resolved {
	if cache == nil || tsType == nil {
		return nil
	}
	node := cache.SerializeTopLevel(tsType)
	if node == nil {
		return nil
	}
	// The cache hands back a REF graph, but the walkers read a parent's Children directly and expect canonical nodes there.
	// A deep cycle keeps its ref, which the walkers' own deref still follows through the returned Resolve.
	inlined := inlineNode(node, cache.NodeByID, map[string]bool{})
	return &Resolved{Node: inlined, Resolve: cache.NodeByID}
}

// inlineNode copies rt with every ref-bearing structural slot replaced by the canonical node it points at, recursively.
// seen guards genuine cycles: a node already on the current path keeps its ref form, which the walkers deref at emit time.
func inlineNode(rt *reflection.RunType, resolve func(id string) *reflection.RunType, seen map[string]bool) *reflection.RunType {
	if rt == nil {
		return nil
	}
	if rt.Kind == reflection.KindRef {
		canonical := resolve(rt.ID)
		if canonical == nil || seen[rt.ID] {
			return rt
		}
		return inlineNode(canonical, resolve, seen)
	}
	if rt.ID != "" {
		if seen[rt.ID] {
			return reflection.NewRef(rt.ID)
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

func inlineSlice(in []*reflection.RunType, resolve func(id string) *reflection.RunType, seen map[string]bool) []*reflection.RunType {
	if in == nil {
		return nil
	}
	out := make([]*reflection.RunType, len(in))
	for i, child := range in {
		out[i] = inlineNode(child, resolve, seen)
	}
	return out
}

// UnresolvedNameRefs returns the entity names in typeName's WRITTEN syntax that resolved to the checker's ERROR type,
// the `any` an author never wrote. A mirror scaffolded from one would silently miss the degraded members, so Plan refuses
// and PlanMany skips. A written `any` is the true intrinsic and never listed; an absent declaration returns nil.
func UnresolvedNameRefs(prog *program.Program, typeChecker *checker.Checker, absPath, typeName string) []string {
	if prog == nil || typeChecker == nil {
		return nil
	}
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil
	}
	nameNode := findTypeNameNode(sourceFile, typeName)
	if nameNode == nil || nameNode.Parent == nil {
		return nil
	}
	// EachWrittenTypeRef follows a reference into the declaration it names, so a degraded name one level deeper refuses too.
	var names []string
	marker.EachWrittenTypeRef(typeChecker, nameNode.Parent, func(node *ast.Node, via []string) {
		if !marker.IsErrorLikeAny(checker.Checker_getTypeFromTypeNode(typeChecker, node)) {
			return
		}
		if name, ok := writtenEntityName(node); ok {
			if len(via) > 0 {
				name += " (via " + strings.Join(via, " > ") + ")"
			}
			names = append(names, name)
		}
	})
	return names
}

// writtenEntityName renders a TypeReference's written entity name, `Ns.Nested.Name` included, for the refusal message.
func writtenEntityName(typeRefNode *ast.Node) (string, bool) {
	typeRef := typeRefNode.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeName == nil {
		return "", false
	}
	var render func(entity *ast.Node) (string, bool)
	render = func(entity *ast.Node) (string, bool) {
		if entity == nil {
			return "", false
		}
		if entity.Kind == ast.KindIdentifier {
			return entity.Text(), true
		}
		if ast.IsQualifiedName(entity) {
			qualified := entity.AsQualifiedName()
			left, leftOk := render(qualified.Left)
			right, rightOk := render(qualified.Right)
			if leftOk && rightOk {
				return left + "." + right, true
			}
		}
		return "", false
	}
	return render(typeRef.TypeName)
}

// findTypeNameNode returns typeName's declaration name identifier, the location GetSymbolAtLocation expects, else nil.
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
