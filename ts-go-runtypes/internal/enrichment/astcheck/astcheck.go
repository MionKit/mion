// Package astcheck is the shared AST walk behind the FriendlyText / MockData
// content checks: it finds every `const <name>: FriendlyText<T> | MockData<T>
// = {…}` declaration in a source file, resolves T through the runtype cache,
// runs the paired checkers from internal/enrich, and anchors each finding to
// a real source position (the literal node its dotted Path points at).
//
// Two consumers share it — `mion check` (cmd/mion) and the
// resolver's checkEnrich pass (internal/compiler/resolver), which serves the same
// findings to the ts-runtypes-devtools lint plugin. It must not import the
// resolver (the resolver imports it).
package astcheck

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/mirror"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// mapKind identifies which enrichment-map alias a `const … : X<T>` declaration
// is annotated with.
type mapKind int

const (
	mapKindNone mapKind = iota
	mapKindFriendly
	mapKindMock
)

// PositionedFinding pairs an enrichment.Finding with the diagnostics.Site its Path
// resolved to (the property NAME node inside the const's object literal, or
// the const's name when the path could not be located).
type PositionedFinding struct {
	enrichment.Finding
	Site diagnostics.Site
}

// CheckSourceFile walks sourceFile's variable statements, runs the paired
// FriendlyText / MockData checks on every enrichment const with an
// object-literal initializer, and returns position-anchored findings.
// markerOpts carries the accepted marker package set + the filesystem the
// package.json gate reads — pass the
// Program's FS so overlay-backed programs resolve; nil falls through to the
// real disk (the CLI case). filePath is the path findings report (the
// resolver echoes request-normalized paths; the CLI passes the absolute path).
func CheckSourceFile(sourceFile *ast.SourceFile, typeChecker *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, filePath string) []PositionedFinding {
	var out []PositionedFinding
	if sourceFile == nil || typeChecker == nil || cache == nil {
		return out
	}
	root := sourceFile.AsNode()
	if root == nil {
		return out
	}
	for _, statement := range root.Statements() {
		if statement == nil || !ast.IsVariableStatement(statement) {
			continue
		}
		for _, declaration := range variableDeclarations(statement) {
			kind, typeArg := enrichAnnotation(typeChecker, declaration, markerOpts)
			if kind == mapKindNone || typeArg == nil {
				continue
			}
			literal := objectLiteralInitializer(declaration)
			if literal == nil {
				continue
			}
			resolved := enrichment.ProjectType(cache, typeArg)
			if resolved == nil {
				continue
			}
			view := mirror.NewASTLiteralView(literal)
			var findings []enrichment.Finding
			switch kind {
			case mapKindFriendly:
				findings = enrichment.CheckFriendly(resolved.Node, view, resolved.Resolve)
			case mapKindMock:
				findings = enrichment.CheckMock(resolved.Node, view, resolved.Resolve)
			}
			for _, finding := range findings {
				out = append(out, PositionedFinding{
					Finding: finding,
					Site:    findingSite(filePath, sourceFile, declaration, literal, finding.Path),
				})
			}
		}
	}
	return out
}

// variableDeclarations returns the VariableDeclaration nodes of a
// VariableStatement.
func variableDeclarations(statement *ast.Node) []*ast.Node {
	declaration := statement.AsVariableStatement().DeclarationList
	if declaration == nil {
		return nil
	}
	list := declaration.AsVariableDeclarationList()
	if list == nil || list.Declarations == nil {
		return nil
	}
	return list.Declarations.Nodes
}

