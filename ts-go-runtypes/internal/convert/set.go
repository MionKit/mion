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
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

// RefTarget is how one converted declaration can be referenced from another
// declaration's printed output. Only declarations with a TYPE name are
// reference targets — the alias survives every target form (builders / schema
// outputs keep the `InferType` alias), so a name reference can never break.
type RefTarget struct {
	TypeName  string
	ConstName string
	File      string
}

// Set is the run-wide conversion context: the files converted together and
// the declaration-id reference table across all of them.
type Set struct {
	Files map[string]bool
	Table map[string]RefTarget
}

// BuildSet recognizes and resolves every file's declarations once, up front,
// so each file's conversion can reference the others.
func BuildSet(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, fs vfspkg.FS, absFiles []string) (*Set, error) {
	set := &Set{Files: map[string]bool{}, Table: map[string]RefTarget{}}
	for _, absPath := range absFiles {
		set.Files[absPath] = true
	}
	for _, absPath := range absFiles {
		sourceFile := prog.SourceFile(absPath)
		if sourceFile == nil {
			return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
		}
		for _, decl := range recognizeFile(sourceFile, typeChecker, fs) {
			if decl.Generic || decl.Name == "" {
				// Generic declarations have no reference spelling; alias-less
				// consts have no type name that survives conversion — both
				// inline structurally where referenced.
				continue
			}
			resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
			if resolveErr != nil {
				return nil, resolveErr
			}
			// First declaration wins on a structural-id collision: same id =
			// same type, so either name is an exact reference.
			if _, exists := set.Table[resolved.Node.ID]; !exists {
				set.Table[resolved.Node.ID] = RefTarget{TypeName: decl.Name, ConstName: decl.ConstName, File: absPath}
			}
		}
	}
	return set, nil
}

// singleFileSet is the implicit set when ConvertFile is called without one.
func singleFileSet(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, fs vfspkg.FS, absPath string) (*Set, error) {
	return BuildSet(prog, typeChecker, cache, fs, []string{absPath})
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

// outsideSetDiags walks one declaration's ORIGINAL syntax for references to
// convertible declarations (type aliases / interfaces / RunType consts) whose
// file is a program source outside the conversion set. Conversion would have
// to inline them silently — the user decided that is an error: include the
// file in the run instead.
func outsideSetDiags(prog *program.Program, typeChecker *checker.Checker, fs vfspkg.FS, decl *declaration, set *Set, currentFile string) []Diagnostic {
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
		if !isConvertibleTargetDecl(targetDecl, typeChecker, fs) {
			return
		}
		if reported[target.Name] {
			return
		}
		reported[target.Name] = true
		diags = append(diags, Diagnostic{Code: CodeOutsideSet, Severity: SeverityError, File: currentFile, Decl: declLabel(decl),
			Message: fmt.Sprintf("references %q declared in %s, which is not part of this conversion run — include that file in the same convert invocation", target.Name, path)})
	}
	var walk func(node *ast.Node) bool
	walk = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindTypeReference:
			reference := node.AsTypeReferenceNode()
			if reference != nil && reference.TypeName != nil && ast.IsIdentifier(reference.TypeName) {
				check(reference.TypeName)
			}
		case ast.KindTypeQuery:
			query := node.AsTypeQueryNode()
			if query != nil && query.ExprName != nil && ast.IsIdentifier(query.ExprName) {
				check(query.ExprName)
			}
		case ast.KindIdentifier:
			// Value references inside const initializers (a builder composing
			// another file's const) resolve the same way.
			if parent := node.Parent; parent != nil && parent.Kind == ast.KindCallExpression {
				check(node)
			}
		}
		node.ForEachChild(walk)
		return false
	}
	decl.Stmt.ForEachChild(walk)
	return diags
}

// isConvertibleTargetDecl reports whether a referenced declaration is one the
// converter WOULD convert if its file were in the set: a type alias, an
// interface, or a RunType-typed const. Enums, classes, functions and
// namespaces are runtime code the conversion never touches — referencing them
// across the set boundary is always fine.
func isConvertibleTargetDecl(targetDecl *ast.Node, typeChecker *checker.Checker, fs vfspkg.FS) bool {
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
		return isRunTypeValue(typeChecker.GetTypeOfSymbol(symbol), fs)
	}
	return false
}
