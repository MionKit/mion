package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

// scope is one frame in the lexical scope chain. parent is nil at the
// factory's top frame. names holds every identifier text bound at this
// frame: function parameters, var/let/const declarations, function
// declaration names, catch-clause binding, for-in / for-of binding.
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

// checkPurity walks factoryNode's body and emits one Diagnostic per
// pure-function violation. Mirrors the reference eslint rules'
// `pure-functions.ts` rule with two project-specific deltas
// (globalThis → forbid; Temporal → allow). Returns the slice; the caller
// appends to its own diagnostics list.
//
// The Go port uses a proper lexical scope stack (push/pop per function
// boundary) rather than the reference flat-scope approximation — more correct
// for nested functions whose params should only be visible inside them.
func checkPurity(sourceFile *ast.SourceFile, factoryNode *ast.Node) []diagnostics.Diagnostic {
	var diags []diagnostics.Diagnostic
	visitForPurity(sourceFile, factoryNode, nil, &diags)
	return diags
}

// visitForPurity is the main recursive walker. When it enters a
// function-like node it pushes a new scope, populates it, and walks
// children under that scope; otherwise it inspects the node and
// descends. Forbidden expressions (this/await/yield/dynamic import)
// emit a diagnostic at that node's position; identifier references are
// checked against scope ∪ allowedGlobals, with forbiddenIdentifiers
// taking precedence.
func visitForPurity(sourceFile *ast.SourceFile, node *ast.Node, current *scope, diags *[]diagnostics.Diagnostic) {
	if node == nil {
		return
	}

	// Skip type-only subtrees outright. Identifiers inside type
	// references (e.g. `p: MyType`, `x as MyType`, `<T>(...)`) are not
	// runtime references and must not be flagged — they're stripped
	// before the body ever reaches `new Function`. We bail before
	// dispatching on the more specific node kinds so the children
	// (which can carry more nested TypeReferences) are also skipped.
	if validateOnlyKind(node.Kind) {
		return
	}

	// Skip the type-annotation fields on declarations / parameters /
	// function returns. The parent node still descends into name +
	// initializer / body via ForEachChild, but we filter the Type field
	// here by inspecting the parent relationship.
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
		// Visit children (params + type params + body). isReferenceIdentifier
		// filters out the binding-name identifiers so we don't double-count
		// them as references-to-themselves.
		node.ForEachChild(func(child *ast.Node) bool {
			visitForPurity(sourceFile, child, nested, diags)
			return false
		})
		return

	case ast.KindThisKeyword:
		// Only flag `this` in expression position. The same Kind appears as a
		// TypeNode (`this` in type position, e.g. `: this`) — the type
		// stripper has already removed those, but defensive check is cheap.
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
		if !isReferenceIdentifier(node) {
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
		visitForPurity(sourceFile, child, current, diags)
		return false
	})
}

// addParams populates scope with the names declared by fnNode's
// parameter list. Each parameter may be a plain Identifier or a
// destructuring pattern; both are recursively unwrapped.
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

// addBodyDeclarations walks bodyNode collecting every declared name
// visible at the function's top scope. Stops at function boundaries —
// nested function scopes get their own frame when the visitor enters
// them.
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
			// The declaration's name is visible at this scope; nested fn's
			// internals get their own scope when visited later.
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
			// Reachable when descending into a nested function's signature
			// from the outer scope's perspective — skip; the nested scope
			// owns its params.
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

// collectBindingNames recursively unwraps Identifier / ObjectBindingPattern
// / ArrayBindingPattern, adding every leaf identifier name to set.
// Mirrors the destructuring handling in the reference collectBindingNames.
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

// collectForInitializerNames handles `for (X of …)` / `for (X in …)`
// where X may be a VariableDeclarationList (`const x of …`) or a bare
// assignment target.
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

