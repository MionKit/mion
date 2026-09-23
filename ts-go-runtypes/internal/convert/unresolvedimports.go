package convert

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// Recognition goes through these packages' symbols, so an unresolved import would read as a clean, empty conversion.
var recognizedPackages = []string{marker.DefaultModule, drizzleRootModule}

// unresolvedImportDiags warns once per recognized package the file imports but the checker cannot resolve.
func unresolvedImportDiags(sourceFile *ast.SourceFile, typeChecker *checker.Checker, absPath string) []Diagnostic {
	var diags []Diagnostic
	seen := map[string]bool{}
	for _, statement := range sourceFile.AsNode().Statements() {
		if statement == nil || !ast.IsImportDeclaration(statement) {
			continue
		}
		specifier := statement.AsImportDeclaration().ModuleSpecifier
		if specifier == nil || !ast.IsStringLiteral(specifier) {
			continue
		}
		module := specifier.Text()
		if seen[module] || !isRecognizedPackage(module) || typeChecker.GetSymbolAtLocation(specifier) != nil {
			continue
		}
		seen[module] = true
		diags = append(diags, Diagnostic{Code: CodeUnresolvedImport, Severity: SeverityWarning, File: absPath, Decl: module,
			Message: fmt.Sprintf("import %q does not resolve, so declarations using it are not recognized and stay as written; install or build the package, or check the tsconfig paths and customConditions", module)})
	}
	return diags
}

// isRecognizedPackage: the `root-` prefix catches the drizzle dialect packages (`@mionjs/drizzle-orm-pg-core`).
func isRecognizedPackage(module string) bool {
	for _, root := range recognizedPackages {
		if module == root || strings.HasPrefix(module, root+"/") || strings.HasPrefix(module, root+"-") {
			return true
		}
	}
	return false
}
