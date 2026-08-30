// Package drizzlemigrate is the source-rewriting arm behind the `ts-runtypes
// drizzle-migrate` CLI verb: it moves a file authored against drizzle-orm onto
// the slim @mionjs/drizzle-orm-* packages, leaving every query untouched.
//
// The shape of the rewrite, and why it is safe:
//
//	// before
//	const users = pgTable('users', {id: uuid().primaryKey()});
//	// after
//	const users$table = pgTable('users', {id: uuid().primaryKey()});
//	const users = toDrizzle(users$table);
//
// The ORIGINAL name keeps binding the real drizzle table, so `db.select().from(users)`,
// `getTableConfig(users)`, `eq(users.id, x)` and `relations(users, …)` all still
// work with zero edits. A fresh `$<kind>` binding holds the recorder, and only
// references INSIDE a recorder call flip to it, because those are the ones that
// must be recorded rather than queried.
//
// It REWRITES, it never re-prints. The table call's text is kept byte-for-byte,
// which is what keeps this arm small: it never has to understand a column, a
// modifier chain or an extraConfig entry, so a construct it does not know about
// simply rides through. That is the opposite trade from internal/convert, which
// has to spell a table in the other authoring form and refuses whenever it
// cannot.
//
// What it refuses is listed by the DRZ codes below. A refusal leaves the file
// valid drizzle, so the suite still runs and the skip list can name the test.
package drizzlemigrate

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/tsimports"
)

// Severity of a migration diagnostic. Errors leave the declaration untouched and
// make the CLI exit non-zero; warnings note something worth reading.
type Severity int

const (
	SeverityError   Severity = 1
	SeverityWarning Severity = 2
)

// Diagnostic codes (DRZ family), alongside internal/convert's CNV ones.
const (
	// A view built from a query builder: `pgView('v').as(qb => qb.select()…)`.
	// Its columns come from drizzle's select typing, the exact generic chain the
	// slim design removes, so it stays drizzle by design
	// (packages/drizzle-orm/CLAUDE.md records the exception).
	CodeQueryBuilderView = "DRZ001"
	// A declaration whose head is ours but whose shape has no clean split.
	CodeUnsupportedHead = "DRZ002"
	// No free name for a binding the rewrite has to add.
	CodeNameCollision = "DRZ003"
)

// Diagnostic is one per-declaration finding.
type Diagnostic struct {
	Code     string   `json:"code"`
	Severity Severity `json:"severity"`
	File     string   `json:"file"`
	Decl     string   `json:"decl,omitempty"`
	Message  string   `json:"message"`
	Line     int      `json:"line,omitempty"`
}

// Options selects what a run does.
type Options struct{}

// FileResult is the outcome of migrating one file.
type FileResult struct {
	Path    string       `json:"path"`
	Output  string       `json:"-"`
	Changed bool         `json:"changed"`
	Diags   []Diagnostic `json:"diagnostics,omitempty"`
	// Used lists the migrated manifest entries this file actually rewrote onto
	// our packages, per dialect. The lane's coverage gate crosses it against the
	// manifests, so a builder no vendored suite exercises is caught.
	Used map[string][]string `json:"used,omitempty"`
}

// fileRun is the per-file state the recognition and rewriting passes share.
type fileRun struct {
	path       string
	source     string
	sourceFile *ast.SourceFile
	checker    *checker.Checker
	importMap  *ImportMap
	imports    *tsimports.Scan

	// creators maps a local table-factory symbol to its dialect; splitBySymbol
	// maps an already-split declaration's symbol to its pair.
	creators      map[*ast.Symbol]string
	splitBySymbol map[*ast.Symbol]*splitDecl
	splits        []*splitDecl
	// regions are the spans where a reference must be RECORDED rather than
	// queried: every split declaration's initializer plus every table factory's.
	regions [][2]int
	// refs is every identifier the rewrite may touch, collected before any
	// decision is made (a binding's fate depends on ALL its uses).
	refs []reference
	// movedLocal is the local a migrated export arrives under, and keepDrizzle
	// marks the ones whose drizzle binding must ALSO stay. Keyed module:local.
	movedLocal map[string]string
	// namespaceLocal is the alias a `import * as X` object is re-imported under
	// from the slim package, keyed the same way.
	namespaceLocal map[string]string
	keepDrizzle    map[string]bool

	// taken guards every name the rewrite invents.
	taken map[string]bool
	// toDrizzleByDialect is the local toDrizzle is imported under per dialect,
	// claimed on first use.
	toDrizzleByDialect map[string]string
	// used records the migrated exports that actually reached a recorder.
	used map[string]map[string]bool

	diags []Diagnostic
	edits []edit
}

