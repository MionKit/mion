// set.go — the conversion run's SET-WIDE context. A run converts one or many
// files together; declarations reference each other across the whole set, so
// before any file is printed the run builds one table of every convertible
// declaration's structural id → its reference spelling. Printers use it to
// keep authored references as references (`type A = {b: B}` stays `B` in
// every target) instead of inlining, and to close cycles: a back-edge to the
// declaration being printed becomes `RT.self()` / `{$ref: '#'}` / the type's
// own name. References to convertible declarations OUTSIDE the set are an
// error (CNV004) — the user decided conversion never silently inlines what
// another file still spells by name.
package convert

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// RefTarget is how one converted declaration can be referenced from another
// declaration's printed output. Only declarations with a TYPE name are
// reference targets — the alias survives every target form (builders / schema
// outputs keep the `InferType` alias), so a name reference can never break.
// Exported is the ALIAS's export modifier: a cross-file reference has to
// import the type name, which only works when the declaring file exports it.
type RefTarget struct {
	TypeName  string
	ConstName string
	File      string
	Exported  bool
}

// Set is the run-wide conversion context: the files converted together and
// the declaration-id reference table across all of them. It also memoizes
// recognition and the const-reference index — a run recognizes each file
// once and walks the program for const uses once, instead of re-doing both
// per candidate declaration inside the const-away fixpoint.
type Set struct {
	Files map[string]bool
	Table map[string]RefTarget

	// The program the set was built over — the index and memo below read it.
	prog       *program.Program
	checker    *checker.Checker
	markerOpts marker.Options
	// declsByFile memoizes recognizeFile per in-set file (keyed the way the
	// checker names files, which is how set.Files is keyed too).
	declsByFile map[string][]*declaration
	// constUses maps each in-set const declaration's symbol to every use
	// position across the whole program (import specifiers excluded — they
	// re-bind, real uses resolve the symbol at their own position). Built
	// lazily by constUseIndex on the first const-away check.
	constUses map[*ast.Symbol][]constUse
	// candidateSpans caches, per target, the statement spans each in-set
	// file's own conversion would rewrite — the spans whose const uses do
	// not keep a const alive (each file applies the same safety check to
	// itself). Built lazily by candidateSpansFor.
	candidateSpans map[Target]map[string][][2]int
}

// constUse is one identifier use of an in-set const: the file the checker
// names and the node position, comparable against statement spans.
type constUse struct {
	file string
	pos  int
}

// BuildSet recognizes and resolves every file's declarations once, up front,
// so each file's conversion can reference the others.
func BuildSet(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, absFiles []string) (*Set, error) {
	set := &Set{Files: map[string]bool{}, Table: map[string]RefTarget{},
		prog: prog, checker: typeChecker, markerOpts: markerOpts, declsByFile: map[string][]*declaration{}}
	for _, absPath := range absFiles {
		set.Files[absPath] = true
	}
	for _, absPath := range absFiles {
		sourceFile := prog.SourceFile(absPath)
		if sourceFile == nil {
			return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
		}
		decls := recognizeFile(sourceFile, typeChecker, markerOpts)
		set.declsByFile[absPath] = decls
		for _, decl := range decls {
			if decl.Generic || decl.Name == "" || decl.Drizzle {
				// Generic declarations have no reference spelling; alias-less
				// consts have no type name that survives conversion — both
				// inline structurally where referenced. Drizzle tables never
				// join the reference table: their type id moves with the road.
				continue
			}
			resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
			if resolveErr != nil {
				return nil, resolveErr
			}
			// First declaration wins on a structural-id collision: same id =
			// same type, so either name is an exact reference.
			if _, exists := set.Table[resolved.Node.ID]; !exists {
				set.Table[resolved.Node.ID] = RefTarget{TypeName: decl.Name, ConstName: decl.ConstName, File: absPath, Exported: decl.AliasExported}
			}
		}
	}
	return set, nil
}

// declsFor returns the memoized recognition for an in-set file, recognizing
// on the spot for a file outside the memo (defensive — ConvertFile is only
// ever handed set files).
func (set *Set) declsFor(sourceFile *ast.SourceFile, absPath string, typeChecker *checker.Checker, markerOpts marker.Options) []*declaration {
	if decls, memoized := set.declsByFile[absPath]; memoized {
		return decls
	}
	return recognizeFile(sourceFile, typeChecker, markerOpts)
}

