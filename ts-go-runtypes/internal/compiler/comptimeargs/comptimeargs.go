// Package comptimeargs validates that an argument passed to a parameter
// branded with `CompTimeArgs<T>` is fully literal at build time —
// either at the call site, or via a module-scope `const` whose
// initializer is itself entirely literal.
//
// Accepted leaves:
//   - String / numeric / bigint / boolean / null literals
//   - `undefined` (the identifier reference)
//   - No-substitution template literals (backticks without ${…})
//   - Regex literals
//   - Arrow / function expressions (a function definition is itself a
//     literal value at the AST level)
//
// Accepted containers (each member must recurse to a leaf or another
// container):
//   - Object literals (`{key: value, ...}`) — computed keys and non-literal
//     shorthand bindings are rejected.
//   - Array literals (`[…]`).
//   - Spread of a statically-resolvable container fragment: `{...base, k: v}`
//     when `base` resolves (inline or a same-/cross-module `const`) to an
//     OBJECT literal, and `[...members, x]` when `members` resolves to an
//     ARRAY literal — each merged member is validated recursively. A spread
//     whose operand resolves to the wrong container kind (object spread of an
//     array, or vice-versa) or to a dynamic / non-`const` value is rejected.
//
// Accepted indirections (with const-chain trace, depth-capped at 16
// — same as the regex literal trace in resolver):
//   - `const x = <literal>; fn(x)` → traces the identifier to its
//     `const` initializer and re-validates that initializer.
//   - `as T` and parenthesised expressions are unwrapped transparently.
//
// Rejected constructs (any of these inside the literal produces a
// CTA003 diagnostic with the construct name in arg[0]):
//   - Spread of a dynamic / shape-mismatched operand (`...fn()`,
//     `...(cond ? a : b)`, object spread of an array fragment)
//   - Computed property names (`{[key]: 1}`)
//   - Function calls (`fn()`)
//   - Property / element access (`a.b`, `a[b]`)
//   - Ternary (`a ? b : c`)
//   - Template-literal substitution (` `${x}` `)
//   - Binary expressions other than negation of a numeric literal
//   - `let` / `var` bindings (only `const` is traceable)
package comptimeargs

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// DepthCap mirrors the resolver's traceRegexLiteral depth cap. Past 16
// recursions the validator gives up with ExceededDepth=true.
const DepthCap = 16

// FailKind describes why a CheckLiteral / CheckLiteralFunction failed.
// Each kind maps to a distinct diagnostic code at the resolver layer.
type FailKind int

const (
	// FailNone means validation succeeded.
	FailNone FailKind = iota
	// FailNonLiteral means the leaf isn't a literal and the const-trace
	// couldn't follow it to one (CTA001).
	FailNonLiteral
	// FailDepthExceeded means the literal-walk hit DepthCap (CTA002).
	FailDepthExceeded
	// FailForbiddenConstruct means a recognised non-literal construct
	// appeared inside the literal (CTA003). Reason carries the construct
	// name.
	FailForbiddenConstruct
	// FailWidenedConst means a comptime arg traced to a `const` whose TYPE
	// carries a widened (non-literal) value — e.g. `{strategy: 'mutate'}`
	// widened to `{strategy: string}` for want of an `as const`. The AST
	// initializer is literal, but the widened type lets TypeScript's
	// overload/return selection disagree with the value the scanner reads,
	// so we reject it (CTA004). Reason carries the offending member name.
	FailWidenedConst
	// FailExternalHandle means a PureFunction<F> literal is reachable as a
	// value from outside the AOT-compiled copy — it is imported or exported
	// (PFN002). Reason carries "imported" / "exported".
	FailExternalHandle
)

// Result reports the outcome of a CheckLiteral / CheckLiteralFunction
// call. Ok=true means validation passed; otherwise Kind tells the caller
// which diagnostic to emit and FailingNode points at the AST node
// responsible (for diagnostic span). Reason carries the construct name
// for FailForbiddenConstruct, or a short human-readable explanation for
// the other failure kinds.
type Result struct {
	Ok          bool
	Kind        FailKind
	Reason      string
	FailingNode *ast.Node
}