// edit is one span replacement over the original source, in byte offsets.
type edit struct {
	start int
	end   int
	text  string
}

// refuse builds an error diagnostic for a declaration.
func (file *fileRun) refuse(code string, decl *ast.Node, message string) *Diagnostic {
	name := ""
	if decl != nil {
		if nameNode := decl.Name(); nameNode != nil {
			name = nameNode.Text()
		}
	}
	line := 0
	if decl != nil {
		line = 1 + strings.Count(file.source[:min(decl.Pos(), len(file.source))], "\n")
	}
	return &Diagnostic{Code: code, Severity: SeverityError, File: file.path, Decl: name, Message: message, Line: line}
}

// claim returns base, or a digit-suffixed variant, registering the result; ""
// when nothing is free.
func (file *fileRun) claim(base string) string {
	if !file.taken[base] {
		file.taken[base] = true
		return base
	}
	for suffix := 2; suffix <= 9; suffix++ {
		candidate := fmt.Sprintf("%s%d", base, suffix)
		if !file.taken[candidate] {
			file.taken[candidate] = true
			return candidate
		}
	}
	return ""
}

// recorderBase drops a trailing spelling of the kind from the original name
// before the `$<kind>` marker is appended, so `usersTable` becomes `users$table`
// rather than `usersTable$table`. Case-insensitive because both `usersTable` and
// `userstable` are spellings people write; a name that is nothing BUT the kind
// (`table`) keeps it, since an empty base is no name at all.
func recorderBase(name, kind string) string {
	if len(name) <= len(kind) {
		return name
	}
	if !strings.EqualFold(name[len(name)-len(kind):], kind) {
		return name
	}
	return name[:len(name)-len(kind)]
}

// scopedName is the recorder binding for a declaration. It is NOT claimed
// file-wide: the pair lives in the declaration's own scope, and drizzle's suites
// declare `const users = pgTable(…)` inside 20 different test bodies, each of
// which wants the same `users$table` spelling. A collision is only possible
// against a name the SOURCE already spells, which the taken set covers.
func (file *fileRun) scopedName(base string) string {
	if !file.taken[base] {
		return base
	}
	return file.claim(base)
}

// noteUsed records that a migrated export reached a recorder position.
func (file *fileRun) noteUsed(dialect, fn string) {
	if dialect == "" || fn == "" {
		return
	}
	if file.used[dialect] == nil {
		file.used[dialect] = map[string]bool{}
	}
	file.used[dialect][fn] = true
}