// constUseIndex builds (once) the program-wide use index of every in-set
// const declaration: one walk over every source file, recording each
// identifier that resolves (through import aliases) to one of the candidate
// const symbols. The const-away safety check used to run this walk per
// candidate const, per fixpoint iteration.
func (set *Set) constUseIndex() map[*ast.Symbol][]constUse {
	if set.constUses != nil {
		return set.constUses
	}
	set.constUses = map[*ast.Symbol][]constUse{}
	candidates := map[*ast.Symbol]bool{}
	names := map[string]bool{}
	for _, decls := range set.declsByFile {
		for _, decl := range decls {
			if decl.ConstName == "" {
				continue
			}
			if symbol := set.checker.GetSymbolAtLocation(constNameNode(decl)); symbol != nil {
				candidates[symbol] = true
				names[decl.ConstName] = true
			}
		}
	}
	if len(candidates) == 0 {
		return set.constUses
	}
	for _, sourceFile := range set.prog.TS.SourceFiles() {
		path := sourceFile.FileName()
		if strings.Contains(path, "/node_modules/") || strings.HasPrefix(path, "bundled://") {
			continue
		}
		var walk func(node *ast.Node) bool
		walk = func(node *ast.Node) bool {
			if node == nil {
				return false
			}
			if ast.IsIdentifier(node) && names[node.Text()] {
				if symbol := set.checker.GetSymbolAtLocation(node); symbol != nil {
					if resolved := checker.SkipAlias(symbol, set.checker); resolved != nil && candidates[resolved] {
						// Import specifiers re-binding the const don't count as
						// uses on their own; real uses resolve the same symbol
						// at their own position.
						if node.Parent == nil || !ast.IsImportSpecifier(node.Parent) {
							set.constUses[resolved] = append(set.constUses[resolved], constUse{file: path, pos: node.Pos()})
						}
					}
				}
			}
			node.ForEachChild(walk)
			return false
		}
		sourceFile.AsNode().ForEachChild(walk)
	}
	return set.constUses
}

// candidateSpansFor returns (building once per target) the statement spans
// each in-set file's own conversion would rewrite: every non-generic
// declaration not already in the target form, alias statements included.
// Const uses inside these spans do not keep a const alive — each file's own
// conversion applies the same safety check to itself.
func (set *Set) candidateSpansFor(target Target) map[string][][2]int {
	if set.candidateSpans == nil {
		set.candidateSpans = map[Target]map[string][][2]int{}
	}
	if spans, cached := set.candidateSpans[target]; cached {
		return spans
	}
	spans := map[string][][2]int{}
	for path, decls := range set.declsByFile {
		for _, other := range decls {
			if other.Generic || other.Form == target {
				continue
			}
			spans[path] = append(spans[path], [2]int{other.Stmt.Pos(), other.Stmt.End()})
			if other.AliasStmt != nil {
				spans[path] = append(spans[path], [2]int{other.AliasStmt.Pos(), other.AliasStmt.End()})
			}
		}
	}
	set.candidateSpans[target] = spans
	return spans
}

// singleFileSet is the implicit set when ConvertFile is called without one.
func singleFileSet(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, markerOpts marker.Options, absPath string) (*Set, error) {
	return BuildSet(prog, typeChecker, cache, markerOpts, []string{absPath})
}

// binding is one local name an import statement introduces, resolved to the
// declaration file and exported name it aliases.
type binding struct {
	local        string
	exportedName string
	targetFile   string
	namespace    bool
	module       string
}

// fileBindings is a file's imported-name inventory: how each foreign
// declaration is currently spellable here, and which module specifier reaches
// which file (for import additions).
type fileBindings struct {
	bindings     []binding
	moduleByFile map[string]string
}