// CheckLiteral validates that node is a literal (or const-traceable
// chain ending in one) per the package contract. Pass depth=0 from the
// resolver entry point.
// isBuilderCall, when non-nil, reports whether a CallExpression node is a
// recognized value-first builder (RT.string(), RT.object({…}), …). Such a call
// is a valid CompTimeArgs leaf — it self-validates its own CompTimeArgs params
// on its own scan visit, so the walk STOPS at it rather than recursing into its
// args. nil means "no call is a builder" (current behavior for callers that
// don't supply the predicate), so every call stays a forbidden construct.
type isBuilderCall = func(*ast.Node) bool

func CheckLiteral(typeChecker *checker.Checker, node *ast.Node, depth int, builderCall isBuilderCall) Result {
	if depth > DepthCap {
		return Result{Ok: false, Kind: FailDepthExceeded, Reason: "depth cap exceeded", FailingNode: node}
	}
	unwrapped := UnwrapWrappers(node)
	if unwrapped == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil node", FailingNode: node}
	}
	if isLiteralLeaf(unwrapped) {
		return Result{Ok: true}
	}
	switch unwrapped.Kind {
	case ast.KindArrowFunction, ast.KindFunctionExpression:
		return Result{Ok: true}
	case ast.KindObjectLiteralExpression:
		return checkObjectLiteral(typeChecker, unwrapped, depth, builderCall)
	case ast.KindArrayLiteralExpression:
		return checkArrayLiteral(typeChecker, unwrapped, depth, builderCall)
	case ast.KindPrefixUnaryExpression:
		// Accept `-1`, `+1`, `-1n` — sign-prefixed numeric / bigint literal.
		// Reject anything else (`!x`, `~x`, prefix on non-literal).
		return checkPrefixUnary(typeChecker, unwrapped, depth)
	case ast.KindCallExpression:
		// A recognized value-first builder call is a valid leaf — STOP, do not
		// recurse into its args (it self-validates on its own scan visit). Any
		// other call is a dynamic construct the build can't evaluate.
		if builderCall != nil && builderCall(unwrapped) {
			return Result{Ok: true}
		}
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "function call", FailingNode: unwrapped}
	case ast.KindIdentifier:
		return traceIdentifier(typeChecker, unwrapped, depth, builderCall)
	}
	return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: forbiddenConstructName(unwrapped.Kind), FailingNode: unwrapped}
}

// CheckLiteralFunction validates the PureFunction<F> argument under the
// LITERAL-ONLY rule: the only accepted form is an INLINE arrow / function
// expression (modulo `as`/parens/`satisfies` wrappers). A named reference —
// even a module-private `const f = …` or `function f(){}` — is rejected, so the
// literal has no handle anything else can reach: the build extracts and
// AOT-compiles the body, and the compiled copy must be the only one that can
// run. Returns the resolved function-literal node on success — the caller passes
// it to purefns.CheckPurity for the purity rules.
//
// Rejection codes, for a precise fix message:
//   - imported / exported reference → FailExternalHandle (PFN002): "inline it,
//     don't import or export it";
//   - any other named reference or non-function node → FailNonLiteral (PFN001):
//     "inline the function literal at the call site".
func CheckLiteralFunction(typeChecker *checker.Checker, node *ast.Node) (*ast.Node, Result) {
	unwrapped := UnwrapWrappers(node)
	if unwrapped == nil {
		return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "nil node", FailingNode: node}
	}
	switch unwrapped.Kind {
	case ast.KindArrowFunction, ast.KindFunctionExpression:
		return unwrapped, Result{Ok: true}
	case ast.KindIdentifier:
		// A named reference is never accepted. Distinguish the external-handle
		// case (imported / exported → PFN002) from a plain local binding
		// (→ PFN001 "inline it") so the diagnostic points at the right fix.
		symbol := typeChecker.GetSymbolAtLocation(unwrapped)
		if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
			return nil, Result{Ok: false, Kind: FailExternalHandle, Reason: "imported", FailingNode: unwrapped}
		}
		declaration := resolveConstDeclarationNode(typeChecker, unwrapped)
		if declaration == nil {
			if fnDecl, ok := resolveFunctionDeclaration(typeChecker, unwrapped); ok {
				declaration = fnDecl
			}
		}
		if externallyReachable(typeChecker, symbol, declaration) {
			return nil, Result{Ok: false, Kind: FailExternalHandle, Reason: "exported", FailingNode: unwrapped}
		}
		return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "named reference; inline the function literal at the call site", FailingNode: unwrapped}
	}
	return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "not an inline arrow or function expression", FailingNode: unwrapped}
}