// isReferenceIdentifier returns true when the Identifier at `node` is a
// reference (read of an outer name) rather than a binding (declaration
// or non-computed property key).
//
// False for:
//   - The `.Name()` of any declaration / parameter / function decl /
//     binding element (those are bindings, not refs).
//   - The right-hand side of `obj.X` — `X` here is a property name on the
//     RUNTIME-RESOLVED type of `obj`, not a reference to anything in
//     local scope.
//   - The key of a non-computed `{X: …}` property assignment — also a
//     property name, not a reference.
//   - Import / export specifier names — bindings, not refs.
//
// True for:
//   - Bare identifier references in expression position.
//   - The shorthand key of `{x}` — by JS semantics this DOES reference
//     a binding called `x`.
//   - The expression inside `[<expr>]: …` computed property names.
func isReferenceIdentifier(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return true
	}
	switch parent.Kind {
	case ast.KindPropertyAccessExpression:
		// `obj.X` — the property name is the .Name() field; the LHS
		// (Expression field) is the reference.
		pa := parent.AsPropertyAccessExpression()
		if pa != nil && pa.Name() == node {
			return false
		}
	case ast.KindPropertyAssignment:
		// `{X: value}` — the key is the .Name() field; the value
		// (Initializer) is the reference.
		pa := parent.AsPropertyAssignment()
		if pa != nil && pa.Name() == node {
			return false
		}
	case ast.KindShorthandPropertyAssignment:
		// `{x}` is shorthand for `{x: x}`; the SAME node serves as both
		// key and value, and IS a reference. Stay true.
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
		// The function's own name binding (function fn() {} / function
		// fn() {}).
		if parent.Name() == node {
			return false
		}
	case ast.KindBindingElement:
		be := parent.AsBindingElement()
		if be == nil {
			return false
		}
		// `{X: y}` — X is the propertyName (key), y is the name (binding).
		// `{x}` — x is the name (binding) and propertyName is nil.
		// In both cases the .Name() field is a binding, not a reference.
		if be.Name() == node {
			return false
		}
		// The propertyName (when explicit, like `{X: y}`) is a property
		// key on the source object, not a reference.
		if be.PropertyName != nil && be.PropertyName == node {
			return false
		}
	case ast.KindMethodDeclaration, ast.KindGetAccessor, ast.KindSetAccessor:
		if parent.Name() == node {
			return false
		}
	case ast.KindImportSpecifier, ast.KindImportClause, ast.KindNamespaceImport, ast.KindExportSpecifier:
		// Import / export bindings — never references in this rule's sense.
		return false
	}
	return true
}

// validateOnlyKind returns true for AST node kinds that exist only as
// part of a type annotation — their subtrees never produce runtime
// references and must be skipped by the purity walker.
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

// validateAnnotationSlot reports whether node sits in a field that holds
// a TypeNode on its parent — e.g. `: Type` on a Parameter / Variable
// declaration / Function return. Such children are skipped wholesale
// so identifier references inside the type don't get walked.
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

// isInTypePosition reports whether node sits inside a TypeNode subtree.
// We strip TS annotations before extraction, but the parser surface can
// still produce KindThisKeyword in non-stripped positions for defensive
// callers; treat any `this` parented by a type node as harmless.
func isInTypePosition(node *ast.Node) bool {
	for cursor := node.Parent; cursor != nil; cursor = cursor.Parent {
		// Crude: any TypeNode ancestor short-circuits. TypeNodes' Kind
		// values are clustered in the AST kind space; here we just look
		// for the common ones we'd care about.
		switch cursor.Kind {
		case ast.KindTypeReference, ast.KindUnionType, ast.KindIntersectionType,
			ast.KindTypeLiteral, ast.KindFunctionType, ast.KindArrayType,
			ast.KindParenthesizedType, ast.KindMappedType, ast.KindIndexedAccessType,
			ast.KindLiteralType, ast.KindConditionalType, ast.KindTypeQuery,
			ast.KindTypeAliasDeclaration, ast.KindInterfaceDeclaration:
			return true
		case ast.KindBlock, ast.KindFunctionExpression, ast.KindArrowFunction,
			ast.KindFunctionDeclaration:
			// Reached an expression / statement / function boundary —
			// definitely not in a type position.
			return false
		}
	}
	return false
}
