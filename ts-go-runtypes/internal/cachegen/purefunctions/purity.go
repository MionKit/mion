package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// scope is one frame in the lexical scope chain; parent is nil at the factory's top frame.
type scope struct {
	parent *scope
	names  map[string]bool
}

func newScope(parent *scope) *scope {
	return &scope{parent: parent, names: map[string]bool{}}
}

func (s *scope) has(name string) bool {
	for cursor := s; cursor != nil; cursor = cursor.parent {
		if cursor.names[name] {
			return true
		}
	}
	return false
}

// checkPurity walks factoryNode's body and returns one Diagnostic per pure-function violation.
//
// `exempt` are spans the body no longer contains by the time it ships: the imported ids a tracked
// lookup names, lowered to string literals during stripping, so an identifier inside one is not a
// capture.
func checkPurity(sourceFile *ast.SourceFile, factoryNode *ast.Node, exempt []textRange) []diagnostics.Diagnostic {
	var diags []diagnostics.Diagnostic
	visitForPurity(sourceFile, factoryNode, nil, exempt, &diags)
	return diags
}

// inExemptRange reports whether pos falls inside one of the lowered spans.
func inExemptRange(exempt []textRange, pos int) bool {
	for _, span := range exempt {
		if pos >= span.Start && pos < span.End {
			return true
		}
	}
	return false
}

// visitForPurity checks an identifier reference against scope ∪ allowedGlobals, forbiddenIdentifiers first.
func visitForPurity(sourceFile *ast.SourceFile, node *ast.Node, current *scope, exempt []textRange, diags *[]diagnostics.Diagnostic) {
	if node == nil {
		return
	}

	// An identifier inside a type is no runtime reference, and is stripped before the body
	// reaches `new Function`. Bail before the specific kinds, so nested types are skipped too.
	if validateOnlyKind(node.Kind) {
		return
	}

	// ForEachChild hands out the Type field along with name and initializer, so the annotation
	// slot is filtered here, off the parent relationship.
	if node.Parent != nil && validateAnnotationSlot(node) {
		return
	}

	switch node.Kind {
	case ast.KindFunctionExpression, ast.KindArrowFunction, ast.KindFunctionDeclaration:
		nested := newScope(current)
		addParams(nested, node)
		body := node.Body()
		if body != nil {
			addBodyDeclarations(nested, body)
		}
		// isReferenceIdentifier keeps a binding name from counting as a reference to itself.
		node.ForEachChild(func(child *ast.Node) bool {
			visitForPurity(sourceFile, child, nested, exempt, diags)
			return false
		})
		return

	case ast.KindThisKeyword:
		// The same Kind appears in type position (`: this`), which the type stripper already
		// removed; the check is cheap, so it stays.
		if node.Parent != nil && isInTypePosition(node) {
			return
		}
		*diags = append(*diags, diagnostics.New(
			diagnostics.CodePurityThis,
			siteFromNode(sourceFile, node),
		))
		return

	case ast.KindAwaitExpression:
		*diags = append(*diags, diagnostics.New(
			diagnostics.CodePurityAwait,
			siteFromNode(sourceFile, node),
		))
		// Continue descending — inner expressions may have their own violations.

	case ast.KindYieldExpression:
		*diags = append(*diags, diagnostics.New(
			diagnostics.CodePurityYield,
			siteFromNode(sourceFile, node),
		))

	case ast.KindCallExpression:
		callExpr := node.AsCallExpression()
		if callExpr != nil && callExpr.Expression != nil && callExpr.Expression.Kind == ast.KindImportKeyword {
			*diags = append(*diags, diagnostics.New(
				diagnostics.CodePurityDynamicImport,
				siteFromNode(sourceFile, node),
			))
		}
		// Fall through to descend into the callee + args (nested violations).

	case ast.KindIdentifier:
		if !isReferenceIdentifier(node) || inExemptRange(exempt, node.Pos()) {
			return
		}
		name := node.Text()
		if forbiddenIdentifiers[name] {
			*diags = append(*diags, diagnostics.New(
				diagnostics.CodePurityForbidden,
				siteFromNode(sourceFile, node),
				name,
			))
			return
		}
		if current.has(name) || allowedGlobals[name] {
			return
		}
		*diags = append(*diags, diagnostics.New(
			diagnostics.CodePurityClosure,
			siteFromNode(sourceFile, node),
			name,
		))
		return
	}

	node.ForEachChild(func(child *ast.Node) bool {
		visitForPurity(sourceFile, child, current, exempt, diags)
		return false
	})
}