// resolveFunctionDeclaration returns the top-level function declaration
// the identifier resolves to, or (nil, false) when the symbol either
// doesn't resolve or doesn't point at a function declaration. Mirrors
// resolveConstInitializer's symbol-walk but matches FunctionDeclaration
// instead of VariableDeclaration; the declaration node IS the function
// literal, so callers treat it the same way as an arrow / function
// expression at the leaf.
func resolveFunctionDeclaration(typeChecker *checker.Checker, identifier *ast.Node) (*ast.Node, bool) {
	if typeChecker == nil || identifier == nil {
		return nil, false
	}
	symbol := typeChecker.GetSymbolAtLocation(identifier)
	if symbol == nil {
		return nil, false
	}
	for _, declaration := range symbol.Declarations {
		if declaration != nil && declaration.Kind == ast.KindFunctionDeclaration {
			return declaration, true
		}
	}
	return nil, false
}

// externallyReachable reports whether the same-module declaration a pure-fn
// identifier resolves to is exported in any form — `export const f`, `export
// function f`, `export default`, or a later `export {f}` / re-export. The
// imported case (an alias symbol) is handled by the caller before this runs.
// Three complementary signals: the inline `export` keyword in the declaration's
// combined modifier flags (covers `export const` / `export function` / `export
// default`), the binder's Symbol.ExportSymbol link, and — for the separate
// `export {f}` statement, which leaves no modifier on the declaration — an
// export-specifier scan that resolves each exported name back to this symbol.
func externallyReachable(typeChecker *checker.Checker, symbol *ast.Symbol, declarationNode *ast.Node) bool {
	if symbol != nil && symbol.ExportSymbol != nil {
		return true
	}
	if declarationNode == nil {
		return false
	}
	if ast.GetCombinedModifierFlags(declarationNode)&ast.ModifierFlagsExport != 0 {
		return true
	}
	sourceFile := ast.GetSourceFileOfNode(declarationNode)
	if sourceFile == nil {
		return false
	}
	return symbolReExported(typeChecker, symbol, sourceFile.AsNode())
}

// symbolReExported reports whether any `export { … }` specifier in the file
// names this symbol (a separate `export {f}` or `export {f as g}` statement —
// the local declaration carries no `export` modifier). Each specifier's exported
// name is resolved through its import alias and compared to the target symbol,
// so a re-export of a DIFFERENT module's binding (which resolves elsewhere) is
// correctly ignored.
func symbolReExported(typeChecker *checker.Checker, symbol *ast.Symbol, root *ast.Node) bool {
	if typeChecker == nil || symbol == nil || root == nil {
		return false
	}
	found := false
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil || found {
			return false
		}
		if node.Kind == ast.KindExportSpecifier {
			specifier := node.AsExportSpecifier()
			if specifier != nil && specifier.Name() != nil {
				if resolved := ResolveImportAlias(typeChecker, typeChecker.GetSymbolAtLocation(specifier.Name())); resolved != nil && resolved == symbol {
					found = true
					return false
				}
			}
		}
		node.ForEachChild(visit)
		return false
	}
	root.ForEachChild(visit)
	return found
}

// resolveConstDeclarationNode returns the `const` VariableDeclaration NODE the
// identifier resolves to (same-module), or nil. The node — not just the
// initializer — is what externallyReachable needs for its export-modifier
// check; GetCombinedModifierFlags walks up from the declaration to the
// VariableStatement that carries an `export` keyword.
func resolveConstDeclarationNode(typeChecker *checker.Checker, identifier *ast.Node) *ast.Node {
	if typeChecker == nil || identifier == nil {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(identifier)
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
			continue
		}
		parent := declaration.Parent
		if parent == nil || parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		return declaration
	}
	return nil
}

// ResolveLiteralString is the string-typed analogue of CheckLiteralFunction.
// Validates that node is a string literal (or a const-chain that ends in
// one) and returns the resolved literal node alongside the Result. The
// returned node is either KindStringLiteral or KindNoSubstitutionTemplateLiteral
// — call .Text() on it to read the underlying text.
//
// Used by call-site extractors (purefns walker, deps) that need the literal
// node's text content, not just a pass/fail verdict. CheckLiteral remains
// the right choice when only the verdict matters.
func ResolveLiteralString(typeChecker *checker.Checker, node *ast.Node) (*ast.Node, Result) {
	return resolveLiteralStringRecursive(typeChecker, node, 0)
}