// MigrateFile rewrites one source file onto the slim packages and returns the new
// source. A file with nothing to migrate comes back unchanged and undiagnosed.
func MigrateFile(prog *program.Program, typeChecker *checker.Checker, absPath string, _ Options) (*FileResult, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("drizzle-migrate: source file not in program: %s", absPath)
	}
	importMap, mapErr := LoadImportMap()
	if mapErr != nil {
		return nil, mapErr
	}
	source := sourceFile.Text()
	file := &fileRun{
		path:           absPath,
		source:         source,
		sourceFile:     sourceFile,
		checker:        typeChecker,
		importMap:      importMap,
		imports:        tsimports.ScanFile(sourceFile, nil),
		creators:       map[*ast.Symbol]string{},
		splitBySymbol:  map[*ast.Symbol]*splitDecl{},
		taken:          map[string]bool{},
		used:           map[string]map[string]bool{},
		movedLocal:     map[string]string{},
		namespaceLocal: map[string]string{},
		keepDrizzle:    map[string]bool{},
	}
	file.seedTakenNames()

	// Nothing to do unless the file imports a module we map. Checked before the
	// walk so a run over a whole tree costs nothing on unrelated files.
	if !file.importsAnyMappedModule() {
		return &FileResult{Path: absPath, Output: source}, nil
	}
	file.collectSplits()
	file.collectReferences()
	file.decideBindings()
	file.planReferenceEdits()
	file.planDeclarationEdits()
	if diag := file.planImportEdits(); diag != nil {
		file.diags = append(file.diags, *diag)
	}

	result := &FileResult{Path: absPath, Output: source, Diags: file.diags, Used: SortUsed(file.used)}
	if len(file.edits) == 0 {
		return result, nil
	}
	output, applyErr := applyEdits(source, file.edits)
	if applyErr != nil {
		return nil, fmt.Errorf("drizzle-migrate %s: %w", absPath, applyErr)
	}
	if output != source {
		result.Output = output
		result.Changed = true
	}
	return result, nil
}

// seedTakenNames registers every identifier the file already spells, so an
// invented binding (`users$table`, `toDrizzle`, `rtSql`) can never shadow one.
func (file *fileRun) seedTakenNames() {
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if ast.IsIdentifier(node) {
			file.taken[node.Text()] = true
		}
		node.ForEachChild(walk)
		return false
	}
	file.sourceFile.AsNode().ForEachChild(walk)
}

func (file *fileRun) importsAnyMappedModule() bool {
	for module := range file.imports.ByModule {
		if file.importMap.RuleFor(module) != nil {
			return true
		}
	}
	return false
}

// collectSplits walks the file in source order, deciding what each declaration
// becomes. Order matters: a schema declared earlier is what makes
// `mySchema.table(…)` recognisable later.
func (file *fileRun) collectSplits() {
	eachVariableDeclaration(file.sourceFile, func(decl *ast.Node) {
		initializer := decl.Initializer()
		if initializer == nil {
			return
		}
		chain := decompose(initializer)
		if chain == nil || chain.head == nil {
			return
		}
		source, fn, dialect := file.headOrigin(chain)
		if source == originNone {
			return
		}
		kind, argc, isCreator, diag := file.classify(chain, decl)
		if diag != nil {
			file.diags = append(file.diags, *diag)
			return
		}
		if source == originImport {
			file.noteUsed(dialect, fn)
		}
		if isCreator {
			if symbol := declaredSymbol(file.checker, decl); symbol != nil {
				file.creators[symbol] = dialect
			}
			// A factory's own call records too, so its initializer is a recorder
			// region even though the declaration is never split.
			file.regions = append(file.regions, [2]int{initializer.Pos(), initializer.End()})
			return
		}
		if kind == "" {
			// A migrated helper bound to a const — an index, a constraint, a
			// bare column builder. The binding already holds a recorder, so the
			// declaration stays as written, but its initializer IS a recorder
			// region: mysql-common.ts declares an index AFTER the table it
			// indexes and hands it to a lazy extraConfig, so `users.name` in
			// there has to mean the recorder's column.
			if source == originImport {
				file.regions = append(file.regions, [2]int{initializer.Pos(), initializer.End()})
			}
			return
		}
		// The boundary exception: a view with no explicit columns is built from
		// a query builder, so it stays drizzle and its test goes on the skip
		// list.
		if kind == "view" && argc < 2 {
			file.diags = append(file.diags, *file.refuse(CodeQueryBuilderView, decl,
				"a view built from a query builder stays on drizzle: its columns come from drizzle's select typing. Declare the columns explicitly to migrate it."))
			return
		}
		nameNode := decl.Name()
		if nameNode == nil || !ast.IsIdentifier(nameNode) {
			return
		}
		statement := singleDeclarationStatement(decl)
		if statement == nil {
			file.diags = append(file.diags, *file.refuse(CodeUnsupportedHead, decl,
				"only a single-declarator `const x = …` statement can be split into a recorder and its drizzle half"))
			return
		}
		recorder := file.scopedName(recorderBase(nameNode.Text(), kind) + "$" + kind)
		if recorder == "" {
			file.diags = append(file.diags, *file.refuse(CodeNameCollision, decl,
				"no free name for the recorder binding of "+nameNode.Text()))
			return
		}
		split := &splitDecl{
			name: nameNode.Text(), recorder: recorder, kind: kind, dialect: dialect,
			nameNode: nameNode, stmt: statement,
			initStart: initializer.Pos(), initEnd: initializer.End(),
		}
		file.splits = append(file.splits, split)
		file.regions = append(file.regions, [2]int{split.initStart, split.initEnd})
		if symbol := declaredSymbol(file.checker, decl); symbol != nil {
			file.splitBySymbol[symbol] = split
		}
	})
}

