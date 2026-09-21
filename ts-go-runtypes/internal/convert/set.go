package convert

// set.go is the conversion run's SET-WIDE context: files convert together and reference each other,
// so before any file is printed the run builds one table of every convertible declaration's
// structural id to its reference spelling. Printers use it to keep authored references as references
// instead of inlining, and to close cycles, a back-edge to the declaration being printed becoming
// `RT.self()` or the type's own name. A reference to a convertible declaration OUTSIDE the set is
// the error CNV004: conversion never silently inlines what another file still spells by name.

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

// RefTarget is how one converted declaration is referenced from another's printed output. Only
// declarations with a TYPE name qualify, since the alias survives every target form, so a name
// reference cannot break. Exported is the ALIAS's export modifier: a cross-file reference imports
// the type name, which only works when the declaring file exports it.
type RefTarget struct {
	TypeName  string
	ConstName string
	File      string
	Exported  bool
}

// Set is the run-wide conversion context: the files converted together and the declaration-id
// reference table across them. It memoizes recognition and the const-reference index, so a run
// recognizes each file once and walks the program for const uses once, rather than per candidate
// declaration inside the const-away fixpoint.
type Set struct {
	Files map[string]bool
	Table map[string]RefTarget

	// The program the set was built over; the index and memo below read it.
	prog       *program.Program
	checker    *checker.Checker
	markerOpts marker.Options
	// declsByFile memoizes recognizeFile per in-set file, keyed the way the checker names files, as
	// set.Files is.
	declsByFile map[string][]*declaration
	// constUses maps each in-set const's symbol to every use position across the whole program,
	// import specifiers excluded because they only re-bind. Built lazily by constUseIndex.
	constUses map[*ast.Symbol][]constUse
	// candidateSpans caches, per target, the statement spans each in-set file's own conversion would
	// rewrite: const uses inside them do not keep a const alive. Built lazily by candidateSpansFor.
	candidateSpans map[Target]map[string][][2]int
}

// constUse is one identifier use of an in-set const, positioned so it compares against statement
// spans.
type constUse struct {
	file string
	pos  int
}

// BuildSet resolves every file's declarations once, up front, so each file's conversion can
// reference the others.
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
				// A generic declaration has no reference spelling and an alias-less const no type name
				// that survives conversion, so both inline structurally where referenced. Drizzle
				// tables never join the table: their type id moves with the road.
				continue
			}
			resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
			if resolveErr != nil {
				return nil, resolveErr
			}
			// First declaration wins on a structural-id collision: same id is the same type, so
			// either name is an exact reference.
			if _, exists := set.Table[resolved.Node.ID]; !exists {
				set.Table[resolved.Node.ID] = RefTarget{TypeName: decl.Name, ConstName: decl.ConstName, File: absPath, Exported: decl.AliasExported}
			}
		}
	}
	return set, nil
}

// declsFor returns the memoized recognition for an in-set file, and recognizes on the spot for a
// file outside the memo, which ConvertFile is never handed.
func (set *Set) declsFor(sourceFile *ast.SourceFile, absPath string, typeChecker *checker.Checker, markerOpts marker.Options) []*declaration {
	if decls, memoized := set.declsByFile[absPath]; memoized {
		return decls
	}
	return recognizeFile(sourceFile, typeChecker, markerOpts)
}

// constUseIndex builds, once, the program-wide use index of every in-set const: one walk over every
// source file recording each identifier that resolves, through import aliases, to a candidate const
// symbol. Without it the const-away check would walk per candidate, per fixpoint iteration.
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
						// An import specifier re-binding the const is not a use on its own; a real use
						// resolves the same symbol at its own position.
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

// candidateSpansFor returns, building once per target, the statement spans each in-set file's own
// conversion would rewrite: every non-generic declaration not already in the target form, alias
// statements included. Const uses inside them do not keep a const alive, each file applying the
// same safety check to itself.
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

// binding is one local name an import introduces, resolved to the file and exported name it aliases.
type binding struct {
	local        string
	exportedName string
	targetFile   string
	namespace    bool
	module       string
}

// fileBindings is a file's imported-name inventory: how each foreign declaration is spellable here,
// and which module specifier reaches which file, for import additions.
type fileBindings struct {
	bindings     []binding
	moduleByFile map[string]string
}

// buildFileBindings resolves every import binding of the file through the checker, SkipAlias
// following each alias to the real declaration.
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
			// A namespace import's target is the module itself, so members spell through it and the
			// module's own file is mapped for additions.
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

// spellForTarget returns how this file spells target's type name: an existing named binding's local,
// a namespace-qualified member, or the bare name with needsImport when no binding exists. ok is
// false when the file has no route to the target at all.
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

// moduleFor returns the module specifier this file already uses to reach a declaration file, or "".
func (fileImports *fileBindings) moduleFor(targetFile string) string {
	return fileImports.moduleByFile[targetFile]
}

// removableLocals lists the locals bound to in-set files' declarations, the bindings conversion may
// have made unused. A namespace binding is never removed.
func (fileImports *fileBindings) removableLocals(set *Set) map[string]bool {
	out := map[string]bool{}
	for _, entry := range fileImports.bindings {
		if !entry.namespace && set.Files[entry.targetFile] {
			out[entry.local] = true
		}
	}
	return out
}