// addParams populates scope with the names fnNode's parameter list declares, destructuring included.
func addParams(s *scope, fnNode *ast.Node) {
	fnLike := fnNode.FunctionLikeData()
	if fnLike == nil || fnLike.Parameters == nil {
		return
	}
	for _, paramNode := range fnLike.Parameters.Nodes {
		paramDecl := paramNode.AsParameterDeclaration()
		if paramDecl == nil {
			continue
		}
		collectBindingNames(paramDecl.Name(), s.names)
	}
}

// addBodyDeclarations collects every name visible at the function's top scope, stopping at a
// function boundary: a nested function gets its own frame when the visitor enters it.
func addBodyDeclarations(s *scope, bodyNode *ast.Node) {
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		switch node.Kind {
		case ast.KindFunctionExpression, ast.KindArrowFunction:
			// Stop — nested fn scope is built when visited.
			return false
		case ast.KindFunctionDeclaration:
			// The declaration's name is visible at this scope, its internals are not.
			if name := node.Name(); name != nil && name.Kind == ast.KindIdentifier {
				s.names[name.Text()] = true
			}
			return false
		case ast.KindVariableDeclaration:
			varDecl := node.AsVariableDeclaration()
			if varDecl != nil {
				collectBindingNames(varDecl.Name(), s.names)
			}
		case ast.KindParameter:
			// Reached through a nested function's signature; that scope owns its params.
			return false
		case ast.KindCatchClause:
			catch := node.AsCatchClause()
			if catch != nil && catch.VariableDeclaration != nil {
				varDecl := catch.VariableDeclaration.AsVariableDeclaration()
				if varDecl != nil {
					collectBindingNames(varDecl.Name(), s.names)
				}
			}
		case ast.KindForInStatement, ast.KindForOfStatement:
			forStmt := node.AsForInOrOfStatement()
			if forStmt != nil && forStmt.Initializer != nil {
				collectForInitializerNames(forStmt.Initializer, s.names)
			}
		}
		node.ForEachChild(visit)
		return false
	}
	bodyNode.ForEachChild(visit)
}

// collectBindingNames adds every leaf identifier name of a binding pattern to set.
func collectBindingNames(node *ast.Node, set map[string]bool) {
	if node == nil {
		return
	}
	switch node.Kind {
	case ast.KindIdentifier:
		set[node.Text()] = true
	case ast.KindObjectBindingPattern, ast.KindArrayBindingPattern:
		node.ForEachChild(func(child *ast.Node) bool {
			if child.Kind == ast.KindBindingElement {
				elem := child.AsBindingElement()
				if elem != nil {
					collectBindingNames(elem.Name(), set)
				}
			}
			return false
		})
	}
}

// collectForInitializerNames handles `for (X of …)` where X is a declaration list or a bare target.
func collectForInitializerNames(node *ast.Node, set map[string]bool) {
	if node == nil {
		return
	}
	if node.Kind == ast.KindVariableDeclarationList {
		declList := node.AsVariableDeclarationList()
		if declList == nil {
			return
		}
		for _, decl := range declList.Declarations.Nodes {
			varDecl := decl.AsVariableDeclaration()
			if varDecl != nil {
				collectBindingNames(varDecl.Name(), set)
			}
		}
		return
	}
	collectBindingNames(node, set)
}