func resolveLiteralStringRecursive(typeChecker *checker.Checker, node *ast.Node, depth int) (*ast.Node, Result) {
	if depth > DepthCap {
		return nil, Result{Ok: false, Kind: FailDepthExceeded, Reason: "depth cap exceeded", FailingNode: node}
	}
	unwrapped := UnwrapWrappers(node)
	if unwrapped == nil {
		return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "nil node", FailingNode: node}
	}
	switch unwrapped.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return unwrapped, Result{Ok: true}
	case ast.KindIdentifier:
		initializer, ok := resolveConstInitializer(typeChecker, unwrapped)
		if !ok {
			return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "identifier not a same-module `const` binding to a string literal", FailingNode: unwrapped}
		}
		return resolveLiteralStringRecursive(typeChecker, initializer, depth+1)
	}
	return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "not a string literal", FailingNode: unwrapped}
}

// UnwrapWrappers strips `as T`, parenthesised and `satisfies T` wrappers
// off an expression, returning the underlying node (nil for nil/malformed
// input). Exported because every AST-level literal recovery must agree on
// the wrapper set — the typeid format-param recovery shares it so a
// `satisfies`-wrapped value-first param behaves exactly like the
// CompTimeArgs validation that accepted it.
func UnwrapWrappers(node *ast.Node) *ast.Node {
	for node != nil {
		switch node.Kind {
		case ast.KindAsExpression:
			asExpression := node.AsAsExpression()
			if asExpression == nil {
				return nil
			}
			node = asExpression.Expression
		case ast.KindParenthesizedExpression:
			parenExpression := node.AsParenthesizedExpression()
			if parenExpression == nil {
				return nil
			}
			node = parenExpression.Expression
		case ast.KindSatisfiesExpression:
			satisfiesExpression := node.AsSatisfiesExpression()
			if satisfiesExpression == nil {
				return nil
			}
			node = satisfiesExpression.Expression
		default:
			return node
		}
	}
	return nil
}

func isLiteralLeaf(node *ast.Node) bool {
	switch node.Kind {
	case ast.KindStringLiteral,
		ast.KindNoSubstitutionTemplateLiteral,
		ast.KindNumericLiteral,
		ast.KindBigIntLiteral,
		ast.KindTrueKeyword,
		ast.KindFalseKeyword,
		ast.KindNullKeyword,
		ast.KindRegularExpressionLiteral:
		return true
	case ast.KindIdentifier:
		// `undefined` is parsed as an identifier reference, not a
		// keyword. Accept only the exact identifier name — any user
		// binding called `undefined` is a malpractice we don't try to
		// support here.
		return node.Text() == "undefined"
	}
	return false
}

func checkObjectLiteral(typeChecker *checker.Checker, node *ast.Node, depth int, builderCall isBuilderCall) Result {
	objectLiteral := node.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return Result{Ok: true}
	}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil {
			continue
		}
		switch property.Kind {
		case ast.KindPropertyAssignment:
			propertyAssignment := property.AsPropertyAssignment()
			if propertyAssignment == nil {
				return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil property assignment", FailingNode: property}
			}
			name := propertyAssignment.Name()
			if name != nil && name.Kind == ast.KindComputedPropertyName {
				return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "computed property name", FailingNode: name}
			}
			if propertyAssignment.Initializer == nil {
				return Result{Ok: false, Kind: FailNonLiteral, Reason: "property has no initializer", FailingNode: property}
			}
			result := CheckLiteral(typeChecker, propertyAssignment.Initializer, depth+1, builderCall)
			if !result.Ok {
				return result
			}
		case ast.KindShorthandPropertyAssignment:
			// Trace the identifier through const-chain to a literal.
			shorthand := property.AsShorthandPropertyAssignment()
			if shorthand == nil || shorthand.Name() == nil {
				return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil shorthand property", FailingNode: property}
			}
			result := traceIdentifier(typeChecker, shorthand.Name(), depth+1, builderCall)
			if !result.Ok {
				return result
			}
		case ast.KindSpreadAssignment:
			result := checkObjectSpread(typeChecker, property, depth, builderCall)
			if !result.Ok {
				return result
			}
		default:
			return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: forbiddenConstructName(property.Kind), FailingNode: property}
		}
	}
	return Result{Ok: true}
}

