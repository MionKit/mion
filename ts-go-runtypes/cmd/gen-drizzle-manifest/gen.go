package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// entrySourceFor renders the virtual root the checker program type-checks:
// one namespace import per configured dialect, gathered under a single const
// so each dialect's full value-export surface is one property type away.
func entrySourceFor(config *Config) string {
	var source strings.Builder
	for i, dialect := range config.Dialects {
		fmt.Fprintf(&source, "import * as dialectNs%d from '%s';\n", i, dialect.Module)
	}
	source.WriteString("export const namespaces = {")
	for i, dialect := range config.Dialects {
		if i > 0 {
			source.WriteString(", ")
		}
		fmt.Fprintf(&source, "'%s': dialectNs%d", dialect.Dialect, i)
	}
	source.WriteString("};\n")
	return source.String()
}

// extract builds a tsgo program over drizzle-orm's d.ts (resolved from the
// repo root's hoisted node_modules; the dialect packages carry drizzle-orm as
// a peer) and returns the fresh manifest (statuses unset except auto-skipped
// passthroughs) plus each proxy module's LOCAL exports.
func extract(repoRoot string, config *Config) (*Manifest, map[string]map[string]bool, error) {
	rootDir := filepath.ToSlash(repoRoot)
	entryPath := rootDir + "/__gen_drizzle_manifest_entry__.ts"
	fileNames := []string{entryPath}
	proxyPathByDialect := map[string]string{}
	for _, dialect := range config.Dialects {
		proxyPath := filepath.ToSlash(dialect.proxyPath(repoRoot))
		if _, err := os.Stat(proxyPath); err == nil {
			fileNames = append(fileNames, proxyPath)
			proxyPathByDialect[dialect.Dialect] = proxyPath
		}
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            rootDir,
		SingleThreaded: true,
		Overlay:        map[string]string{entryPath: entrySourceFor(config)},
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
	version, err := sharedDrizzleOrmVersion(repoRoot, config)
	if err != nil {
		return nil, nil, err
	}
	manifest := &Manifest{Comment: manifestComment, DrizzleOrm: version}
	for _, dialect := range config.Dialects {
		namespaceType := checker.Checker_getTypeOfPropertyOfType(typeChecker, namespacesType, dialect.Dialect)
		if namespaceType == nil {
			return nil, nil, fmt.Errorf("no namespace type for %s (%s unresolved?)", dialect.Dialect, dialect.Module)
		}
		for _, exportSymbol := range typeChecker.GetPropertiesOfType(namespaceType) {
			manifest.Entries = append(manifest.Entries, classifyExport(typeChecker, dialect.Dialect, exportSymbol))
		}
	}
	localExportsByDialect := map[string]map[string]bool{}
	for _, dialect := range config.Dialects {
		localExportsByDialect[dialect.Dialect] = localExports(prog, proxyPathByDialect[dialect.Dialect])
	}
	// Annotate each column entry with its pure-type alias: the upperFirst rule
	// checked against the proxy's TYPE exports (named re-exports from the core
	// package count here - the modifier markers live there deliberately).
	typeExportsByDialect := map[string]map[string]bool{}
	for _, dialect := range config.Dialects {
		typeExportsByDialect[dialect.Dialect] = typeExports(prog, proxyPathByDialect[dialect.Dialect])
	}
	for i := range manifest.Entries {
		entry := &manifest.Entries[i]
		if entry.Kind != "column" {
			continue
		}
		if alias := upperFirst(entry.Fn); typeExportsByDialect[entry.Dialect][alias] {
			entry.TypeAlias = alias
		}
	}
	return manifest, localExportsByDialect, nil
}

// isChainableModifier keeps only the AUTHORING modifiers of a builder: a
// callable property whose return type still carries a same-named callable
// property, i.e. the call stays on the builder chain. Materializers like
// sqlite's public `build(table)` return the finished column (no same-named
// method on it) and drop out with no name list.
func isChainableModifier(typeChecker *checker.Checker, methodName string, methodType *checker.Type) bool {
	for _, signature := range typeChecker.GetSignaturesOfType(methodType, checker.SignatureKindCall) {
		returnType := checker.Checker_getReturnTypeOfSignature(typeChecker, signature)
		if returnType == nil {
			continue
		}
		for _, property := range typeChecker.GetPropertiesOfType(returnType) {
			if property.Name != methodName {
				continue
			}
			propertyType := checker.Checker_getTypeOfSymbol(typeChecker, property)
			if propertyType != nil && len(typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)) > 0 {
				return true
			}
		}
	}
	return false
}

