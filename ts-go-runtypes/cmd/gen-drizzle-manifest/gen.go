package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

type dialectSpec struct {
	Name         string
	Module       string
	ProxyRelPath string
}

var dialects = []dialectSpec{
	{Name: "mysql", Module: "drizzle-orm/mysql-core", ProxyRelPath: "packages/drizzle/src/proxies/mysql.ts"},
	{Name: "pg", Module: "drizzle-orm/pg-core", ProxyRelPath: "packages/drizzle/src/proxies/pg.ts"},
	{Name: "sqlite", Module: "drizzle-orm/sqlite-core", ProxyRelPath: "packages/drizzle/src/proxies/sqlite.ts"},
}

// entrySource is the virtual root the checker program type-checks: one
// namespace import per dialect, gathered under a single const so each
// dialect's full value-export surface is one property type away.
const entrySource = `import * as drizzlePg from 'drizzle-orm/pg-core';
import * as drizzleMysql from 'drizzle-orm/mysql-core';
import * as drizzleSqlite from 'drizzle-orm/sqlite-core';
export const namespaces = {pg: drizzlePg, mysql: drizzleMysql, sqlite: drizzleSqlite};
`

// extract builds a tsgo program over drizzle-orm's d.ts (resolved from
// packages/drizzle's node_modules) and returns the fresh manifest (statuses
// unset except auto-skipped helpers) plus each proxy module's LOCAL exports.
func extract(repoRoot string) (*Manifest, map[string]map[string]bool, error) {
	drizzleDir := filepath.ToSlash(filepath.Join(repoRoot, "packages", "drizzle"))
	entryPath := drizzleDir + "/__gen_drizzle_manifest_entry__.ts"
	fileNames := []string{entryPath}
	proxyPathByDialect := map[string]string{}
	for _, dialect := range dialects {
		proxyPath := filepath.ToSlash(filepath.Join(repoRoot, filepath.FromSlash(dialect.ProxyRelPath)))
		if _, err := os.Stat(proxyPath); err == nil {
			fileNames = append(fileNames, proxyPath)
			proxyPathByDialect[dialect.Name] = proxyPath
		}
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            drizzleDir,
		SingleThreaded: true,
		Overlay:        map[string]string{entryPath: entrySource},
		Conditions:     []string{"source"},
	}, fileNames)
	if err != nil {
		return nil, nil, err
	}
	typeChecker, releaseChecker := prog.TS.GetTypeChecker(context.Background())
	defer releaseChecker()

	namespacesType, err := namespacesTypeOf(prog, typeChecker, entryPath)
	if err != nil {
		return nil, nil, err
	}
	manifest := &Manifest{Comment: manifestComment, DrizzleOrm: drizzleOrmVersion(repoRoot)}
	for _, dialect := range dialects {
		namespaceType := checker.Checker_getTypeOfPropertyOfType(typeChecker, namespacesType, dialect.Name)
		if namespaceType == nil {
			return nil, nil, fmt.Errorf("no namespace type for %s (%s unresolved?)", dialect.Name, dialect.Module)
		}
		for _, exportSymbol := range typeChecker.GetPropertiesOfType(namespaceType) {
			manifest.Entries = append(manifest.Entries, classifyExport(typeChecker, dialect.Name, exportSymbol))
		}
	}
	localExportsByDialect := map[string]map[string]bool{}
	for _, dialect := range dialects {
		localExportsByDialect[dialect.Name] = localExports(prog, proxyPathByDialect[dialect.Name])
	}
	return manifest, localExportsByDialect, nil
}

// classifyExport decides the entry kind. A `column` builder is a callable
// with at least one overload returning a `*BuilderInitial<...>` type (the
// drizzle-wide naming convention for every column builder factory, checked
// syntactically on the d.ts return type so mode-conditional returns like
// numeric's still classify). Any OTHER callable is a `function` - reviewable:
// it arrives pending and a human flips it to migrated (mapped via a local
// proxy export) or skipped with a written reason. Non-callables (classes,
// constants) are `passthrough`: generator-owned auto-skip, no params recorded
// (class constructor churn would bloat the manifest), hand-edits ignored.
func classifyExport(typeChecker *checker.Checker, dialectName string, exportSymbol *ast.Symbol) Entry {
	entry := Entry{Dialect: dialectName, Fn: exportSymbol.Name, Kind: "passthrough", Status: statusSkipped, Reason: passthroughReason}
	symbolType := checker.Checker_getTypeOfSymbol(typeChecker, exportSymbol)
	if symbolType == nil {
		return entry
	}
	callSignatures := typeChecker.GetSignaturesOfType(symbolType, checker.SignatureKindCall)
	if len(callSignatures) == 0 {
		return entry
	}
	isColumn := false
	var overloadParams []string
	for _, signature := range callSignatures {
		declarationNode := checker.Signature_declaration(signature)
		if declarationNode == nil {
			continue
		}
		if returnTypeNode := declarationNode.Type(); returnTypeNode != nil && strings.Contains(nodeText(returnTypeNode), "BuilderInitial") {
			isColumn = true
		}
		overloadParams = append(overloadParams, parameterListText(declarationNode))
	}
	entry.Status, entry.Reason, entry.Params = statusPending, "", overloadParams
	if isColumn {
		entry.Kind = "column"
	} else {
		entry.Kind = "function"
	}
	return entry
}

