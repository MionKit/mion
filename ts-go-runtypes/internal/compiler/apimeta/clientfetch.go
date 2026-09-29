package apimeta

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

const useMethodsMetadataName = "useMethodsMetadata"

// maxClientTrace caps the hops from a `useMethodsMetadata` argument back to its `initClient` call.
const maxClientTrace = 16

// ClientApi is one `initClient<Api>` call: the API it names and where to report about it.
type ClientApi struct {
	ApiType  *checker.Type
	DiagSite diagnostics.Site
}

// FetchSetUp is one `useMethodsMetadata(...)` call; ApiType is nil when the build cannot follow its argument to an `initClient`.
type FetchSetUp struct {
	ApiType  *checker.Type
	DiagSite diagnostics.Site
}

// FetchSetUps returns every `useMethodsMetadata(...)` call of `files` declared by the client package.
func FetchSetUps(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string) []FetchSetUp {
	markerOpts = marker.WithDefaults(markerOpts)
	var out []FetchSetUp
	for _, filePath := range files {
		sourceFile := lookup.SourceFile(filePath)
		if sourceFile == nil || sourceFile.IsDeclarationFile || !strings.Contains(sourceFile.Text(), useMethodsMetadataName) {
			continue
		}
		forEachCall(sourceFile, func(call *ast.Node) bool {
			if !isClientCall(typeChecker, markerOpts, call, useMethodsMetadataName) {
				return true
			}
			setUp := FetchSetUp{DiagSite: textpos.NodeSite(sourceFile.FileName(), sourceFile, call)}
			if arguments := call.AsCallExpression().Arguments; arguments != nil && len(arguments.Nodes) > 0 {
				if initCall := initClientCallOf(typeChecker, markerOpts, arguments.Nodes[0]); initCall != nil {
					_, setUp.ApiType = BuildVersionParam(typeChecker, markerOpts, initCall)
				}
			}
			out = append(out, setUp)
			return true
		})
	}
	return out
}

// initClientCallOf follows `middlewares.x`, `client.middlewares.x` or a destructured binding back to the `initClient(...)` that made it.
func initClientCallOf(typeChecker *checker.Checker, markerOpts marker.Options, expression *ast.Node) *ast.Node {
	for hops := 0; expression != nil && hops < maxClientTrace; hops++ {
		expression = ast.SkipOuterExpressions(expression, ast.OEKAll)
		switch expression.Kind {
		case ast.KindCallExpression:
			if IsInitClientCall(typeChecker, markerOpts, expression) {
				return expression
			}
			return nil
		case ast.KindPropertyAccessExpression:
			expression = expression.AsPropertyAccessExpression().Expression
		case ast.KindElementAccessExpression:
			expression = expression.AsElementAccessExpression().Expression
		case ast.KindIdentifier:
			expression = variableInitializer(typeChecker, expression)
		default:
			return nil
		}
	}
	return nil
}

// variableInitializer returns the initializer of the variable an identifier names, through imports and destructuring.
func variableInitializer(typeChecker *checker.Checker, identifier *ast.Node) *ast.Node {
	symbol := typeChecker.GetSymbolAtLocation(identifier)
	if symbol == nil {
		return nil
	}
	declaration := checker.SkipAlias(symbol, typeChecker).ValueDeclaration
	if declaration != nil && declaration.Kind == ast.KindBindingElement {
		declaration = ast.WalkUpBindingElementsAndPatterns(declaration)
	}
	if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
		return nil
	}
	return declaration.AsVariableDeclaration().Initializer
}

// ClientApis returns every `initClient` call of `files` with the API type its build-version slot names.
func ClientApis(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string) []ClientApi {
	markerOpts = marker.WithDefaults(markerOpts)
	var out []ClientApi
	for _, filePath := range files {
		sourceFile := lookup.SourceFile(filePath)
		if sourceFile == nil || sourceFile.IsDeclarationFile || !strings.Contains(sourceFile.Text(), InitClientName) {
			continue
		}
		forEachCall(sourceFile, func(call *ast.Node) bool {
			if !IsInitClientCall(typeChecker, markerOpts, call) {
				return true
			}
			if _, apiType := BuildVersionParam(typeChecker, markerOpts, call); apiType != nil {
				out = append(out, ClientApi{ApiType: apiType, DiagSite: textpos.NodeSite(sourceFile.FileName(), sourceFile, call)})
			}
			return true
		})
	}
	return out
}

// BuildVersionParam returns the index of the call's InjectBuildVersion parameter and the API it names; -1 and nil without one.
func BuildVersionParam(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) (int, *checker.Type) {
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return -1, nil
	}
	for paramIndex, paramSymbol := range checker.Signature_parameters(signature) {
		if paramSymbol == nil {
			continue
		}
		kind, apiType, matched := marker.DetectAny(typeChecker, checker.Checker_getTypeOfSymbol(typeChecker, paramSymbol), markerOpts)
		if matched && kind == marker.KindInjectBuildVersion && apiType != nil {
			return paramIndex, apiType
		}
	}
	return -1, nil
}

// isClientCall requires the resolved signature to be declared by the client package, so a same-named local never matches.
func isClientCall(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node, name string) bool {
	callExpr := call.AsCallExpression()
	if callExpr == nil || marker.CalleeIdentifierName(callExpr) != name {
		return false
	}
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return false
	}
	return marker.DeclaringModuleOfNode(checker.Signature_declaration(signature), markerOpts.FS) == ClientModule
}

// forEachCall visits the file's call expressions in source order until visit returns false.
func forEachCall(sourceFile *ast.SourceFile, visit func(call *ast.Node) bool) {
	stopped := false
	var walk ast.Visitor
	walk = func(node *ast.Node) bool {
		if node == nil || stopped {
			return false
		}
		if node.Kind == ast.KindCallExpression && !visit(node) {
			stopped = true
			return false
		}
		node.ForEachChild(walk)
		return false
	}
	sourceFile.AsNode().ForEachChild(walk)
}