// buildFileBindings resolves every import binding of the file through the
// checker (SkipAlias follows the import alias to the real declaration).
func buildFileBindings(sourceFile *ast.SourceFile, typeChecker *checker.Checker) *fileBindings {
	out := &fileBindings{moduleByFile: map[string]string{}}
	root := sourceFile.AsNode()
	if root == nil {
		return out
	}
	record := func(nameNode *ast.Node, module string, namespace bool) {
		if nameNode == nil {
			return
		}
		symbol := typeChecker.GetSymbolAtLocation(nameNode)
		if symbol == nil {
			return
		}
		target := checker.SkipAlias(symbol, typeChecker)
		if target == nil || len(target.Declarations) == 0 {
			return
		}
		declFile := ast.GetSourceFileOfNode(target.Declarations[0])
		if declFile == nil {
			return
		}
		entry := binding{
			local:        nameNode.Text(),
			exportedName: target.Name,
			targetFile:   declFile.FileName(),
			namespace:    namespace,
			module:       module,
		}
		if namespace {
			// A namespace import's target is the module itself; spell members
			// through it and map the module's own file for additions.
			entry.targetFile = declFile.FileName()
		}
		out.bindings = append(out.bindings, entry)
		if out.moduleByFile[entry.targetFile] == "" {
			out.moduleByFile[entry.targetFile] = module
		}
	}
	for _, statement := range root.Statements() {
		if statement == nil || !ast.IsImportDeclaration(statement) {
			continue
		}
		importDecl := statement.AsImportDeclaration()
		if importDecl == nil || importDecl.ModuleSpecifier == nil || importDecl.ImportClause == nil {
			continue
		}
		module := importDecl.ModuleSpecifier.Text()
		clause := importDecl.ImportClause.AsImportClause()
		if clause == nil {
			continue
		}
		record(clause.Name(), module, false)
		if namedBindings := clause.NamedBindings; namedBindings != nil {
			switch namedBindings.Kind {
			case ast.KindNamespaceImport:
				record(namedBindings.AsNamespaceImport().Name(), module, true)
			case ast.KindNamedImports:
				for _, element := range namedBindings.AsNamedImports().Elements.Nodes {
					record(element.Name(), module, false)
				}
			}
		}
	}
	return out
}

// spellForTarget returns how this file currently spells target's type name:
// an existing named binding's local, a namespace-qualified member, or, when
// no binding exists, the bare name plus needsImport=true (the module comes
// from moduleFor). ok=false when the file has no route to the target at all.
func (fileImports *fileBindings) spellForTarget(target RefTarget, currentFile string) (spelling string, keepLocal string, needsImport bool, ok bool) {
	if target.File == currentFile {
		return target.TypeName, "", false, true
	}
	for _, entry := range fileImports.bindings {
		if entry.namespace || entry.targetFile != target.File || entry.exportedName != target.TypeName {
			continue
		}
		return entry.local, entry.local, false, true
	}
	for _, entry := range fileImports.bindings {
		if entry.namespace && sameModuleFile(entry.targetFile, target.File) {
			return entry.local + "." + target.TypeName, entry.local, false, true
		}
	}
	if module := fileImports.moduleFor(target.File); module != "" {
		return target.TypeName, "", true, true
	}
	return "", "", false, false
}

// moduleFor returns the module specifier this file already uses to reach the
// given declaration file ("" when none of its imports resolve there).
func (fileImports *fileBindings) moduleFor(targetFile string) string {
	return fileImports.moduleByFile[targetFile]
}

// removableLocals lists the local names bound to declarations of in-set
// files — the bindings conversion may have made unused (a builders const
// import after the file switched to type form). Namespace bindings are never
// removed.
func (fileImports *fileBindings) removableLocals(set *Set) map[string]bool {
	out := map[string]bool{}
	for _, entry := range fileImports.bindings {
		if !entry.namespace && set.Files[entry.targetFile] {
			out[entry.local] = true
		}
	}
	return out
}

// sameModuleFile compares declaration files, tolerating the source-file
// normalization difference between checker paths.
func sameModuleFile(a, b string) bool {
	return a == b || strings.EqualFold(a, b)
}

// fileContext bundles one file's conversion-scoped state for the printers.
type fileContext struct {
	set      *Set
	bindings *fileBindings
	inScope  map[string]bool
	path     string
}

