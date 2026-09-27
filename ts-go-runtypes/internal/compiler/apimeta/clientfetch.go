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

// UseMethodsMetadataName is the client call that sets up metadata fetching.
const UseMethodsMetadataName = "useMethodsMetadata"

// ClientApi is one `initClient<Api>` call: the API it names and where to report about it.
type ClientApi struct {
	ApiType  *checker.Type
	DiagSite diagnostics.Site
}

// FetchSetUpSite returns the first `useMethodsMetadata(...)` call of `files` declared by the client package.
func FetchSetUpSite(typeChecker *checker.Checker, markerOpts marker.Options, lookup purefunctions.SourceFileLookup, files []string) (diagnostics.Site, bool) {
	for _, filePath := range files {
		sourceFile := lookup.SourceFile(filePath)
		if sourceFile == nil || sourceFile.IsDeclarationFile || !strings.Contains(sourceFile.Text(), UseMethodsMetadataName) {
			continue
		}
		var found *ast.Node
		forEachCall(sourceFile, func(call *ast.Node) bool {
			if isClientCall(typeChecker, markerOpts, call, UseMethodsMetadataName) {
				found = call
			}
			return found == nil
		})
		if found != nil {
			return textpos.NodeSite(sourceFile.FileName(), sourceFile, found), true
		}
	}
	return diagnostics.Site{}, false
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
			if !isInitClientCall(typeChecker, markerOpts, call) {
				return true
			}
			if apiType := buildVersionApi(typeChecker, markerOpts, call); apiType != nil {
				out = append(out, ClientApi{ApiType: apiType, DiagSite: textpos.NodeSite(sourceFile.FileName(), sourceFile, call)})
			}
			return true
		})
	}
	return out
}

// buildVersionApi reads the API type off the call's InjectBuildVersion parameter, the one initClient declares.
func buildVersionApi(typeChecker *checker.Checker, markerOpts marker.Options, call *ast.Node) *checker.Type {
	signature := checker.Checker_getResolvedSignature(typeChecker, call, nil, 0)
	if signature == nil {
		return nil
	}
	for _, paramSymbol := range checker.Signature_parameters(signature) {
		if paramSymbol == nil {
			continue
		}
		kind, apiType, matched := marker.DetectAny(typeChecker, checker.Checker_getTypeOfSymbol(typeChecker, paramSymbol), markerOpts)
		if matched && kind == marker.KindInjectBuildVersion && apiType != nil {
			return apiType
		}
	}
	return nil
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
