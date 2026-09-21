package drizzlemigrate

// Which declarations become a recorder/drizzle pair: one qualifies when the HEAD of its initializer
// chain is a migrated authoring call, found by walking the chain inwards, so `pgTable(…).enableRLS()`,
// `pgSchema('s').table(…)` and `mySchema.table(…)` ask one question. Everything is keyed by SYMBOL,
// never by name, because drizzle's suites shadow the imports on purpose (`const pgTable =
// pgTableCreator(fn)`): matching the text would split the creator itself and then miss the table.

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/tsimports"
)

// declKinds maps a migrated authoring function onto the binding suffix its declaration gets. Only
// functions that declare a HANDLE are here; anything else produces a value that lives inside one.
var declKinds = map[string]string{
	"pgTable":            "table",
	"mysqlTable":         "table",
	"sqliteTable":        "table",
	"pgView":             "view",
	"pgMaterializedView": "view",
	"mysqlView":          "view",
	"sqliteView":         "view",
	"view":               "view",
	"pgEnum":             "enum",
	"mysqlEnum":          "enum",
	"pgSchema":           "schema",
	"mysqlSchema":        "schema",
	"pgSequence":         "sequence",
	"pgRole":             "role",
	"pgPolicy":           "policy",
	// An INDEX is the one entry drizzle's QUERY side takes directly: mysql's `.useIndex(idx)` wants
	// drizzle's own IndexBuilder while extraConfig wants the recorder, so splitting gives the file both.
	"index":       "index",
	"uniqueIndex": "index",
}

// notDeclarable are the migrated exports producing a value that only lives INSIDE one of the
// declarations above, so a declaration headed by one is left exactly as written. With declKinds and
// tableCreators this classifies EVERY migrated export, which TestEveryMigratedExportIsClassified holds
// the arm to: an export a drizzle upgrade adds fails that test rather than silently doing nothing.
// Which bucket a new export belongs in is a judgement, so it stays written down rather than derived.
var notDeclarable = map[string]string{
	"check":         "a constraint, only valid inside an extraConfig callback",
	"foreignKey":    "a constraint, only valid inside an extraConfig callback",
	"primaryKey":    "a constraint, only valid inside an extraConfig callback",
	"unique":        "a constraint, only valid inside an extraConfig callback",
	"customType":    "returns a column BUILDER, so its calls are columns, never declarations",
	"sql":           "a value, only valid inside a recorder call",
	"tableFromType": "the type road's bridge; a migrated schema never calls it",
}

// tableCreators build a table FACTORY, not a table. The creator declaration is never split (toDrizzle
// takes a table, not a factory); its calls are.
var tableCreators = map[string]bool{"pgTableCreator": true, "mysqlTableCreator": true, "sqliteTableCreator": true}

// handleMethods are the handle methods producing another declarable handle, with the kind each yields.
var handleMethods = map[string]string{"table": "table", "view": "view", "materializedView": "view"}

// chainLink is one call in an initializer's chain: the name invoked and how many arguments it took.
type chainLink struct {
	name string
	argc int
}

// callChain is an initializer decomposed: the innermost identifier plus the
// calls applied to it, innermost first.
type callChain struct {
	head *ast.Node
	// headIsCallee marks that the innermost call's callee IS head, not a value the chain reads from.
	headIsCallee bool
	links        []chainLink
}

