package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// detectAnyFromUnresolvedImport guards the silent-degradation failure mode a
// module-resolution skew produces: an import the bundler resolves fine at
// runtime fails in the SCAN program (extensionless NodeNext import, missing
// dependency, undeclared `paths` alias), so the marker's `T` checks as `any`
// — the emitted validator is the always-true identity, the mock is
// `undefined`, encoders pass values through — with zero signal. Sibling of
// the TMP001 walk in detectWrittenTypeRefGuards (the lib-not-loaded flavor of
// the same trap).
//
// Detection requires BOTH signals so a deliberately-`any` marker stays legal:
// the site's resolved type argument is `any`, AND the site's source file
// carries at least one import whose bindings do not resolve. The import walk
// runs on the CHECKER THE SCAN ALREADY HOLDS (alias-symbol resolution only) —
// never a program-level semantic-diagnostics pass, which acquires additional
// pool checkers and can starve the pool mid-scan. Lazy (only for any-typed
// sites) and memoized per file on the Session.
//
// A written `any`/`unknown` KEYWORD type argument is always skipped — that
// spelling is unambiguous intent even in a file with an unrelated failing
// import.
func (state scanState) detectAnyFromUnresolvedImport(file string, call *ast.Node, typeArgument *checker.Type) []diagnostics.Diagnostic {
	if typeArgument == nil || checker.Type_flags(typeArgument)&checker.TypeFlagsAny == 0 {
		return nil
	}
	if hasExplicitBroadKeywordTypeArg(call) {
		return nil
	}
	sourceFile := ast.GetSourceFileOfNode(call)
	if sourceFile == nil {
		return nil
	}
	specifiers := state.unresolvedImportSpecifiers(sourceFile)
	if len(specifiers) == 0 {
		return nil
	}
	return []diagnostics.Diagnostic{diagnostics.New(
		diagnostics.CodeMarkerAnyFromUnresolvedImport,
		textpos.NodeSite(file, sourceFile, call),
		specifiers[0],
	)}
}

// hasExplicitBroadKeywordTypeArg reports whether the call spells a broad
// keyword (`any` / `unknown`) directly in its type-argument list —
// `createValidateFn<any>()` is deliberate and never diagnosed.
func hasExplicitBroadKeywordTypeArg(call *ast.Node) bool {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.TypeArguments == nil {
		return false
	}
	for _, typeArgNode := range callExpression.TypeArguments.Nodes {
		if typeArgNode != nil && (typeArgNode.Kind == ast.KindAnyKeyword || typeArgNode.Kind == ast.KindUnknownKeyword) {
			return true
		}
	}
	return false
}

// unresolvedImportSpecifiers returns (memoized per file, mutex-guarded — the
// parallel scan hits this from several checker groups) the module specifiers
// whose import BINDINGS fail alias resolution on the scan checker, in
// statement order. Bare side-effect imports (`import './x'`) are skipped: no
// binding means no type can flow from them, so they can never be the source
// of an any-degraded marker T.
func (state scanState) unresolvedImportSpecifiers(sourceFile *ast.SourceFile) []string {
	sess := state.sess
	fileName := sourceFile.FileName()
	sess.unresolvedSpecifiersMutex.Lock()
	if sess.unresolvedSpecifiersByFile != nil {
		if cached, ok := sess.unresolvedSpecifiersByFile[fileName]; ok {
			sess.unresolvedSpecifiersMutex.Unlock()
			return cached
		}
	}
	sess.unresolvedSpecifiersMutex.Unlock()

	specifiers := collectUnresolvedImportSpecifiers(state.scanChecker, sourceFile)

	sess.unresolvedSpecifiersMutex.Lock()
	if sess.unresolvedSpecifiersByFile == nil {
		sess.unresolvedSpecifiersByFile = map[string][]string{}
	}
	sess.unresolvedSpecifiersByFile[fileName] = specifiers
	sess.unresolvedSpecifiersMutex.Unlock()
	return specifiers
}

// collectUnresolvedImportSpecifiers walks the file's import declarations and
// reports each specifier with at least one binding whose alias symbol does
// not resolve to a target (Checker_getImmediateAliasedSymbol returns nil —
// the checker had no module to look the export up in).
func collectUnresolvedImportSpecifiers(scanChecker *checker.Checker, sourceFile *ast.SourceFile) []string {
	locals := ast.GetLocals(sourceFile.AsNode())
	if locals == nil {
		return nil
	}
	var specifiers []string
	for _, statement := range sourceFile.Statements.Nodes {
		if statement == nil || !ast.IsImportDeclaration(statement) {
			continue
		}
		importDecl := statement.AsImportDeclaration()
		if importDecl == nil || importDecl.ModuleSpecifier == nil || importDecl.ImportClause == nil {
			continue
		}
		specifier := importDecl.ModuleSpecifier.Text()
		if specifier == "" {
			continue
		}
		for _, bindingName := range importBindingNames(importDecl.ImportClause.AsImportClause()) {
			symbol := locals[bindingName]
			if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 {
				continue
			}
			if checker.Checker_getImmediateAliasedSymbol(scanChecker, symbol) == nil {
				specifiers = append(specifiers, specifier)
				break
			}
		}
	}
	return specifiers
}

// importBindingNames lists the LOCAL names an import clause binds: the
// default import, a namespace import, and every named-import element (its
// `as` alias when present — that is the local symbol's name).
func importBindingNames(clause *ast.ImportClause) []string {
	if clause == nil {
		return nil
	}
	var names []string
	if nameNode := clause.Name(); nameNode != nil {
		names = append(names, nameNode.Text())
	}
	if clause.NamedBindings != nil {
		if ast.IsNamespaceImport(clause.NamedBindings) {
			if namespaceName := clause.NamedBindings.Name(); namespaceName != nil {
				names = append(names, namespaceName.Text())
			}
		} else if ast.IsNamedImports(clause.NamedBindings) {
			named := clause.NamedBindings.AsNamedImports()
			if named != nil && named.Elements != nil {
				for _, element := range named.Elements.Nodes {
					if element == nil || !ast.IsImportSpecifier(element) {
						continue
					}
					if nameNode := element.Name(); nameNode != nil {
						names = append(names, nameNode.Text())
					}
				}
			}
		}
	}
	return names
}
