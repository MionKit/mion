// Package astcheck is the shared AST walk behind the FriendlyText / MockData content checks: it resolves each enrichment
// const's T through the runtype cache, runs the paired checkers of internal/enrichment, and anchors every finding to a
// source position. The CLI check lane and the resolver's checkEnrich pass share it, so it must not import the resolver.
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

// mapKind identifies which enrichment-map alias a declaration is annotated with.
type mapKind int

const (
	mapKindNone mapKind = iota
	mapKindFriendly
	mapKindMock
)

// PositionedFinding pairs a Finding with the site its Path resolved to, the const's own name when the path was not found.
type PositionedFinding struct {
	enrichment.Finding
	Site diagnostics.Site
}

// CheckSourceFile runs the paired checks on every enrichment const with an object-literal initializer, findings anchored.
// markerOpts carries the accepted marker package set and the FS the package.json gate reads; pass the Program's FS so an
// overlay-backed program resolves, nil falls through to real disk. filePath is the path findings report.
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

// variableDeclarations returns the VariableDeclaration nodes of a VariableStatement.
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

// enrichAnnotation reports whether declaration is annotated with FriendlyText / MockData from the marker package, and
// returns that reference's first type argument as a checker type.
// The alias name is read off the SYNTAX, not the resolved type: FriendlyText<T>'s body reduces immediately, so
// getTypeFromTypeNode drops the alias info that marker.go's aliasForSpec path relies on.
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
	// An imported reference resolves to a local alias symbol, and SkipAlias follows it to the declaration in the package.
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

// objectLiteralInitializer returns declaration's initializer when it is an object literal, else nil.
func objectLiteralInitializer(declaration *ast.Node) *ast.Node {
	initializer := declaration.AsVariableDeclaration().Initializer
	if initializer == nil || !ast.IsObjectLiteralExpression(initializer) {
		return nil
	}
	return initializer
}

// findingSite anchors a finding at the property NAME node its Path resolves to, falling back to the const's own name.
func findingSite(filePath string, sourceFile *ast.SourceFile, declaration, literal *ast.Node, path string) diagnostics.Site {
	if node := locatePathNode(literal, path); node != nil {
		return nodeTokenSite(filePath, sourceFile, node)
	}
	if name := declaration.AsVariableDeclaration().Name(); name != nil {
		return nodeTokenSite(filePath, sourceFile, name)
	}
	return nodeTokenSite(filePath, sourceFile, declaration)
}

// nodeTokenSite anchors at the node's TOKEN start, since node.Pos() includes leading trivia and a property key after a
// newline would anchor to the end of the previous line.
func nodeTokenSite(filePath string, sourceFile *ast.SourceFile, node *ast.Node) diagnostics.Site {
	if sourceFile == nil || node == nil {
		return diagnostics.Site{}
	}
	start := scanner.GetTokenPosOfNode(node, sourceFile, false)
	startLine, startCol := textpos.LineCol(sourceFile, start)
	endLine, endCol := textpos.LineCol(sourceFile, node.End())
	return diagnostics.Site{FilePath: filePath, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}

// locatePathNode resolves a finding's dotted Path, say `name.rt$errors.minLength`, to the deepest matched property NAME node.
// Path segments are literal property keys, so a plain split on '.' mirrors the walk; nil when the first segment is missing.
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