// isReferenceIdentifier reports whether the Identifier reads an outer name, rather than binding one
// (a declaration's `.Name()`, an import / export specifier) or naming a property (`obj.X`, the key
// of `{X: …}`). True for the shorthand key of `{x}`, which by JS semantics DOES reference `x`, and
// for the expression inside a computed `[<expr>]: …` key.
func isReferenceIdentifier(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return true
	}
	switch parent.Kind {
	case ast.KindPropertyAccessExpression:
		pa := parent.AsPropertyAccessExpression()
		if pa != nil && pa.Name() == node {
			return false
		}
	case ast.KindPropertyAssignment:
		pa := parent.AsPropertyAssignment()
		if pa != nil && pa.Name() == node {
			return false
		}
	case ast.KindShorthandPropertyAssignment:
		// `{x}` is `{x: x}`: the SAME node is key and value, and IS a reference. Stay true.
	case ast.KindVariableDeclaration:
		vd := parent.AsVariableDeclaration()
		if vd != nil && vd.Name() == node {
			return false
		}
	case ast.KindParameter:
		p := parent.AsParameterDeclaration()
		if p != nil && p.Name() == node {
			return false
		}
	case ast.KindFunctionDeclaration, ast.KindFunctionExpression, ast.KindArrowFunction:
		// The function's own name binding.
		if parent.Name() == node {
			return false
		}
	case ast.KindBindingElement:
		be := parent.AsBindingElement()
		if be == nil {
			return false
		}
		// In `{X: y}` and in `{x}` alike, the .Name() field is the binding.
		if be.Name() == node {
			return false
		}
		// An explicit propertyName (`{X: y}`) is a key on the source object.
		if be.PropertyName != nil && be.PropertyName == node {
			return false
		}
	case ast.KindMethodDeclaration, ast.KindGetAccessor, ast.KindSetAccessor:
		if parent.Name() == node {
			return false
		}
	case ast.KindImportSpecifier, ast.KindImportClause, ast.KindNamespaceImport, ast.KindExportSpecifier:
		// Import / export bindings, never references in this rule's sense.
		return false
	}
	return true
}

// validateOnlyKind reports a node kind that exists only inside a type, so its subtree produces
// no runtime reference.
func validateOnlyKind(kind ast.Kind) bool {
	switch kind {
	case ast.KindTypeReference,
		ast.KindUnionType, ast.KindIntersectionType,
		ast.KindTypeLiteral, ast.KindFunctionType,
		ast.KindArrayType, ast.KindTupleType,
		ast.KindParenthesizedType, ast.KindMappedType,
		ast.KindIndexedAccessType, ast.KindLiteralType,
		ast.KindConditionalType, ast.KindTypeQuery,
		ast.KindRestType, ast.KindOptionalType,
		ast.KindTemplateLiteralType, ast.KindThisType,
		ast.KindNamedTupleMember,
		ast.KindTypeAliasDeclaration, ast.KindInterfaceDeclaration,
		ast.KindTypeParameter, ast.KindTypeOperator,
		ast.KindInferType, ast.KindConstructorType:
		return true
	}
	return false
}

// validateAnnotationSlot reports whether node fills a TypeNode field of its parent (`: Type` on a
// parameter, a variable declaration, a function return), which is skipped whole.
func validateAnnotationSlot(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return false
	}
	switch parent.Kind {
	case ast.KindParameter:
		if pd := parent.AsParameterDeclaration(); pd != nil && pd.Type == node {
			return true
		}
	case ast.KindVariableDeclaration:
		if vd := parent.AsVariableDeclaration(); vd != nil && vd.Type == node {
			return true
		}
	case ast.KindFunctionExpression, ast.KindArrowFunction, ast.KindFunctionDeclaration,
		ast.KindMethodDeclaration, ast.KindGetAccessor, ast.KindSetAccessor:
		if fnLike := parent.FunctionLikeData(); fnLike != nil && fnLike.Type == node {
			return true
		}
	case ast.KindAsExpression:
		if as := parent.AsAsExpression(); as != nil && as.Type == node {
			return true
		}
	case ast.KindSatisfiesExpression:
		if sat := parent.AsSatisfiesExpression(); sat != nil && sat.Type == node {
			return true
		}
	case ast.KindTypeAssertionExpression:
		if ta := parent.AsTypeAssertion(); ta != nil && ta.Type == node {
			return true
		}
	}
	return false
}

// isInTypePosition reports whether node sits inside a TypeNode subtree. Annotations are stripped
// before extraction, but a defensive caller may still hand over a `this` in type position.
func isInTypePosition(node *ast.Node) bool {
	for cursor := node.Parent; cursor != nil; cursor = cursor.Parent {
		// Crude: only the common TypeNode kinds are listed, any one of them short-circuits.
		switch cursor.Kind {
		case ast.KindTypeReference, ast.KindUnionType, ast.KindIntersectionType,
			ast.KindTypeLiteral, ast.KindFunctionType, ast.KindArrayType,
			ast.KindParenthesizedType, ast.KindMappedType, ast.KindIndexedAccessType,
			ast.KindLiteralType, ast.KindConditionalType, ast.KindTypeQuery,
			ast.KindTypeAliasDeclaration, ast.KindInterfaceDeclaration:
			return true
		case ast.KindBlock, ast.KindFunctionExpression, ast.KindArrowFunction,
			ast.KindFunctionDeclaration:
			// An expression / statement / function boundary: not a type position.
			return false
		}
	}
	return false
}