// inScopeNames collects every top-level name the file can reference: import
// locals plus declared classes, enums, functions, namespaces, aliases,
// interfaces and consts. Printers spelling a live symbol (an enum, a class)
// check here — the reflected name is the DECLARATION name, which an aliased
// import would not bind.
func inScopeNames(sourceFile *ast.SourceFile) map[string]bool {
	names := map[string]bool{}
	root := sourceFile.AsNode()
	if root == nil {
		return names
	}
	addName := func(nameNode *ast.Node) {
		if nameNode != nil && ast.IsIdentifier(nameNode) {
			names[nameNode.Text()] = true
		}
	}
	for _, statement := range root.Statements() {
		if statement == nil {
			continue
		}
		switch statement.Kind {
		case ast.KindImportDeclaration:
			importDecl := statement.AsImportDeclaration()
			if importDecl == nil || importDecl.ImportClause == nil {
				continue
			}
			clause := importDecl.ImportClause.AsImportClause()
			if clause == nil {
				continue
			}
			addName(clause.Name())
			if bindings := clause.NamedBindings; bindings != nil {
				switch bindings.Kind {
				case ast.KindNamespaceImport:
					addName(bindings.AsNamespaceImport().Name())
				case ast.KindNamedImports:
					for _, element := range bindings.AsNamedImports().Elements.Nodes {
						addName(element.Name())
					}
				}
			}
		case ast.KindClassDeclaration, ast.KindEnumDeclaration, ast.KindFunctionDeclaration,
			ast.KindTypeAliasDeclaration, ast.KindInterfaceDeclaration, ast.KindModuleDeclaration:
			addName(statement.Name())
		case ast.KindVariableStatement:
			variableStatement := statement.AsVariableStatement()
			if variableStatement == nil || variableStatement.DeclarationList == nil {
				continue
			}
			declarationList := variableStatement.DeclarationList.AsVariableDeclarationList()
			if declarationList == nil {
				continue
			}
			for _, declarator := range declarationList.Declarations.Nodes {
				addName(declarator.Name())
			}
		}
	}
	return names
}

// outsideSetDiags walks one declaration's ORIGINAL syntax for references to
// convertible declarations (type aliases / interfaces / RunType consts) whose
// file is a program source outside the conversion set. Conversion would have
// to inline them silently — the user decided that is an error: include the
// file in the run instead.
//
// referencedThroughPackageImport reports whether the identifier is reached via
// a BARE module specifier — either directly (`import {X} from 'pkg'`) or as the
// member of a namespace import (`TF.String`, where `TF` is the alias). A
// relative specifier returns false: that file really can be added to the run.
func referencedThroughPackageImport(typeChecker *checker.Checker, nameNode *ast.Node) bool {
	if aliasIsPackageImport(typeChecker, nameNode) {
		return true
	}
	// `TF.String` / `Temporal.PlainDate`: the identifier under test is the RIGHT
	// side, and only the LEFT one carries the import.
	parent := nameNode.Parent
	if parent == nil {
		return false
	}
	var root *ast.Node
	switch {
	case ast.IsQualifiedName(parent):
		root = parent.AsQualifiedName().Left
	case ast.IsPropertyAccessExpression(parent):
		root = parent.AsPropertyAccessExpression().Expression
	}
	for root != nil && ast.IsQualifiedName(root) {
		root = root.AsQualifiedName().Left
	}
	return root != nil && root != nameNode && ast.IsIdentifier(root) && aliasIsPackageImport(typeChecker, root)
}

// aliasIsPackageImport reports whether the identifier binds an import whose
// module specifier is a bare package name.
func aliasIsPackageImport(typeChecker *checker.Checker, nameNode *ast.Node) bool {
	symbol := typeChecker.GetSymbolAtLocation(nameNode)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 {
		return false
	}
	aliasDecl := checker.Checker_getDeclarationOfAliasSymbol(typeChecker, symbol)
	for node := aliasDecl; node != nil; node = node.Parent {
		if !ast.IsImportDeclaration(node) {
			continue
		}
		importDecl := node.AsImportDeclaration()
		if importDecl == nil || importDecl.ModuleSpecifier == nil {
			return false
		}
		specifier := importDecl.ModuleSpecifier.Text()
		return specifier != "" && !strings.HasPrefix(specifier, ".")
	}
	return false
}