func checkArrayLiteral(typeChecker *checker.Checker, node *ast.Node, depth int, builderCall isBuilderCall) Result {
	arrayLiteral := node.AsArrayLiteralExpression()
	if arrayLiteral == nil || arrayLiteral.Elements == nil {
		return Result{Ok: true}
	}
	for _, element := range arrayLiteral.Elements.Nodes {
		if element == nil {
			continue
		}
		if element.Kind == ast.KindSpreadElement {
			if result := checkArraySpread(typeChecker, element, depth, builderCall); !result.Ok {
				return result
			}
			continue
		}
		result := CheckLiteral(typeChecker, element, depth+1, builderCall)
		if !result.Ok {
			return result
		}
	}
	return Result{Ok: true}
}

// checkObjectSpread validates an object-spread element (`{...operand}`). The
// operand must statically resolve to an OBJECT literal — inline, or a `const`
// fragment (possibly imported) — whose own members are all literal. TypeScript
// itself performs the type-level merge, so once the operand validates the
// builder reflects the merged type for free. Anything else (an array fragment,
// a scalar `const`, a dynamic call / ternary, a non-`const` binding) is
// rejected with a single CTA003 reason: a spread that can't be statically
// merged into an object has no compile-time value to read. Rejecting on the
// resolved KIND (rather than re-validating the operand as a bare literal) is
// the load-bearing soundness choice — a scalar `const` IS a valid literal leaf
// but is NOT a valid object-spread operand.
func checkObjectSpread(typeChecker *checker.Checker, property *ast.Node, depth int, builderCall isBuilderCall) Result {
	spread := property.AsSpreadAssignment()
	if spread == nil || spread.Expression == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil spread operand", FailingNode: property}
	}
	container, ok := ResolveSpreadContainer(typeChecker, spread.Expression)
	if !ok || container.Kind != ast.KindObjectLiteralExpression {
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "object spread of a non-object operand", FailingNode: property}
	}
	return CheckLiteral(typeChecker, container, depth+1, builderCall)
}

// checkArraySpread is the array-element analogue of checkObjectSpread: the
// operand must resolve to an ARRAY literal (inline or a `const` fragment).
// An object fragment, a scalar `const`, or a dynamic / non-`const` operand is
// rejected with one CTA003 reason — same soundness choice as the object form.
func checkArraySpread(typeChecker *checker.Checker, element *ast.Node, depth int, builderCall isBuilderCall) Result {
	spread := element.AsSpreadElement()
	if spread == nil || spread.Expression == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil spread operand", FailingNode: element}
	}
	container, ok := ResolveSpreadContainer(typeChecker, spread.Expression)
	if !ok || container.Kind != ast.KindArrayLiteralExpression {
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "array spread of a non-array operand", FailingNode: element}
	}
	return CheckLiteral(typeChecker, container, depth+1, builderCall)
}

func checkPrefixUnary(typeChecker *checker.Checker, node *ast.Node, depth int) Result {
	prefixUnary := node.AsPrefixUnaryExpression()
	if prefixUnary == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil prefix-unary", FailingNode: node}
	}
	if prefixUnary.Operator != ast.KindPlusToken && prefixUnary.Operator != ast.KindMinusToken {
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "unary operator other than + / -", FailingNode: node}
	}
	operand := UnwrapWrappers(prefixUnary.Operand)
	if operand == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil prefix-unary operand", FailingNode: node}
	}
	if operand.Kind != ast.KindNumericLiteral && operand.Kind != ast.KindBigIntLiteral {
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "sign prefix on non-numeric literal", FailingNode: operand}
	}
	_ = depth
	_ = typeChecker
	return Result{Ok: true}
}

