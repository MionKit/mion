// recognize.go — which declarations become a recorder/drizzle pair, and why.
//
// A declaration qualifies when the HEAD of its initializer chain is a migrated
// authoring call. The head is found by walking the chain inwards, so
// `pgTable(…).enableRLS()`, `pgSchema('s').table(…)` and
// `mySchema.table(…)` all resolve to the same question: what does the innermost
// identifier bind?
//
// Everything is keyed by SYMBOL, never by name, because drizzle's own suites
// shadow the imports on purpose:
//
//	const pgTable = pgTableCreator((name) => `prefixed_${name}`);
//	const users = pgTable('users', { id: serial('id').primaryKey() });
//
// Here the second `pgTable` is the local creator, not the import. Resolving the
// symbol gets that right; matching the text would split the creator itself and
// then miss the table.
package drizzlemigrate

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/tsimports"
)

// declKinds maps a migrated authoring function onto the binding suffix its
// declaration gets. Only functions that declare a HANDLE are here: a column
// builder, a constraint or `sql` produces a value that only ever lives inside
// one of these, so a declaration headed by one is left alone.
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
	// An INDEX is the one entry drizzle's QUERY side takes directly: mysql's
	// `.useIndex(idx)` wants drizzle's own IndexBuilder while the table's
	// extraConfig wants the recorder. Splitting it gives the file both, the same
	// way splitting a table does — and without it every index-hint test has to be
	// skipped.
	"index":       "index",
	"uniqueIndex": "index",
}

// notDeclarable are the migrated exports that produce a value which only ever
// lives INSIDE one of the declarations above — a constraint handed to an
// extraConfig callback, a column builder, `sql`. A declaration headed by one is
// left exactly as written.
//
// Together with declKinds and tableCreators this classifies EVERY migrated
// export, which is what TestEveryMigratedExportIsClassified holds the arm to: a
// drizzle upgrade that adds an export lands here as an unclassified name and
// fails that test, rather than silently doing nothing. Which bucket a new
// export belongs in is a judgement (an index splits so `.useIndex(idx)` can
// reach drizzle's builder; a foreign key never needs to), so it stays written
// down rather than derived from the manifests' `handles`.
var notDeclarable = map[string]string{
	"check":         "a constraint, only valid inside an extraConfig callback",
	"foreignKey":    "a constraint, only valid inside an extraConfig callback",
	"primaryKey":    "a constraint, only valid inside an extraConfig callback",
	"unique":        "a constraint, only valid inside an extraConfig callback",
	"customType":    "returns a column BUILDER, so its calls are columns, never declarations",
	"sql":           "a value, only valid inside a recorder call",
	"tableFromType": "the type road's bridge; a migrated schema never calls it",
}

// tableCreators build a table FACTORY, not a table: `const t = pgTableCreator(fn)`
// binds a function whose calls declare recorder tables. The creator declaration
// is never split (toDrizzle takes a table, not a factory); its calls are.
var tableCreators = map[string]bool{"pgTableCreator": true, "mysqlTableCreator": true, "sqliteTableCreator": true}

// handleMethods are the methods a recorder handle exposes that produce another
// declarable handle (`mySchema.table('users', …)`), with the kind each yields.
var handleMethods = map[string]string{"table": "table", "view": "view", "materializedView": "view"}

// chainLink is one call in an initializer's chain: the method or function name
// invoked and how many arguments it took.
type chainLink struct {
	name string
	argc int
}

// callChain is an initializer decomposed: the innermost identifier plus the
// calls applied to it, innermost first.
type callChain struct {
	head *ast.Node
	// headIsCallee marks that the innermost call's callee IS head (a function
	// call), as opposed to head being a value the chain reads from
	// (`mySchema.table(…)`).
	headIsCallee bool
	links        []chainLink
}

// decompose walks an initializer inwards. Returns nil for any shape that is not
// an identifier with calls applied — a literal, an object, a `new`, an await.
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

// headOrigin classifies a chain's head. fn is the migrated export name for an
// import origin, empty otherwise.
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
	// A NAMESPACE head reads its function off the chain instead of from its own
	// name: `Driz.pgTable(...)` is the same declaration as `pgTable(...)`, just
	// spelled through the module object.
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

// classify decides what one variable declaration becomes. It returns the kind
// and the arity of the call that named the handle (the view-arity rule reads
// it), or a diagnostic when the shape is recognisably ours but unsupported.
func (file *fileRun) classify(chain *callChain, decl *ast.Node) (kind string, argc int, creator bool, diag *Diagnostic) {
	source, fn, _ := file.headOrigin(chain)
	if source == originNone {
		return "", 0, false, nil
	}
	// A method later in the chain wins: `pgSchema('s').table('t', {…})` declares
	// a table even though its head declares a schema.
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
		// `Driz.pgTable('users', …)`: the chain's first link IS the call, so the
		// method scan above must not read it as a handle method.
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
		// Only the bare factory binding registers; anything applied to it
		// (`pgTableCreator(fn)('users', …)`) is a table we cannot name cleanly.
		if len(chain.links) != 1 {
			return "", 0, false, file.refuse(CodeUnsupportedHead, decl,
				"a table factory used inline has no name to split; bind `"+fn+"(...)` to a const first")
		}
		return "", 0, true, nil
	}
	handleKind, ok := declKinds[fn]
	if !ok {
		// A migrated helper (column builder, constraint, `sql`) bound to a
		// const. It stays as written: the binding already holds a recorder and
		// is only ever read inside one of the handles above.
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
	// nameNode is the declared identifier (edit A renames it); stmt is the whole
	// variable statement (edit B inserts the drizzle half after it).
	nameNode *ast.Node
	stmt     *ast.Node
	// initStart/initEnd bound the initializer, the region where references flip
	// to their recorder binding.
	initStart int
	initEnd   int
}

// singleDeclarationStatement returns the variable statement a declaration is the
// ONLY declarator of, or nil. A multi-declarator statement has no clean place to
// insert the drizzle half, and drizzle's suites never write one.
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

// eachVariableDeclaration visits every variable declaration in the file, in
// source order — top level AND inside test bodies, which is where 66 of
// pg-common.ts's 81 tables live.
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

// isBarrierCall reports whether a call stops the recorder rewrite from reaching
// into its arguments: a call to an identifier that is NOT one of our migrated
// helpers. `eq(users.cityId, 1)` inside a view's sql is the case that matters —
// drizzle's operator needs drizzle's column, so the reference must stay drizzle.
// Method calls (a property-access callee) are transparent: those are the
// recorder's own modifier chains.
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
		// A local function (a test helper, a table factory) is transparent: it
		// has no opinion about which half its arguments should bind.
		return false
	}
	rule := file.importMap.RuleFor(module)
	if rule == nil {
		// An import from a module we do not map (drizzle-orm/neon's crudPolicy,
		// a driver) — treat as drizzle's, so its arguments stay drizzle.
		return true
	}
	return !rule.Migrates(tsimports.ImportedNameOf(file.checker, callee))
}

// isPropertyName reports whether an identifier is the member half of a property
// access (`users.id`), which never binds anything.
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

// IsClassified reports whether an export name has a decision recorded in this
// file. Exported for the arm's own vocabulary gate.
func IsClassified(name string) bool {
	if _, ok := declKinds[name]; ok {
		return true
	}
	if _, ok := notDeclarable[name]; ok {
		return true
	}
	return tableCreators[name]
}