func outsideSetDiags(prog *program.Program, typeChecker *checker.Checker, markerOpts marker.Options, decl *declaration, set *Set, currentFile string) []Diagnostic {
	var diags []Diagnostic
	reported := map[string]bool{}
	check := func(nameNode *ast.Node) {
		if nameNode == nil || !ast.IsIdentifier(nameNode) {
			return
		}
		symbol := typeChecker.GetSymbolAtLocation(nameNode)
		if symbol == nil {
			return
		}
		target := checker.SkipAlias(symbol, typeChecker)
		if target == nil || len(target.Declarations) == 0 {
			return
		}
		targetDecl := target.Declarations[0]
		declFile := ast.GetSourceFileOfNode(targetDecl)
		if declFile == nil {
			return
		}
		path := declFile.FileName()
		if set.Files[path] || sameModuleFile(path, currentFile) {
			return
		}
		// Only convertible sources count: declaration files (bundled libs,
		// node_modules typings) are never conversion candidates.
		if strings.HasSuffix(path, ".d.ts") || strings.Contains(path, "/node_modules/") || prog.SourceFile(path) == nil {
			return
		}
		// Nor is anything reached through a PACKAGE import. "include that file
		// in the same convert invocation" is advice a user can act on for a
		// sibling source; for `TF.String` or `FromJsonSchema` it is impossible —
		// they live in a dependency. The .ts / node_modules filters above miss
		// this whenever a package resolves to real sources (a `source` export
		// condition, a workspace link, a `paths` alias), which is exactly how
		// the marker package's own suites resolve it.
		if referencedThroughPackageImport(typeChecker, nameNode) {
			return
		}
		if !isConvertibleTargetDecl(targetDecl, typeChecker, markerOpts) {
			return
		}
		if reported[target.Name] {
			return
		}
		reported[target.Name] = true
		diags = append(diags, Diagnostic{Code: CodeOutsideSet, Severity: SeverityError, File: currentFile, Decl: declLabel(decl),
			Message: fmt.Sprintf("references %q declared in %s, which is not part of this conversion run — include that file in the same convert invocation", target.Name, path)})
	}
	// EVERY identifier is checked — type references, typeof queries,
	// qualified/namespace member names and value positions alike resolve
	// through the checker; anything landing on a lib / marker / same-file /
	// in-set declaration filters out in check.
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if node.Kind == ast.KindIdentifier {
			check(node)
		}
		node.ForEachChild(walk)
		return false
	}
	decl.Stmt.ForEachChild(walk)
	return diags
}

// writtenTypeRefDiags walks one declaration's WRITTEN type syntax once,
// classifying every type reference into the silent-any refusal that owns it —
// the convert twin of the resolver's shared walk (resolver/
// unresolved_name_guard.go). Converting a degraded declaration would cement
// the destroyed type (`any` / `RT.any()`) into the rewritten source, so both
// families error instead:
//
//   - Temporal (CodeTemporalNotLoaded): a qualified `Temporal.<KnownName>`
//     reference that resolved to ANY any-flavored type — the signature of a
//     project whose tsconfig lib does not load ESNext.Temporal. Syntax-based
//     for the same reason as the resolver guard: with the lib missing the
//     resolved type IS plain `any`, so the written qualified name is the only
//     evidence of intent (resolver/temporal_guard.go documents why this
//     predicate is stricter than its sibling's).
//   - Unresolved name (CNV008): any other reference that resolved to the
//     checker's ERROR type — `any` the author never wrote (a typo, missing
//     dependency types, an ambient declaration outside the program). A written
//     `any`, and a resolved `type Loose = any`, are the true `any` intrinsic —
//     marker.IsErrorLikeAny rejects them by construction.
//
// The families return separately so the caller keeps its precedence: a
// Temporal hit refuses the declaration with the lib-specific message alone.
func writtenTypeRefDiags(typeChecker *checker.Checker, decl *declaration, currentFile string) (temporalDiags, unresolvedDiags []Diagnostic) {
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if ast.IsTypeReferenceNode(node) {
			if temporalName, isTemporal := temporalRefName(node); isTemporal {
				refType := checker.Checker_getTypeFromTypeNode(typeChecker, node)
				if refType != nil && checker.Type_flags(refType)&checker.TypeFlagsAny != 0 {
					temporalDiags = append(temporalDiags, Diagnostic{Code: CodeTemporalNotLoaded, Severity: SeverityError, File: currentFile, Decl: declLabel(decl),
						Message: fmt.Sprintf("%s resolved to 'any' — add \"ESNext.Temporal\" to compilerOptions.lib; converting now would replace the type with any", temporalName)})
				}
			} else if marker.IsErrorLikeAny(checker.Checker_getTypeFromTypeNode(typeChecker, node)) {
				if name, ok := writtenRefName(node); ok {
					unresolvedDiags = append(unresolvedDiags, Diagnostic{Code: CodeUnresolvedTypeName, Severity: SeverityError, File: currentFile, Decl: declLabel(decl),
						Message: fmt.Sprintf("type reference '%s' did not resolve and checked as 'any' — converting would write the degraded type; fix the name or include the missing declaration in the tsconfig", name)})
				}
			}
		}
		node.ForEachChild(walk)
		return false
	}
	decl.Stmt.ForEachChild(walk)
	return temporalDiags, unresolvedDiags
}