// sameModuleFile compares declaration files, tolerating the normalization difference between
// checker paths.
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

// inScopeNames collects every top-level name the file can reference: import locals plus declared
// classes, enums, functions, namespaces, aliases, interfaces and consts. A printer spelling a live
// symbol checks here, the reflected name being the DECLARATION name, which an aliased import would
// not bind.
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

// referencedThroughPackageImport reports whether the identifier is reached through a BARE module
// specifier, directly or as the member of a namespace import (`TF.String`). A relative specifier
// returns false: that file really can be added to the run.
func referencedThroughPackageImport(typeChecker *checker.Checker, nameNode *ast.Node) bool {
	if aliasIsPackageImport(typeChecker, nameNode) {
		return true
	}
	// In `TF.String` the identifier under test is the RIGHT side, and only the LEFT one carries the
	// import.
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

// aliasIsPackageImport reports whether the identifier binds an import of a bare package name.
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

// outsideSetDiags walks one declaration's ORIGINAL syntax for references to convertible declarations
// whose file is a program source outside the conversion set. Conversion would have to inline them
// silently, which is an error: include the file in the run instead.
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
		// Only convertible sources count: a declaration file is never a conversion candidate.
		if strings.HasSuffix(path, ".d.ts") || strings.Contains(path, "/node_modules/") || prog.SourceFile(path) == nil {
			return
		}
		// Nor is anything reached through a PACKAGE import: "include that file in the run" is advice
		// a user can act on for a sibling source, never for a dependency. The filters above miss it
		// whenever a package resolves to real sources (a `source` condition, a workspace link, a
		// `paths` alias), which is how the marker package's own suites resolve it.
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
	// EVERY identifier is checked, since type references, typeof queries, qualified member names and
	// value positions all resolve through the checker; check filters out the rest.
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

// writtenTypeRefDiags walks one declaration's WRITTEN type syntax once, classifying every type
// reference into the silent-any refusal that owns it, the convert twin of
// resolver/unresolved_name_guard.go. Converting a degraded declaration would cement the destroyed
// type into the rewritten source, so both families error instead:
//
//   - Temporal (CodeTemporalNotLoaded): a qualified `Temporal.<KnownName>` reference that resolved
//     to any any-flavored type, the signature of a tsconfig lib without ESNext.Temporal.
//     Syntax-based because with the lib missing the resolved type IS plain `any`, so the written
//     name is the only evidence of intent (resolver/temporal_guard.go says why this predicate is
//     stricter than its sibling's).
//   - Unresolved name (CNV008): any other reference that resolved to the checker's ERROR type, the
//     `any` the author never wrote. A written `any` and a resolved `type Loose = any` are the true
//     `any` intrinsic, which marker.IsErrorLikeAny rejects by construction.
//
// The families return separately so the caller keeps its precedence: a Temporal hit refuses the
// declaration with the lib-specific message alone.
func writtenTypeRefDiags(typeChecker *checker.Checker, decl *declaration, currentFile string) (temporalDiags, unresolvedDiags []Diagnostic) {
	// marker.EachWrittenTypeRef follows each reference into the declaration it names, so a degraded
	// name one declaration deeper refuses its referrer too: converting would cement the same `any`.
	marker.EachWrittenTypeRef(typeChecker, decl.Stmt, func(node *ast.Node, via []string) {
		reached := ""
		if len(via) > 0 {
			reached = " (reached via '" + strings.Join(via, "' > '") + "')"
		}
		if temporalName, isTemporal := temporalRefName(node); isTemporal {
			refType := checker.Checker_getTypeFromTypeNode(typeChecker, node)
			if refType != nil && checker.Type_flags(refType)&checker.TypeFlagsAny != 0 {
				temporalDiags = append(temporalDiags, Diagnostic{Code: CodeTemporalNotLoaded, Severity: SeverityError, File: currentFile, Decl: declLabel(decl),
					Message: fmt.Sprintf("%s%s resolved to 'any' — add \"ESNext.Temporal\" to compilerOptions.lib; converting now would replace the type with any", temporalName, reached)})
			}
		} else if marker.IsErrorLikeAny(checker.Checker_getTypeFromTypeNode(typeChecker, node)) {
			if name, ok := writtenRefName(node); ok {
				unresolvedDiags = append(unresolvedDiags, Diagnostic{Code: CodeUnresolvedTypeName, Severity: SeverityError, File: currentFile, Decl: declLabel(decl),
					Message: fmt.Sprintf("type reference '%s'%s did not resolve and checked as 'any' — converting would write the degraded type; fix the name or include the missing declaration in the tsconfig", name, reached)})
			}
		}
	})
	return temporalDiags, unresolvedDiags
}

// writtenRefName renders a TypeReference's written entity name for the CNV008 message.
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

// temporalRefName returns the qualified spelling when a TypeReference names a builtin Temporal type,
// meaning `Temporal.<Name>` with <Name> in the registry.
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

// isConvertibleTargetDecl reports whether a referenced declaration is one the converter WOULD
// convert if its file were in the set: a type alias, an interface, or a RunType-typed const. Enums,
// classes, functions and namespaces are runtime code, so referencing them across the set boundary is
// always fine.
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
