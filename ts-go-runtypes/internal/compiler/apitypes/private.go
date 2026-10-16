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

// cutPrivateMembers cuts private and raw middlewares from the routes a `PublicApi<…>` names, which maps those keys
// away, so the API type is unchanged. Members anywhere else stay, so no other kept type can change.
func (trimmer *trimmer) cutPrivateMembers() []routesContainer {
	probe := trimmer.probeTypes()
	if probe.privateDef == nil || probe.rawDef == nil || probe.publicMethod == nil {
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
				trimmer.cutIn(file, argument, nil, probe, cut)
				name := containerName(argument)
				for _, declaration := range file.locals[name] {
					if declaration.kind == itemDeclaration {
						containers = append(containers, routesContainer{declaration: declaration, name: name})
						trimmer.cutIn(file, declaration.statement, []string{name}, probe, cut)
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
func (trimmer *trimmer) cutIn(file *fileInfo, node *ast.Node, path []string, probe probedTypes, cut map[*ast.Node]bool) {
	if node.Kind == ast.KindPropertySignature || node.Kind == ast.KindPropertyDeclaration {
		name := propertyName(node)
		if trimmer.isPrivateDefinition(node, probe) {
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
		trimmer.cutIn(file, child, path, probe, cut)
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
	file.eachRead(current.statement, func(identifier *ast.Node, _ string) {
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

// isPrivateDefinition mirrors the router's IsPrivateDef: a raw middleware, or a middleware that fits PrivateDef with no
// fixed param after the context; never one that fits a public method. A public middleware typed with a no-params, void
// handler fits too.
func (trimmer *trimmer) isPrivateDefinition(property *ast.Node, probe probedTypes) bool {
	symbol := trimmer.checker.GetSymbolAtLocation(property.Name())
	if symbol == nil {
		return false
	}
	propertyType := trimmer.checker.GetNonNullableType(trimmer.checker.GetTypeOfSymbol(symbol))
	if propertyType == nil || checker.Type_flags(propertyType)&(checker.TypeFlagsAny|checker.TypeFlagsUnknown|checker.TypeFlagsNever) != 0 {
		return false
	}
	if !trimmer.checker.IsTypeAssignableTo(propertyType, probe.privateDef) || trimmer.checker.IsTypeAssignableTo(propertyType, probe.publicMethod) {
		return false
	}
	return trimmer.checker.IsTypeAssignableTo(propertyType, probe.rawDef) || !trimmer.handlerTakesParams(propertyType)
}

// handlerTakesParams mirrors HandlerParams: a fixed param after a required context (a bare rest param counts as none,
// as at runtime; a tuple rest param counts its elements). Assignability alone lets an optional one through.
func (trimmer *trimmer) handlerTakesParams(definition *checker.Type) bool {
	handler := checker.Checker_getPropertyOfType(trimmer.checker, definition, "handler")
	if handler == nil {
		return false
	}
	signatures := trimmer.checker.GetSignaturesOfType(trimmer.checker.GetTypeOfSymbol(handler), checker.SignatureKindCall)
	if len(signatures) == 0 {
		return false
	}
	// Parameters<H> reads the last overload
	signature := signatures[len(signatures)-1]
	parameters := signature.Parameters()
	if len(parameters) > 0 && isOptionalParameter(parameters[0]) {
		return false // HandlerParams reads [] when the context is optional
	}
	fixed := len(parameters)
	if signature.HasRestParameter() {
		fixed--
		if rest := trimmer.checker.GetTypeOfSymbol(parameters[fixed]); rest != nil && rest.IsTupleType() {
			fixed += rest.TargetTupleType().FixedLength()
		}
	}
	return fixed > 1
}

func isOptionalParameter(parameter *ast.Symbol) bool {
	declaration := parameter.ValueDeclaration
	return declaration != nil && declaration.Kind == ast.KindParameter &&
		(ast.HasQuestionToken(declaration) || declaration.AsParameterDeclaration().Initializer != nil)
}

// probedTypes are the router's types the probe file declares.
type probedTypes struct {
	privateDef, rawDef, publicMethod *checker.Type
}

// probeTypes reads the probe file's declared types; all nil when the router does not resolve.
func (trimmer *trimmer) probeTypes() probedTypes {
	var probe probedTypes
	file := trimmer.program.SourceFile(filepath.Join(trimmer.declarationDir, probeFile))
	if file == nil {
		return probe
	}
	for _, statement := range file.Statements.Nodes {
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
				return probedTypes{}
			}
			switch variable.Name().Text() {
			case "privateDef":
				probe.privateDef = declared
			case "rawDef":
				probe.rawDef = declared
			case "publicMethod":
				probe.publicMethod = declared
			}
		}
	}
	return probe
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