// enclosingSplit returns the split declaration whose initializer contains pos.
func (file *fileRun) enclosingSplit(pos int) *splitDecl {
	for _, split := range file.splits {
		if pos >= split.initStart && pos < split.initEnd {
			return split
		}
	}
	return nil
}

// inRecorderRegion reports whether pos sits inside a span where references are
// recorded: a split declaration's initializer, or a table factory's.
func (file *fileRun) inRecorderRegion(pos int) bool {
	for _, region := range file.regions {
		if pos >= region[0] && pos < region[1] {
			return true
		}
	}
	return false
}

// reference is one identifier the rewrite may touch, with everything the
// decision needs: whether a recorder call reaches it, and what it resolves to.
type reference struct {
	node  *ast.Node
	inner bool
	// split is set when the identifier binds a declaration this run split.
	split *splitDecl
	// rule and imported are set when it binds a migrated drizzle export.
	rule     *ModuleRule
	imported string
	// namespace marks `Driz.pgTable`: the node is the module OBJECT, and
	// `imported` is the member reached through it.
	namespace bool
}

// namespaceMember is the member name a namespace object is being read for, or
// "" when the object is used on its own.
func namespaceMember(node *ast.Node) string {
	parent := node.Parent
	if parent == nil || !ast.IsPropertyAccessExpression(parent) {
		return ""
	}
	access := parent.AsPropertyAccessExpression()
	if access.Expression != node {
		return ""
	}
	return access.Name().Text()
}

// bindingKey names one BINDING, not one export: a file may import the same export
// twice under different locals, and pg-common.ts does exactly that
// (`uuid, …, uuid as pgUuid`). Each local is decided on its own.
func bindingKey(module, local string) string { return module + ":" + local }

// collectReferences walks every identifier and records what it resolves to and
// whether a recorder call reaches it. Nothing is decided here: a binding's fate
// depends on ALL of its uses, and drizzle's suites use `sql` on both sides of the
// boundary in the same file.
//
// "A recorder call reaches it" stops at a barrier — a call to a drizzle function
// that did not migrate. That is what keeps `eq(users.cityId, 1)` inside a view's
// sql pointing at drizzle's column while `foreignKey({foreignColumns: [users.id]})`
// in the same file points at ours.
func (file *fileRun) collectReferences() {
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if ast.IsIdentifier(node) && !isPropertyName(node) && !file.inImportStatement(node.Pos()) {
			file.collectReference(node)
		}
		node.ForEachChild(walk)
		return false
	}
	file.sourceFile.AsNode().ForEachChild(walk)
}