// writtenRefName renders a TypeReference's written entity name (`Name` or
// `Ns.Nested.Name`) for the CNV008 message.
func writtenRefName(typeRefNode *ast.Node) (string, bool) {
	typeRef := typeRefNode.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeName == nil {
		return "", false
	}
	var render func(entity *ast.Node) (string, bool)
	render = func(entity *ast.Node) (string, bool) {
		if entity == nil {
			return "", false
		}
		if entity.Kind == ast.KindIdentifier {
			return entity.Text(), true
		}
		if ast.IsQualifiedName(entity) {
			qualified := entity.AsQualifiedName()
			left, leftOk := render(qualified.Left)
			right, rightOk := render(qualified.Right)
			if leftOk && rightOk {
				return left + "." + right, true
			}
		}
		return "", false
	}
	return render(typeRef.TypeName)
}

// temporalRefName reports whether a TypeReference names a builtin Temporal
// type (`Temporal.<Name>` with <Name> in the registry), returning the
// qualified spelling for the message.
func temporalRefName(typeRefNode *ast.Node) (string, bool) {
	typeRef := typeRefNode.AsTypeReferenceNode()
	if typeRef == nil || typeRef.TypeName == nil || !ast.IsQualifiedName(typeRef.TypeName) {
		return "", false
	}
	qualified := typeRef.TypeName.AsQualifiedName()
	if qualified == nil || qualified.Left == nil || qualified.Right == nil {
		return "", false
	}
	if qualified.Left.Kind != ast.KindIdentifier || qualified.Left.Text() != reflection.TemporalNamespace {
		return "", false
	}
	typeName := qualified.Right.Text()
	if _, ok := reflection.TemporalInfoByName(typeName); !ok {
		return "", false
	}
	return reflection.TemporalNamespace + "." + typeName, true
}

// isConvertibleTargetDecl reports whether a referenced declaration is one the
// converter WOULD convert if its file were in the set: a type alias, an
// interface, or a RunType-typed const. Enums, classes, functions and
// namespaces are runtime code the conversion never touches — referencing them
// across the set boundary is always fine.
func isConvertibleTargetDecl(targetDecl *ast.Node, typeChecker *checker.Checker, markerOpts marker.Options) bool {
	switch targetDecl.Kind {
	case ast.KindTypeAliasDeclaration, ast.KindInterfaceDeclaration:
		return true
	case ast.KindVariableDeclaration:
		variable := targetDecl.AsVariableDeclaration()
		if variable == nil {
			return false
		}
		nameNode := targetDecl.Name()
		if nameNode == nil {
			return false
		}
		symbol := typeChecker.GetSymbolAtLocation(nameNode)
		if symbol == nil {
			return false
		}
		return isRunTypeValue(typeChecker.GetTypeOfSymbol(symbol), markerOpts)
	}
	return false
}
