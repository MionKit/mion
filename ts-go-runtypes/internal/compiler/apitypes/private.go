package apitypes

import (
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// cutPrivateMembers cuts every property whose type is a private or raw middleware definition out of the
// declarations. `PublicApi` already maps those keys away, so the API type is unchanged; what goes is their spelled
// out definition in a routes object a kept type names (`PublicApi<typeof routes>`), and with it what only they use.
func (trimmer *trimmer) cutPrivateMembers(prog *program.Program) {
	privateDef, publicMethod := trimmer.probeTypes(prog)
	if privateDef == nil || publicMethod == nil {
		return // no router to ask: a program without @mionjs/router declares no middleware
	}
	for _, file := range trimmer.sortedFiles() {
		var walk func(node *ast.Node, path []string) bool
		walk = func(node *ast.Node, path []string) bool {
			if node.Kind == ast.KindPropertySignature || node.Kind == ast.KindPropertyDeclaration {
				name := propertyName(node)
				if trimmer.isPrivateDefinition(node, privateDef, publicMethod) {
					file.holes = append(file.holes, textRange{start: node.Pos(), end: memberEnd(file, node)})
					file.cutLabels = append(file.cutLabels, strings.Join(append(path, name), "."))
					return false
				}
				path = append(path, name)
			} else if name := node.Name(); name != nil && ast.IsIdentifier(name) && node.Parent != nil && node.Parent.Kind == ast.KindSourceFile {
				path = []string{name.Text()}
			} else if node.Kind == ast.KindVariableDeclaration && ast.IsIdentifier(node.Name()) {
				path = []string{node.Name().Text()}
			}
			node.ForEachChild(func(child *ast.Node) bool { return walk(child, path) })
			return false
		}
		file.source.AsNode().ForEachChild(func(child *ast.Node) bool { return walk(child, nil) })
	}
}

// isPrivateDefinition: the property fits PrivateDef and fits no public method; a public middleware typed with a
// no-params, void handler fits PrivateDef too.
func (trimmer *trimmer) isPrivateDefinition(property *ast.Node, privateDef, publicMethod *checker.Type) bool {
	symbol := trimmer.checker.GetSymbolAtLocation(property.Name())
	if symbol == nil {
		return false
	}
	propertyType := trimmer.checker.GetNonNullableType(trimmer.checker.GetTypeOfSymbol(symbol))
	if propertyType == nil || checker.Type_flags(propertyType)&(checker.TypeFlagsAny|checker.TypeFlagsUnknown|checker.TypeFlagsNever) != 0 {
		return false
	}
	return trimmer.checker.IsTypeAssignableTo(propertyType, privateDef) && !trimmer.checker.IsTypeAssignableTo(propertyType, publicMethod)
}

// probeTypes reads the probe file's two declared types; nil when the router does not resolve.
func (trimmer *trimmer) probeTypes(prog *program.Program) (privateDef, publicMethod *checker.Type) {
	probe := prog.SourceFile(filepath.Join(trimmer.declarationDir, probeFile))
	if probe == nil {
		return nil, nil
	}
	for _, statement := range probe.Statements.Nodes {
		if statement.Kind != ast.KindVariableStatement {
			continue
		}
		for _, variable := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
			symbol := trimmer.checker.GetSymbolAtLocation(variable.Name())
			if symbol == nil {
				continue
			}
			declared := trimmer.checker.GetTypeOfSymbol(symbol)
			if declared == nil || checker.Type_flags(declared)&(checker.TypeFlagsAny|checker.TypeFlagsUnknown) != 0 {
				return nil, nil
			}
			switch variable.Name().Text() {
			case "privateDef":
				privateDef = declared
			case "publicMethod":
				publicMethod = declared
			}
		}
	}
	return privateDef, publicMethod
}

func propertyName(node *ast.Node) string {
	if name := node.Name(); name != nil {
		return name.Text()
	}
	return ""
}

// memberEnd extends a member past a trailing `,` or `;` separator, so the cut leaves valid syntax.
func memberEnd(file *fileInfo, node *ast.Node) int {
	end := node.End()
	for end < len(file.text) && (file.text[end] == ' ' || file.text[end] == '\t') {
		end++
	}
	if end < len(file.text) && (file.text[end] == ',' || file.text[end] == ';') {
		return end + 1
	}
	return node.End()
}
