package apitypes

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// routesContainer is a declaration a `PublicApi<typeof X>` or `PublicApi<X>` names, whose members may be cut.
type routesContainer struct {
	declaration *item
	name        string
}

// cutPrivateMembers cuts every private or raw middleware definition out of the routes a `PublicApi<…>` names.
// `PublicApi` maps those keys away, so the API type is unchanged; what goes is their spelled out definition and,
// with it, what only they use. Members anywhere else are left alone, so no other kept type can change.
func (trimmer *trimmer) cutPrivateMembers() []routesContainer {
	privateDef, publicMethod := trimmer.probeTypes()
	if privateDef == nil || publicMethod == nil {
		return nil // no router to ask: a program without @mionjs/router declares no middleware
	}
	var containers []routesContainer
	cut := map[*ast.Node]bool{}
	for _, file := range trimmer.sortedFiles() {
		var walk func(node *ast.Node) bool
		walk = func(node *ast.Node) bool {
			if !trimmer.isPublicApiReference(node) {
				node.ForEachChild(walk)
				return false
			}
			for _, argument := range node.TypeArguments() {
				file.publicApiArgs = append(file.publicApiArgs, textRange{start: argument.Pos(), end: argument.End()})
				trimmer.cutIn(file, argument, nil, privateDef, publicMethod, cut)
				name := containerName(argument)
				for _, declaration := range file.locals[name] {
					if declaration.kind == itemDeclaration {
						containers = append(containers, routesContainer{declaration: declaration, name: name})
						trimmer.cutIn(file, declaration.statement, []string{name}, privateDef, publicMethod, cut)
					}
				}
			}
			return false
		}
		file.source.AsNode().ForEachChild(walk)
	}
	return containers
}

// containerName is X in `typeof X` or a plain `X` type argument, "" otherwise.
func containerName(argument *ast.Node) string {
	var entity *ast.Node
	switch argument.Kind {
	case ast.KindTypeQuery:
		entity = argument.AsTypeQueryNode().ExprName
	case ast.KindTypeReference:
		entity = argument.AsTypeReferenceNode().TypeName
	}
	if entity != nil && ast.IsIdentifier(entity) {
		return entity.Text()
	}
	return ""
}

// cutIn cuts the private and raw middleware members under node, nested groups included.
func (trimmer *trimmer) cutIn(file *fileInfo, node *ast.Node, path []string, privateDef, publicMethod *checker.Type, cut map[*ast.Node]bool) {
	if node.Kind == ast.KindPropertySignature || node.Kind == ast.KindPropertyDeclaration {
		name := propertyName(node)
		if trimmer.isPrivateDefinition(node, privateDef, publicMethod) {
			if !cut[node] {
				cut[node] = true
				file.holes = append(file.holes, textRange{start: node.Pos(), end: memberEnd(file, node)})
				file.cutLabels = append(file.cutLabels, strings.Join(append(append([]string(nil), path...), name), "."))
			}
			return
		}
		path = append(append([]string(nil), path...), name)
	}
	node.ForEachChild(func(child *ast.Node) bool {
		trimmer.cutIn(file, child, path, privateDef, publicMethod, cut)
		return false
	})
}

// checkContainersUnshared refuses a cut routes declaration that a kept declaration also reads outside a
// `PublicApi<…>`: there the cut would change a type the client compiles, and so its ids.
func (trimmer *trimmer) checkContainersUnshared(containers []routesContainer) error {
	for _, container := range containers {
		declaration := container.declaration
		if !declaration.kept || !declaration.file.hasHoleIn(declaration.statement) {
			continue
		}
		// The declaration reading itself (`keyof typeof routes` in a route) counts too.
		for _, user := range append([]*item{declaration}, declaration.users...) {
			if user.file != declaration.file || user.readsOutsidePublicApi(container.name) {
				return fmt.Errorf("api types: %s is used outside PublicApi<…> in %s, so cutting its private and raw middlewares would change that type: keep the routes object out of other exported types", container.name, trimmer.relative(user.file.path))
			}
		}
	}
	return nil
}

// readsOutsidePublicApi: the item's statement reads name somewhere other than a `PublicApi<…>` type argument.
func (current *item) readsOutsidePublicApi(name string) bool {
	file := current.file
	found := false
	file.eachRef(current.statement, func(identifier *ast.Node) {
		if identifier.Text() != name {
			return
		}
		for _, argument := range file.publicApiArgs {
			if identifier.Pos() >= argument.start && identifier.End() <= argument.end {
				return
			}
		}
		found = true
	})
	return found
}

func (file *fileInfo) hasHoleIn(node *ast.Node) bool {
	for _, hole := range file.holes {
		if hole.start >= node.Pos() && hole.end <= node.End() {
			return true
		}
	}
	return false
}

// isPublicApiReference: a `PublicApi<…>` type, as the router declares it, written plain or as an `import()` type.
func (trimmer *trimmer) isPublicApiReference(node *ast.Node) bool {
	var name *ast.Node
	switch node.Kind {
	case ast.KindTypeReference:
		name = node.AsTypeReferenceNode().TypeName
	case ast.KindImportType:
		name = node.AsImportTypeNode().Qualifier
	default:
		return false
	}
	for name != nil && name.Kind == ast.KindQualifiedName {
		name = name.AsQualifiedName().Right
	}
	if name == nil || !ast.IsIdentifier(name) || name.Text() != "PublicApi" || len(node.TypeArguments()) == 0 {
		return false
	}
	symbol := trimmer.checker.GetSymbolAtLocation(name)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = trimmer.checker.GetAliasedSymbol(symbol)
	}
	return symbol != nil && len(symbol.Declarations) > 0 && marker.DeclaringModuleOfNode(symbol.Declarations[0], nil) == apimeta.RouterModule
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
func (trimmer *trimmer) probeTypes() (privateDef, publicMethod *checker.Type) {
	probe := trimmer.program.SourceFile(filepath.Join(trimmer.declarationDir, probeFile))
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