// decompose walks an initializer inwards; nil for a shape that is not an identifier with calls applied.
func decompose(initializer *ast.Node) *callChain {
	chain := &callChain{}
	node := initializer
	for node != nil {
		switch {
		case ast.IsParenthesizedExpression(node):
			node = node.AsParenthesizedExpression().Expression
		case ast.IsAsExpression(node):
			node = node.AsAsExpression().Expression
		case ast.IsNonNullExpression(node):
			node = node.AsNonNullExpression().Expression
		case ast.IsCallExpression(node):
			call := node.AsCallExpression()
			argc := 0
			if call.Arguments != nil {
				argc = len(call.Arguments.Nodes)
			}
			callee := call.Expression
			if callee == nil {
				return nil
			}
			if ast.IsIdentifier(callee) {
				chain.links = append([]chainLink{{name: callee.Text(), argc: argc}}, chain.links...)
				chain.head = callee
				chain.headIsCallee = true
				return chain
			}
			if ast.IsPropertyAccessExpression(callee) {
				access := callee.AsPropertyAccessExpression()
				chain.links = append([]chainLink{{name: access.Name().Text(), argc: argc}}, chain.links...)
				node = access.Expression
				continue
			}
			return nil
		case ast.IsIdentifier(node):
			chain.head = node
			chain.headIsCallee = false
			return chain
		default:
			return nil
		}
	}
	return nil
}

// origin says where a chain's head came from.
type origin int

const (
	originNone      origin = iota
	originImport           // a migrated export of a mapped drizzle module
	originCreator          // a local bound to a table factory
	originSplit            // a local bound to a declaration this run already split
	originNamespace        // a migrated export reached through `import * as X`
)

// headOrigin classifies a chain's head; fn is the migrated export name for an import origin, else empty.
func (file *fileRun) headOrigin(chain *callChain) (origin, string, string) {
	symbol := file.checker.GetSymbolAtLocation(chain.head)
	if symbol != nil {
		if _, isCreator := file.creators[symbol]; isCreator {
			return originCreator, "", file.creators[symbol]
		}
		if split, isSplit := file.splitBySymbol[symbol]; isSplit {
			return originSplit, "", split.dialect
		}
	}
	module := tsimports.ModuleOfImport(file.checker, chain.head)
	if module == "" {
		return originNone, "", ""
	}
	rule := file.importMap.RuleFor(module)
	if rule == nil {
		return originNone, "", ""
	}
	// A NAMESPACE head reads its function off the chain: `Driz.pgTable(...)` declares what `pgTable(...)` does.
	if tsimports.IsNamespaceImport(file.checker, chain.head) {
		if len(chain.links) == 0 || !rule.Migrates(chain.links[0].name) {
			return originNone, "", ""
		}
		return originNamespace, chain.links[0].name, rule.Dialect
	}
	imported := tsimports.ImportedNameOf(file.checker, chain.head)
	if !rule.Migrates(imported) {
		return originNone, "", ""
	}
	return originImport, imported, rule.Dialect
}

// classify returns the kind and the arity of the call that named the handle (the view-arity rule reads
// the arity), or a diagnostic when the shape is recognisably ours but unsupported.
func (file *fileRun) classify(chain *callChain, decl *ast.Node) (kind string, argc int, creator bool, diag *Diagnostic) {
	source, fn, _ := file.headOrigin(chain)
	if source == originNone {
		return "", 0, false, nil
	}
	// A method later in the chain wins: `pgSchema('s').table('t', {…})` declares a table, not a schema.
	for index := len(chain.links) - 1; index >= 0; index-- {
		link := chain.links[index]
		if index == 0 && chain.headIsCallee {
			break
		}
		if handleKind, ok := handleMethods[link.name]; ok {
			return handleKind, link.argc, false, nil
		}
	}
	if source == originNamespace {
		// The chain's first link IS the call, so the method scan above must not read it as a handle method.
		handleKind, ok := declKinds[fn]
		if !ok {
			return "", 0, false, nil
		}
		return handleKind, chain.links[0].argc, false, nil
	}
	switch source {
	case originCreator:
		// A call on a table factory IS a table declaration.
		if !chain.headIsCallee {
			return "", 0, false, nil
		}
		return "table", chain.links[0].argc, false, nil
	case originSplit:
		// A handle read without a declaring method: not a declaration of ours.
		return "", 0, false, nil
	}
	if !chain.headIsCallee {
		return "", 0, false, nil
	}
	if tableCreators[fn] {
		// Only the bare factory binding registers: `pgTableCreator(fn)('users', …)` is a table we cannot name.
		if len(chain.links) != 1 {
			return "", 0, false, file.refuse(CodeUnsupportedHead, decl,
				"a table factory used inline has no name to split; bind `"+fn+"(...)` to a const first")
		}
		return "", 0, true, nil
	}
	handleKind, ok := declKinds[fn]
	if !ok {
		// A migrated helper bound to a const stays as written: the binding already holds a recorder.
		return "", 0, false, nil
	}
	return handleKind, chain.links[0].argc, false, nil
}