func (file *fileRun) collectReference(node *ast.Node) {
	ref := reference{node: node, inner: file.inRecorderRegion(node.Pos()) && !file.behindBarrier(node)}
	if symbol := file.checker.GetSymbolAtLocation(node); symbol != nil {
		if target, ok := file.splitBySymbol[symbol]; ok {
			// The declared name itself is renamed by its own edit, never here.
			if target.nameNode == node {
				return
			}
			ref.split = target
			file.refs = append(file.refs, ref)
			return
		}
	}
	rule := file.importMap.RuleFor(tsimports.ModuleOfImport(file.checker, node))
	if rule == nil {
		return
	}
	// A NAMESPACE object is decided by the MEMBER being reached through it, so
	// `Driz.pgTable` is decided by `pgTable`. What gets rewritten is the object
	// itself, to an alias of the slim package.
	if tsimports.IsNamespaceImport(file.checker, node) {
		member := namespaceMember(node)
		if member == "" || !rule.Migrates(member) {
			return
		}
		ref.rule, ref.imported, ref.namespace = rule, member, true
		if ref.inner {
			file.noteUsed(rule.Dialect, member)
		}
		file.refs = append(file.refs, ref)
		return
	}
	imported := tsimports.ImportedNameOf(file.checker, node)
	if !rule.Migrates(imported) {
		return
	}
	ref.rule, ref.imported = rule, imported
	if ref.inner {
		file.noteUsed(rule.Dialect, imported)
	}
	file.refs = append(file.refs, ref)
}

// behindBarrier walks out to the enclosing recorder region, reporting whether a
// drizzle call sits in between.
func (file *fileRun) behindBarrier(node *ast.Node) bool {
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		if file.isBarrierCall(parent) {
			return true
		}
		if !file.inRecorderRegion(parent.Pos()) {
			return false
		}
	}
	return false
}

// decideBindings settles, per migrated export, which side it lives on:
//
//	inner uses only  -> it MOVES, under its own local
//	outer uses only  -> it STAYS on drizzle, untouched
//	both             -> it stays AND arrives under a second local, and the inner
//	                    references are rewritten to that one
//
// The both case is not a corner: drizzle's own suites write `db.execute(sql`…`)`
// beside `.default(sql`now()`)`, and a query-builder view this arm refuses sits in
// the same file as ones it migrates.
func (file *fileRun) decideBindings() {
	inner := map[string]bool{}
	outer := map[string]bool{}
	original := map[string]string{}
	importedOf := map[string]string{}
	ruleOf := map[string]*ModuleRule{}
	namespaceKeys := map[string]bool{}
	for _, ref := range file.refs {
		if ref.rule == nil {
			continue
		}
		// A namespace object is ONE binding however many members go through it, so
		// its key is the object's own local; a named import is keyed by its local
		// too. Either way: one key, one decision.
		key := bindingKey(ref.rule.From, ref.node.Text())
		original[key] = ref.node.Text()
		importedOf[key] = ref.imported
		ruleOf[key] = ref.rule
		if ref.namespace {
			namespaceKeys[key] = true
		}
		if ref.inner {
			inner[key] = true
		} else {
			outer[key] = true
		}
	}
	for key := range inner {
		rule, imported := ruleOf[key], importedOf[key]
		// A namespace ALWAYS gets a second alias: drizzle's own object stays for
		// the members that did not migrate, and ours carries the ones that did.
		if namespaceKeys[key] {
			file.namespaceLocal[key] = file.claim("rt" + upperFirst(original[key]))
			file.keepDrizzle[key] = true
			continue
		}
		if alias, ok := rule.Alias[imported]; ok {
			file.movedLocal[key] = file.claim(alias)
		} else if outer[key] {
			file.movedLocal[key] = file.claim("rt" + upperFirst(imported))
		} else {
			file.movedLocal[key] = original[key]
		}
		file.keepDrizzle[key] = outer[key]
	}
	// A migrated export with no inner use at all never moves.
	for key := range outer {
		if !inner[key] {
			file.keepDrizzle[key] = true
		}
	}
}