func upperFirst(name string) string {
	if name == "" {
		return name
	}
	runes := []rune(name)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

// typeExports collects the names a proxy module exports in TYPE space: local
// type aliases / interfaces, plus NAMED re-exports from any specifier
// (relative and bare alike - the dialect packages re-export the modifier
// markers from @mionjs/drizzle-orm by name). Star re-exports recurse through
// relative targets only.
func typeExports(prog *program.Program, modulePath string) map[string]bool {
	names := map[string]bool{}
	collectTypeExports(prog, modulePath, names, map[string]bool{})
	return names
}

func collectTypeExports(prog *program.Program, modulePath string, names map[string]bool, visited map[string]bool) {
	if modulePath == "" || visited[modulePath] {
		return
	}
	visited[modulePath] = true
	moduleFile := prog.SourceFile(modulePath)
	if moduleFile == nil {
		return
	}
	for _, statement := range moduleFile.AsNode().Statements() {
		if statement == nil {
			continue
		}
		switch {
		case ast.IsTypeAliasDeclaration(statement) || ast.IsInterfaceDeclaration(statement):
			if ast.HasSyntacticModifier(statement, ast.ModifierFlagsExport) && statement.Name() != nil {
				names[statement.Name().Text()] = true
			}
		case ast.IsExportDeclaration(statement):
			exportDeclaration := statement.AsExportDeclaration()
			if exportDeclaration.ExportClause != nil {
				for _, specifier := range exportDeclaration.ExportClause.AsNamedExports().Elements.Nodes {
					if nameNode := specifier.Name(); nameNode != nil {
						names[nameNode.Text()] = true
					}
				}
				continue
			}
			if exportDeclaration.ModuleSpecifier == nil {
				continue
			}
			specifierText := exportDeclaration.ModuleSpecifier.Text()
			if !strings.HasPrefix(specifierText, "./") && !strings.HasPrefix(specifierText, "../") {
				continue
			}
			target := filepath.ToSlash(filepath.Join(filepath.Dir(modulePath), filepath.FromSlash(specifierText)))
			collectTypeExports(prog, target, names, visited)
		}
	}
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
	handles := map[string]bool{}
	modifierSet := map[string]bool{}
	for _, signature := range callSignatures {
		declarationNode := checker.Signature_declaration(signature)
		if declarationNode == nil {
			continue
		}
		if head := returnTypeHead(declarationNode.Type()); head != "" {
			handles[head] = true
		}
		if returnTypeNode := declarationNode.Type(); returnTypeNode != nil && strings.Contains(nodeText(returnTypeNode), "BuilderInitial") {
			isColumn = true
			// The chainable modifier methods on this overload's resolved
			// builder - the machine-readable modifier vocabulary the type
			// road's markers must cover.
			if returnType := checker.Checker_getReturnTypeOfSignature(typeChecker, signature); returnType != nil {
				for _, property := range typeChecker.GetPropertiesOfType(returnType) {
					propertyType := checker.Checker_getTypeOfSymbol(typeChecker, property)
					if propertyType != nil && isChainableModifier(typeChecker, property.Name, propertyType) {
						modifierSet[property.Name] = true
					}
				}
			}
		}
		overloadParams = append(overloadParams, parameterListText(declarationNode))
	}
	entry.Status, entry.Reason, entry.Params = statusPending, "", overloadParams
	if isColumn {
		entry.Kind = "column"
		for name := range modifierSet {
			entry.Modifiers = append(entry.Modifiers, name)
		}
		slices.Sort(entry.Modifiers)
	} else {
		entry.Kind = "function"
		// The type each overload HANDS BACK, by name. drizzle-migrate decides
		// which exports declare a splittable handle from a judgement (an index
		// splits, a foreign key does not), and this is the machine-readable
		// half of that: a drizzle upgrade that adds an export returning a new
		// handle shows up as a name nobody has classified, which the arm's own
		// test then flags instead of silently doing nothing.
		for name := range handles {
			entry.Handles = append(entry.Handles, name)
		}
		slices.Sort(entry.Handles)
	}
	return entry
}

// returnTypeHead is a declared return type's leading identifier, so
// `PgTableWithColumns<...>` answers PgTableWithColumns and a function or union
// return answers "". Syntactic, like the column check above.
func returnTypeHead(returnTypeNode *ast.Node) string {
	if returnTypeNode == nil || returnTypeNode.Kind != ast.KindTypeReference {
		return ""
	}
	typeName := returnTypeNode.AsTypeReferenceNode().TypeName
	for typeName != nil && typeName.Kind == ast.KindQualifiedName {
		typeName = typeName.AsQualifiedName().Right
	}
	if typeName == nil || !ast.IsIdentifier(typeName) {
		return ""
	}
	return typeName.Text()
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
// package: exported function/const/class statements, `export {...}` clauses
// without a module specifier, and re-exports (star or named) from RELATIVE
// specifiers, followed recursively — a package is free to split its authoring
// surface across files. Re-exports from bare specifiers (drizzle-orm itself)
// deliberately do not count: a migrated entry must be a real wrapper defined
// in the package, never drizzle passthrough.
func localExports(prog *program.Program, proxyPath string) map[string]bool {
	names := map[string]bool{}
	collectLocalExports(prog, proxyPath, names, map[string]bool{})
	return names
}

func collectLocalExports(prog *program.Program, modulePath string, names map[string]bool, visited map[string]bool) {
	if modulePath == "" || visited[modulePath] {
		return
	}
	visited[modulePath] = true
	moduleFile := prog.SourceFile(modulePath)
	if moduleFile == nil {
		return
	}
	relativeTarget := func(moduleSpecifier *ast.Node) string {
		specifierText := moduleSpecifier.Text()
		if !strings.HasPrefix(specifierText, "./") && !strings.HasPrefix(specifierText, "../") {
			return ""
		}
		return filepath.ToSlash(filepath.Join(filepath.Dir(modulePath), filepath.FromSlash(specifierText)))
	}
	for _, statement := range moduleFile.AsNode().Statements() {
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
			if exportDeclaration.ModuleSpecifier == nil {
				if exportDeclaration.ExportClause == nil {
					continue
				}
				for _, specifier := range exportDeclaration.ExportClause.AsNamedExports().Elements.Nodes {
					if nameNode := specifier.Name(); nameNode != nil {
						names[nameNode.Text()] = true
					}
				}
				continue
			}
			target := relativeTarget(exportDeclaration.ModuleSpecifier)
			if target == "" {
				continue // bare specifier: drizzle passthrough never counts
			}
			if exportDeclaration.ExportClause == nil {
				// export * from './x.ts' — everything the target defines locally.
				collectLocalExports(prog, target, names, visited)
				continue
			}
			// export {a, b as c} from './x.ts' — the re-exported NAMES, provided
			// the target really defines them in-package.
			targetNames := map[string]bool{}
			collectLocalExports(prog, target, targetNames, map[string]bool{})
			for _, specifier := range exportDeclaration.ExportClause.AsNamedExports().Elements.Nodes {
				exported := specifier.Name()
				local := specifier.PropertyName()
				sourceName := ""
				if local != nil {
					sourceName = local.Text()
				} else if exported != nil {
					sourceName = exported.Text()
				}
				if exported != nil && targetNames[sourceName] {
					names[exported.Text()] = true
				}
			}
		}
	}
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

// sharedDrizzleOrmVersion resolves drizzle-orm per configured package and
// enforces that every dialect package sees the SAME version - the packages
// are versioned in lockstep with drizzle-orm, so a split install is a bug.
func sharedDrizzleOrmVersion(repoRoot string, config *Config) (string, error) {
	versionByPackage := map[string]string{}
	versions := map[string]bool{}
	for _, dialect := range config.Dialects {
		version := drizzleOrmVersion(repoRoot, dialect.PackageDir)
		versionByPackage[dialect.PackageDir] = version
		versions[version] = true
	}
	if len(versions) > 1 {
		var lines []string
		for _, dialect := range config.Dialects {
			lines = append(lines, fmt.Sprintf("%s -> %s", dialect.PackageDir, versionByPackage[dialect.PackageDir]))
		}
		return "", errors.New("dialect packages resolve DIFFERENT drizzle-orm versions:\n  " + strings.Join(lines, "\n  "))
	}
	for version := range versions {
		return version, nil
	}
	return "unknown", nil
}

// drizzleOrmVersion reads the resolved drizzle-orm package.json version so a
// dependency bump always surfaces as manifest drift, param changes or not.
func drizzleOrmVersion(repoRoot string, packageDir string) string {
	for _, candidate := range []string{
		filepath.Join(repoRoot, filepath.FromSlash(packageDir), "node_modules", "drizzle-orm", "package.json"),
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