func traceIdentifier(typeChecker *checker.Checker, node *ast.Node, depth int, builderCall isBuilderCall) Result {
	if depth > DepthCap {
		return Result{Ok: false, Kind: FailDepthExceeded, Reason: "depth cap exceeded", FailingNode: node}
	}
	// `undefined` is a literal leaf (see isLiteralLeaf); honour it here
	// too so shorthand-property `{undefined}` works.
	if node.Text() == "undefined" {
		return Result{Ok: true}
	}
	// CompTimeArgs identifiers resolve CROSS-MODULE (parity with the spread
	// trace): an imported `const` fragment / option bag / builder child is
	// followed through its import alias to the originating declaration. The
	// pure-fn and string-literal traces keep their own same-module resolvers,
	// so this cross-module hop is scoped to the literal-value walk.
	initializer, ok := resolveConstInitializerCrossModule(typeChecker, node)
	if !ok {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "identifier not a `const` binding to a literal", FailingNode: node}
	}
	// `as const` guard, scoped to a const that binds an OBJECT LITERAL — option
	// bags and literal-valued objects, the case where member values widen
	// (`{strategy: 'mutate'}` → `{strategy: string}` for want of an `as const`).
	// A const bound to a builder call (`const s = string()`), a ternary, or an
	// array is NOT walked: its type is a RunType / non-object whose members would
	// false-positive. The guard matters because a widened option bag lets
	// TypeScript's overload selection pick one fn variant while the scanner reads
	// the AST and injects another — `as const` keeps the two in lockstep.
	if container := UnwrapWrappers(initializer); container != nil && container.Kind == ast.KindObjectLiteralExpression {
		if member, widened := firstWidenedComptimeMember(typeChecker, node); widened {
			return Result{Ok: false, Kind: FailWidenedConst, Reason: member, FailingNode: node}
		}
	}
	return CheckLiteral(typeChecker, initializer, depth+1, builderCall)
}

// eachConstVariableDeclaration walks the `const` VariableDeclarations of
// the identifier's symbol, calling visit on each until it returns false.
// `let` / `var` are skipped because they can be reassigned, so neither
// the initializer nor the annotation determines the value at the call
// site. The single symbol→declarations walk behind resolveConstInitializer
// and ConstTypeAnnotation.
func eachConstVariableDeclaration(typeChecker *checker.Checker, identifier *ast.Node, visit func(*ast.VariableDeclaration) bool) {
	if typeChecker == nil || identifier == nil {
		return
	}
	EachConstVariableDeclaration(typeChecker.GetSymbolAtLocation(identifier), visit)
}

// EachConstVariableDeclaration is the symbol-level walk behind the
// identifier form — exported so callers that resolve the symbol
// themselves first (e.g. the typeid format-param recovery, which follows
// import aliases before walking) reuse the same const filter.
func EachConstVariableDeclaration(symbol *ast.Symbol, visit func(*ast.VariableDeclaration) bool) {
	if symbol == nil {
		return
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
			continue
		}
		parent := declaration.Parent
		if parent == nil || parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		variableDecl := declaration.AsVariableDeclaration()
		if variableDecl == nil {
			continue
		}
		if !visit(variableDecl) {
			return
		}
	}
}

// resolveConstInitializer returns the initializer expression of the
// `const` variable declaration the identifier resolves to, or
// (nil, false) when the identifier doesn't resolve, isn't a
// VariableDeclaration, isn't `const`, or has no initializer.
//
// Mirrors the resolver-side resolveRegexLiteral const-chain trace.
func resolveConstInitializer(typeChecker *checker.Checker, identifier *ast.Node) (*ast.Node, bool) {
	var initializer *ast.Node
	eachConstVariableDeclaration(typeChecker, identifier, func(variableDecl *ast.VariableDeclaration) bool {
		if variableDecl.Initializer == nil {
			return true
		}
		initializer = variableDecl.Initializer
		return false
	})
	return initializer, initializer != nil
}

// resolveConstInitializerCrossModule is the import-alias-following twin of
// resolveConstInitializer used by the CompTimeArgs literal walk. It mirrors the
// spread trace (ResolveSpreadContainer): the identifier's symbol is followed
// through any import aliases to the originating `const`, so an imported fragment
// / option bag / builder child resolves the same way as a same-module one. Kept
// separate from resolveConstInitializer so the same-module-only pure-fn and
// string-literal traces are unaffected.
func resolveConstInitializerCrossModule(typeChecker *checker.Checker, identifier *ast.Node) (*ast.Node, bool) {
	if typeChecker == nil || identifier == nil {
		return nil, false
	}
	symbol := ResolveImportAlias(typeChecker, typeChecker.GetSymbolAtLocation(identifier))
	var initializer *ast.Node
	EachConstVariableDeclaration(symbol, func(variableDecl *ast.VariableDeclaration) bool {
		if variableDecl.Initializer == nil {
			return true
		}
		initializer = variableDecl.Initializer
		return false
	})
	return initializer, initializer != nil
}