// planReferenceEdits emits the identifier rewrites the decisions imply.
func (file *fileRun) planReferenceEdits() {
	for _, ref := range file.refs {
		if !ref.inner {
			continue
		}
		if ref.split != nil {
			file.replaceIdentifier(ref.node, ref.split.recorder)
			continue
		}
		key := bindingKey(ref.rule.From, ref.node.Text())
		local := file.movedLocal[key]
		if ref.namespace {
			local = file.namespaceLocal[key]
		}
		if local != "" && local != ref.node.Text() {
			file.replaceIdentifier(ref.node, local)
		}
	}
}

// replaceIdentifier swaps one identifier, starting at its first real character —
// a node's Pos() includes the leading trivia, so replacing from there would eat
// the space before it.
func (file *fileRun) replaceIdentifier(node *ast.Node, text string) {
	file.edits = append(file.edits, edit{start: tsimports.TokenStart(file.source, node.Pos()), end: node.End(), text: text})
}

// planDeclarationEdits emits the two edits per split: rename the declared name to
// the recorder binding, then add the drizzle half right after the statement.
// Both sit OUTSIDE the initializer, so the table call's text is untouched and the
// reference rewrites above compose with them.
func (file *fileRun) planDeclarationEdits() {
	for _, split := range file.splits {
		toDrizzle := file.toDrizzleLocal(split.dialect)
		if toDrizzle == "" {
			continue
		}
		file.replaceIdentifier(split.nameNode, split.recorder)
		indent := lineIndent(file.source, tsimports.TokenStart(file.source, split.stmt.Pos()))
		exported := ""
		if isExported(split.stmt) {
			exported = "export "
		}
		pair := fmt.Sprintf("\n%s%sconst %s = %s(%s);", indent, exported, split.name, toDrizzle, split.recorder)
		file.edits = append(file.edits, edit{start: split.stmt.End(), end: split.stmt.End(), text: pair})
	}
}

func (file *fileRun) inImportStatement(pos int) bool {
	for _, entry := range file.imports.ByModule {
		for _, statement := range entry.AllStatements() {
			if pos >= statement.Node.Pos() && pos < statement.Node.End() {
				return true
			}
		}
	}
	return false
}

// lineIndent returns the whitespace opening the line that start sits on.
func lineIndent(source string, start int) string {
	lineStart := strings.LastIndexByte(source[:start], '\n') + 1
	return source[lineStart:start]
}

func isExported(statement *ast.Node) bool {
	modifiers := statement.Modifiers()
	if modifiers == nil {
		return false
	}
	for _, modifier := range modifiers.Nodes {
		if modifier.Kind == ast.KindExportKeyword {
			return true
		}
	}
	return false
}

// SortUsed flattens a per-dialect used-set into sorted lists, for the report.
func SortUsed(used map[string]map[string]bool) map[string][]string {
	if len(used) == 0 {
		return nil
	}
	out := map[string][]string{}
	for dialect, names := range used {
		list := make([]string, 0, len(names))
		for name := range names {
			list = append(list, name)
		}
		sort.Strings(list)
		out[dialect] = list
	}
	return out
}

// applyEdits splices sorted, non-overlapping edits into source.
func applyEdits(source string, edits []edit) (string, error) {
	sorted := make([]edit, len(edits))
	copy(sorted, edits)
	sort.SliceStable(sorted, func(a, b int) bool {
		if sorted[a].start != sorted[b].start {
			return sorted[a].start < sorted[b].start
		}
		return sorted[a].end < sorted[b].end
	})
	var out strings.Builder
	cursor := 0
	for _, item := range sorted {
		if item.start < cursor || item.end < item.start || item.end > len(source) {
			return "", fmt.Errorf("overlapping or out-of-range edit [%d,%d)", item.start, item.end)
		}
		out.WriteString(source[cursor:item.start])
		out.WriteString(item.text)
		cursor = item.end
	}
	out.WriteString(source[cursor:])
	return out.String(), nil
}