// parameterListText renders one overload's parameter list from its d.ts
// declaration, whitespace-collapsed - the deterministic shape the drift gate
// compares across drizzle upgrades.
func parameterListText(declarationNode *ast.Node) string {
	var rendered []string
	for _, parameterNode := range declarationNode.Parameters() {
		rendered = append(rendered, nodeText(parameterNode))
	}
	return "(" + strings.Join(rendered, ", ") + ")"
}

func nodeText(node *ast.Node) string {
	sourceFile := ast.GetSourceFileOfNode(node)
	if sourceFile == nil {
		return ""
	}
	return strings.Join(strings.Fields(sourceFile.Text()[node.Pos():node.End()]), " ")
}

// namespacesTypeOf finds the entry overlay's `namespaces` const and returns
// its object type (one property per dialect namespace).
func namespacesTypeOf(prog *program.Program, typeChecker *checker.Checker, entryPath string) (*checker.Type, error) {
	entryFile := prog.SourceFile(entryPath)
	if entryFile == nil {
		return nil, fmt.Errorf("entry overlay %s not in program", entryPath)
	}
	for _, statement := range entryFile.AsNode().Statements() {
		if statement == nil || !ast.IsVariableStatement(statement) {
			continue
		}
		for _, declaration := range variableDeclarationsOf(statement) {
			nameNode := declaration.Name()
			if nameNode == nil || nameNode.Text() != "namespaces" {
				continue
			}
			namespacesSymbol := typeChecker.GetSymbolAtLocation(nameNode)
			if namespacesSymbol == nil {
				return nil, errors.New("no symbol for the namespaces const")
			}
			namespacesType := checker.Checker_getTypeOfSymbol(typeChecker, namespacesSymbol)
			if namespacesType == nil {
				return nil, errors.New("no type for the namespaces const")
			}
			return namespacesType, nil
		}
	}
	return nil, errors.New("namespaces const not found in entry overlay")
}

// localExports collects the names a proxy module exports from its OWN
// declarations: exported function/const/class statements and `export {...}`
// clauses WITHOUT a module specifier. Star and named re-exports deliberately
// do not count - a migrated column must be a real wrapper, not passthrough.
func localExports(prog *program.Program, proxyPath string) map[string]bool {
	names := map[string]bool{}
	if proxyPath == "" {
		return names
	}
	proxyFile := prog.SourceFile(proxyPath)
	if proxyFile == nil {
		return names
	}
	for _, statement := range proxyFile.AsNode().Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsFunctionDeclaration(statement) || ast.IsClassDeclaration(statement):
			if ast.HasSyntacticModifier(statement, ast.ModifierFlagsExport) && statement.Name() != nil {
				names[statement.Name().Text()] = true
			}
		case ast.IsVariableStatement(statement):
			if !ast.HasSyntacticModifier(statement, ast.ModifierFlagsExport) {
				continue
			}
			for _, declaration := range variableDeclarationsOf(statement) {
				if nameNode := declaration.Name(); nameNode != nil && ast.IsIdentifier(nameNode) {
					names[nameNode.Text()] = true
				}
			}
		case ast.IsExportDeclaration(statement):
			exportDeclaration := statement.AsExportDeclaration()
			if exportDeclaration.ModuleSpecifier != nil || exportDeclaration.ExportClause == nil {
				continue
			}
			for _, specifier := range exportDeclaration.ExportClause.AsNamedExports().Elements.Nodes {
				if nameNode := specifier.Name(); nameNode != nil {
					names[nameNode.Text()] = true
				}
			}
		}
	}
	return names
}

func variableDeclarationsOf(statement *ast.Node) []*ast.Node {
	declarationList := statement.AsVariableStatement().DeclarationList
	if declarationList == nil {
		return nil
	}
	variableList := declarationList.AsVariableDeclarationList()
	if variableList == nil || variableList.Declarations == nil {
		return nil
	}
	return variableList.Declarations.Nodes
}

// drizzleOrmVersion reads the resolved drizzle-orm package.json version so a
// dependency bump always surfaces as manifest drift, param changes or not.
func drizzleOrmVersion(repoRoot string) string {
	for _, candidate := range []string{
		filepath.Join(repoRoot, "packages", "drizzle", "node_modules", "drizzle-orm", "package.json"),
		filepath.Join(repoRoot, "node_modules", "drizzle-orm", "package.json"),
	} {
		raw, err := os.ReadFile(candidate)
		if err != nil {
			continue
		}
		var packageJSON struct {
			Version string `json:"version"`
		}
		if json.Unmarshal(raw, &packageJSON) == nil && packageJSON.Version != "" {
			return packageJSON.Version
		}
	}
	return "unknown"
}