// splitDecl is one declaration that becomes a recorder/drizzle pair.
type splitDecl struct {
	name     string
	recorder string
	kind     string
	dialect  string
	// nameNode is renamed by edit A; edit B inserts the drizzle half after stmt, the variable statement.
	nameNode *ast.Node
	stmt     *ast.Node
	// initStart/initEnd bound the initializer, where references flip to their recorder binding.
	initStart int
	initEnd   int
}

// singleDeclarationStatement returns the variable statement a declaration is the ONLY declarator of.
// A multi-declarator one has no clean place for the drizzle half, and drizzle's suites never write one.
func singleDeclarationStatement(decl *ast.Node) *ast.Node {
	list := decl.Parent
	if list == nil || !ast.IsVariableDeclarationList(list) {
		return nil
	}
	declarations := list.AsVariableDeclarationList().Declarations
	if declarations == nil || len(declarations.Nodes) != 1 {
		return nil
	}
	statement := list.Parent
	if statement == nil || !ast.IsVariableStatement(statement) {
		return nil
	}
	return statement
}

// eachVariableDeclaration visits every variable declaration in source order, top level AND inside test
// bodies, which is where 66 of pg-common.ts's 81 tables live.
func eachVariableDeclaration(sourceFile *ast.SourceFile, visit func(decl *ast.Node)) {
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if ast.IsVariableDeclaration(node) {
			visit(node)
		}
		node.ForEachChild(walk)
		return false
	}
	sourceFile.AsNode().ForEachChild(walk)
}

// isBarrierCall reports whether a call stops the recorder rewrite reaching into its arguments: a call
// to an identifier that is NOT one of our migrated helpers, so `eq(users.cityId, 1)` inside a view's
// sql keeps drizzle's column. Method calls are transparent: those are the recorder's modifier chains.
func (file *fileRun) isBarrierCall(node *ast.Node) bool {
	if !ast.IsCallExpression(node) {
		return false
	}
	callee := node.AsCallExpression().Expression
	if callee == nil || !ast.IsIdentifier(callee) {
		return false
	}
	module := tsimports.ModuleOfImport(file.checker, callee)
	if module == "" {
		// A local function is transparent: it has no opinion about which half its arguments bind.
		return false
	}
	rule := file.importMap.RuleFor(module)
	if rule == nil {
		// A module we do not map (a driver, drizzle-orm/neon) is drizzle's, so its arguments stay drizzle.
		return true
	}
	return !rule.Migrates(tsimports.ImportedNameOf(file.checker, callee))
}

// isPropertyName reports whether an identifier is the member half of a property access, which binds nothing.
func isPropertyName(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return false
	}
	if ast.IsPropertyAccessExpression(parent) {
		return parent.AsPropertyAccessExpression().Name() == node
	}
	if ast.IsPropertyAssignment(parent) {
		return parent.Name() == node
	}
	return false
}

// declaredSymbol resolves a declaration's own name to its symbol.
func declaredSymbol(typeChecker *checker.Checker, decl *ast.Node) *ast.Symbol {
	name := decl.Name()
	if name == nil || !ast.IsIdentifier(name) {
		return nil
	}
	return typeChecker.GetSymbolAtLocation(name)
}

// IsClassified reports whether an export name has a decision here; exported for the vocabulary gate.
func IsClassified(name string) bool {
	if _, ok := declKinds[name]; ok {
		return true
	}
	if _, ok := notDeclarable[name]; ok {
		return true
	}
	return tableCreators[name]
}