// firstWidenedComptimeMember reports the first TOP-LEVEL property of the const's
// resolved object TYPE that is a widened primitive base — a value that lost its
// literal type because the const was not declared `as const` (`{a: 'x'}` →
// `{a: string}`). Returns (propertyName, true) for the offending property,
// ("", false) when every primitive property is literal. The walk is
// deliberately shallow and object-only: a property whose type is itself an
// object is a value-first builder result (e.g. `number()` → a RunType) or a
// nested literal whose internals must NOT be mistaken for widened comptime
// values, so it is left alone. The caller only invokes this for a const bound to
// an object literal, so a non-object resolved type is a no-op guard.
func firstWidenedComptimeMember(typeChecker *checker.Checker, identifier *ast.Node) (string, bool) {
	if typeChecker == nil || identifier == nil {
		return "", false
	}
	constType := typeChecker.GetTypeAtLocation(identifier)
	if constType == nil || constType.Flags()&checker.TypeFlagsObject == 0 || checker.IsTupleType(constType) {
		return "", false
	}
	for _, symbol := range typeChecker.GetPropertiesOfType(constType) {
		if isWidenedPrimitive(typeChecker.GetTypeOfSymbol(symbol)) {
			return symbol.Name, true
		}
	}
	return "", false
}

// isWidenedPrimitive reports whether tsType is a base primitive (string /
// number / boolean / bigint) that has LOST its literal type — i.e. the base
// flag is set but the corresponding literal flag is not. A literal type
// (`'mutate'`, `5`, `true`) returns false; so does any non-primitive.
func isWidenedPrimitive(tsType *checker.Type) bool {
	if tsType == nil {
		return false
	}
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsStringLiteral != 0,
		flags&checker.TypeFlagsNumberLiteral != 0,
		flags&checker.TypeFlagsBooleanLiteral != 0,
		flags&checker.TypeFlagsBigIntLiteral != 0:
		return false
	case flags&checker.TypeFlagsString != 0,
		flags&checker.TypeFlagsNumber != 0,
		flags&checker.TypeFlagsBoolean != 0,
		flags&checker.TypeFlagsBigInt != 0:
		return true
	}
	return false
}

// ConstTypeAnnotation returns the written type-annotation node of the
// `const` variable declaration the identifier resolves to, or
// (nil, false) when there is no const binding or it carries no
// annotation. Exported for the resolver's reflect-form annotation
// honoring (`const v: T = literal; createValidateFn(v)` reads `T`, not
// CFA's narrowed apparent type).
func ConstTypeAnnotation(typeChecker *checker.Checker, identifier *ast.Node) (*ast.Node, bool) {
	var typeNode *ast.Node
	eachConstVariableDeclaration(typeChecker, identifier, func(variableDecl *ast.VariableDeclaration) bool {
		if variableDecl.Type == nil {
			return true
		}
		typeNode = variableDecl.Type
		return false
	})
	return typeNode, typeNode != nil
}

// forbiddenConstructName returns the short label used in CTA003
// diagnostics for the construct at the given AST kind. Keep names short
// and user-recognisable — they appear in error messages.
func forbiddenConstructName(kind ast.Kind) string {
	switch kind {
	case ast.KindSpreadElement, ast.KindSpreadAssignment:
		return "spread"
	case ast.KindCallExpression:
		return "function call"
	case ast.KindPropertyAccessExpression:
		return "property access"
	case ast.KindElementAccessExpression:
		return "element access"
	case ast.KindConditionalExpression:
		return "ternary expression"
	case ast.KindTemplateExpression:
		return "template-string substitution"
	case ast.KindBinaryExpression:
		return "binary expression"
	case ast.KindComputedPropertyName:
		return "computed property name"
	case ast.KindNewExpression:
		return "new expression"
	case ast.KindTypeOfExpression:
		return "typeof expression"
	case ast.KindAwaitExpression:
		return "await expression"
	case ast.KindYieldExpression:
		return "yield expression"
	}
	return "non-literal expression"
}