// enrichAnnotation reports whether declaration's type annotation is a
// reference to FriendlyText / MockData declared in the mion package, and
// returns the reference's first type argument (T) projected to a checker type.
//
// The alias name is read off the type-reference SYNTAX (TypeName symbol),
// resolving the local import alias to its target via SkipAlias, then confirming
// the module the same way marker.go does. We can't read it off the resolved
// `*checker.Type` (marker.go's aliasForSpec path) because FriendlyText<T>'s body
// reduces immediately, so getTypeFromTypeNode drops the alias info.
func enrichAnnotation(typeChecker *checker.Checker, declaration *ast.Node, markerOpts marker.Options) (mapKind, *checker.Type) {
	if !ast.IsVariableDeclaration(declaration) {
		return mapKindNone, nil
	}
	typeNode := declaration.AsVariableDeclaration().Type
	if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
		return mapKindNone, nil
	}
	typeName := typeNode.AsTypeReferenceNode().TypeName
	if typeName == nil {
		return mapKindNone, nil
	}
	symbol := typeChecker.GetSymbolAtLocation(typeName)
	if symbol == nil {
		return mapKindNone, nil
	}
	// A `import {FriendlyText} from '@mionjs/run-types'` reference resolves to a local
	// import-alias symbol whose declaration is the import specifier; SkipAlias
	// follows it to the original type-alias declaration in the package.
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = checker.SkipAlias(symbol, typeChecker)
	}
	if symbol == nil {
		return mapKindNone, nil
	}
	var kind mapKind
	switch {
	case enrichment.IsFriendlyWrapperName(symbol.Name): // FriendlyText (+ legacy FriendlyType)
		kind = mapKindFriendly
	case symbol.Name == enrichment.MockDataName:
		kind = mapKindMock
	default:
		return mapKindNone, nil
	}
	if !markerOpts.DeclaredInMarkerPackage(symbol) {
		return mapKindNone, nil
	}
	typeArgumentNodes := typeNode.TypeArguments()
	if len(typeArgumentNodes) == 0 {
		return mapKindNone, nil
	}
	typeArg := checker.Checker_getTypeFromTypeNode(typeChecker, typeArgumentNodes[0])
	if typeArg == nil {
		return mapKindNone, nil
	}
	return kind, typeArg
}

// objectLiteralInitializer returns declaration's initializer when it is an
// object literal, else nil.
func objectLiteralInitializer(declaration *ast.Node) *ast.Node {
	initializer := declaration.AsVariableDeclaration().Initializer
	if initializer == nil || !ast.IsObjectLiteralExpression(initializer) {
		return nil
	}
	return initializer
}

// findingSite anchors a finding: the property NAME node its dotted Path
// resolves to inside the const's literal, falling back to the const's name
// (then the whole declaration) when the path can't be located.
func findingSite(filePath string, sourceFile *ast.SourceFile, declaration, literal *ast.Node, path string) diagnostics.Site {
	if node := locatePathNode(literal, path); node != nil {
		return nodeTokenSite(filePath, sourceFile, node)
	}
	if name := declaration.AsVariableDeclaration().Name(); name != nil {
		return nodeTokenSite(filePath, sourceFile, name)
	}
	return nodeTokenSite(filePath, sourceFile, declaration)
}

// nodeTokenSite is textpos.NodeSite anchored at the node's TOKEN start (the
// first real character) rather than node.Pos(), which includes leading trivia
// — a property key preceded by a newline would otherwise anchor to the end of
// the previous line.
func nodeTokenSite(filePath string, sourceFile *ast.SourceFile, node *ast.Node) diagnostics.Site {
	if sourceFile == nil || node == nil {
		return diagnostics.Site{}
	}
	start := scanner.GetTokenPosOfNode(node, sourceFile, false)
	startLine, startCol := textpos.LineCol(sourceFile, start)
	endLine, endCol := textpos.LineCol(sourceFile, node.End())
	return diagnostics.Site{FilePath: filePath, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}

// locatePathNode resolves a finding's dotted Path (`name.$errors.minLength`)
// against the const's object literal, returning the NAME node of the deepest
// matched property. Path segments are literal property keys (the checkers
// build paths with joinPath over the keys they walk), so a plain split on '.'
// mirrors the walk. Returns nil when even the first segment is missing.
func locatePathNode(literal *ast.Node, path string) *ast.Node {
	if literal == nil || path == "" {
		return nil
	}
	var found *ast.Node
	current := literal
	for _, segment := range strings.Split(path, ".") {
		if current == nil || !ast.IsObjectLiteralExpression(current) {
			break
		}
		var name, initializer *ast.Node
		for _, property := range current.AsObjectLiteralExpression().Properties.Nodes {
			if property == nil || !ast.IsPropertyAssignment(property) {
				continue
			}
			propertyName := property.Name()
			if propertyName == nil || propertyName.Text() != segment {
				continue
			}
			name = propertyName
			initializer = property.AsPropertyAssignment().Initializer
			break
		}
		if name == nil {
			break
		}
		found = name
		current = initializer
	}
	return found
}
