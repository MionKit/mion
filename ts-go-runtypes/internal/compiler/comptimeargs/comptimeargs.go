// Package comptimeargs validates that an argument passed to a `CompTimeArgs<T>` parameter is fully
// literal at build time: a literal leaf, a literal container, or a `const` chain (cross-module for
// the value walk) that ends in one, with `as T` / parens / `satisfies` unwrapped. Anything the build
// cannot evaluate — a call, a ternary, property access, a template substitution, a computed key, a
// `let` / `var` binding, a spread whose operand is dynamic or the wrong container kind — is rejected
// with a CTA003 carrying the construct name in arg[0].
package comptimeargs

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// DepthCap bounds every trace in this package; past it the walk gives up with FailDepthExceeded.
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
	// FailWidenedConst means a comptime arg traced to a `const` whose TYPE carries a widened value
	// (`{strategy: 'mutate'}` widened to `{strategy: string}` for want of an `as const`). The AST
	// initializer is literal, but the widened type lets TypeScript's overload selection disagree with
	// the value the scanner reads, so it is rejected (CTA004). Reason carries the member name.
	FailWidenedConst
	// FailExternalHandle means a PureFunction<F> literal is reachable as a
	// value from outside the AOT-compiled copy — it is imported or exported
	// (PFN002). Reason carries "imported" / "exported".
	FailExternalHandle
)

// Result reports the outcome of a check: Kind tells the caller which diagnostic to emit,
// FailingNode gives its span, and Reason carries the construct name for FailForbiddenConstruct or a
// short explanation for the other kinds.
type Result struct {
	Ok          bool
	Kind        FailKind
	Reason      string
	FailingNode *ast.Node
}

// Policy carries the two marker-aware questions the walk cannot answer on its own: only the
// resolver holds the marker options, so it builds both. A nil field answers "no", the conservative
// verdict.
type Policy struct {
	// IsBuilderCall reports whether a CallExpression is a recognized value-first builder
	// (RT.string(), RT.object({…}), …). Such a call is a valid CompTimeArgs leaf: it self-validates
	// its own CompTimeArgs params on its own scan visit, so the walk STOPS at it rather than
	// recursing into its args. nil leaves every call a forbidden construct.
	IsBuilderCall func(*ast.Node) bool
	// IsForwardedParam reports whether an identifier resolves to a PARAMETER whose own annotation is
	// `CompTimeArgs<…>` — a forward, not a value to read: see traceIdentifier.
	IsForwardedParam func(*ast.Node) bool
}

// CheckLiteral validates that node is a literal, or a const-traceable chain ending in one, per the
// package contract. Pass depth=0 from the resolver entry point.
func CheckLiteral(typeChecker *checker.Checker, node *ast.Node, depth int, policy Policy) Result {
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
		return checkObjectLiteral(typeChecker, unwrapped, depth, policy)
	case ast.KindArrayLiteralExpression:
		return checkArrayLiteral(typeChecker, unwrapped, depth, policy)
	case ast.KindPrefixUnaryExpression:
		return checkPrefixUnary(typeChecker, unwrapped, depth)
	case ast.KindCallExpression:
		// A builder call is a valid leaf — STOP, do not recurse into its args (it self-validates on
		// its own scan visit). Any other call is a dynamic construct the build can't evaluate.
		if policy.IsBuilderCall != nil && policy.IsBuilderCall(unwrapped) {
			return Result{Ok: true}
		}
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "function call", FailingNode: unwrapped}
	case ast.KindIdentifier:
		return traceIdentifier(typeChecker, unwrapped, depth, policy)
	}
	return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: forbiddenConstructName(unwrapped.Kind), FailingNode: unwrapped}
}

// CheckLiteralFunction validates a PureFunction<F> argument under the LITERAL-ONLY rule: only an
// INLINE arrow / function expression is accepted. Even a module-private `const f = …` is rejected,
// so the literal has no handle anything else can reach — the build AOT-compiles the body and the
// compiled copy must be the only one that can run. The returned node goes to purefns.CheckPurity.
// An imported / exported reference fails as FailExternalHandle (PFN002), any other named reference
// or non-function node as FailNonLiteral (PFN001), so each gets its own fix message.
func CheckLiteralFunction(typeChecker *checker.Checker, node *ast.Node) (*ast.Node, Result) {
	unwrapped := UnwrapWrappers(node)
	if unwrapped == nil {
		return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "nil node", FailingNode: node}
	}
	switch unwrapped.Kind {
	case ast.KindArrowFunction, ast.KindFunctionExpression:
		return unwrapped, Result{Ok: true}
	case ast.KindIdentifier:
		// Distinguish the external-handle case (PFN002) from a plain local binding (PFN001) so the
		// diagnostic points at the right fix; neither is accepted.
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

// resolveFunctionDeclaration returns the function declaration the identifier resolves to. The
// declaration node IS the function literal, so callers treat it like an arrow expression at the leaf.
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

// externallyReachable reports whether the same-module declaration a pure-fn identifier resolves to
// is exported in any form; the imported case is handled by the caller before this runs. Three
// complementary signals are needed: the declaration's combined `export` modifier flags, the binder's
// Symbol.ExportSymbol link, and an export-specifier scan for a separate `export {f}` statement,
// which leaves no modifier on the declaration.
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

// symbolReExported reports whether any `export { … }` specifier in the file names this symbol. Each
// specifier's name is resolved through its import alias and compared to the target symbol, so a
// re-export of a DIFFERENT module's binding is correctly ignored.
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

// resolveConstDeclarationNode returns the same-module `const` VariableDeclaration NODE the
// identifier resolves to. The node, not the initializer, is what externallyReachable needs:
// GetCombinedModifierFlags walks up from it to the VariableStatement carrying the `export` keyword.
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

// ResolveLiteralString validates that node is a string literal, or a const-chain ending in one, and
// returns that literal node (KindStringLiteral or KindNoSubstitutionTemplateLiteral) with the
// Result. For call-site extractors that need the text; use CheckLiteral when only the verdict does.
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

// UnwrapWrappers strips `as T`, parenthesised and `satisfies T` wrappers off an expression.
// Exported because every AST-level literal recovery must agree on the wrapper set: the typeid
// format-param recovery shares it so a `satisfies`-wrapped value-first param behaves exactly like
// the CompTimeArgs validation that accepted it.
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
		// `undefined` is parsed as an identifier, not a keyword. Only the exact name is accepted; a
		// user binding called `undefined` is malpractice this does not try to support.
		return node.Text() == "undefined"
	}
	return false
}

func checkObjectLiteral(typeChecker *checker.Checker, node *ast.Node, depth int, policy Policy) Result {
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
			result := CheckLiteral(typeChecker, propertyAssignment.Initializer, depth+1, policy)
			if !result.Ok {
				return result
			}
		case ast.KindShorthandPropertyAssignment:
			shorthand := property.AsShorthandPropertyAssignment()
			if shorthand == nil || shorthand.Name() == nil {
				return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil shorthand property", FailingNode: property}
			}
			result := traceIdentifier(typeChecker, shorthand.Name(), depth+1, policy)
			if !result.Ok {
				return result
			}
		case ast.KindSpreadAssignment:
			result := checkObjectSpread(typeChecker, property, depth, policy)
			if !result.Ok {
				return result
			}
		default:
			return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: forbiddenConstructName(property.Kind), FailingNode: property}
		}
	}
	return Result{Ok: true}
}

func checkArrayLiteral(typeChecker *checker.Checker, node *ast.Node, depth int, policy Policy) Result {
	arrayLiteral := node.AsArrayLiteralExpression()
	if arrayLiteral == nil || arrayLiteral.Elements == nil {
		return Result{Ok: true}
	}
	for _, element := range arrayLiteral.Elements.Nodes {
		if element == nil {
			continue
		}
		if element.Kind == ast.KindSpreadElement {
			if result := checkArraySpread(typeChecker, element, depth, policy); !result.Ok {
				return result
			}
			continue
		}
		result := CheckLiteral(typeChecker, element, depth+1, policy)
		if !result.Ok {
			return result
		}
	}
	return Result{Ok: true}
}

// checkObjectSpread validates an object-spread element: the operand must statically resolve to an
// OBJECT literal (inline or a possibly-imported `const` fragment) whose members are all literal.
// TypeScript performs the type-level merge itself, so a validated operand reflects for free.
// Rejecting on the resolved KIND, rather than re-validating the operand as a bare literal, is the
// load-bearing soundness choice: a scalar `const` IS a valid literal leaf but not a valid operand.
func checkObjectSpread(typeChecker *checker.Checker, property *ast.Node, depth int, policy Policy) Result {
	spread := property.AsSpreadAssignment()
	if spread == nil || spread.Expression == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil spread operand", FailingNode: property}
	}
	container, ok := ResolveSpreadContainer(typeChecker, spread.Expression)
	if !ok || container.Kind != ast.KindObjectLiteralExpression {
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "object spread of a non-object operand", FailingNode: property}
	}
	return CheckLiteral(typeChecker, container, depth+1, policy)
}

// checkArraySpread is the array-element analogue of checkObjectSpread: the operand must resolve to
// an ARRAY literal, same soundness choice as the object form.
func checkArraySpread(typeChecker *checker.Checker, element *ast.Node, depth int, policy Policy) Result {
	spread := element.AsSpreadElement()
	if spread == nil || spread.Expression == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil spread operand", FailingNode: element}
	}
	container, ok := ResolveSpreadContainer(typeChecker, spread.Expression)
	if !ok || container.Kind != ast.KindArrayLiteralExpression {
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "array spread of a non-array operand", FailingNode: element}
	}
	return CheckLiteral(typeChecker, container, depth+1, policy)
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

func traceIdentifier(typeChecker *checker.Checker, node *ast.Node, depth int, policy Policy) Result {
	if depth > DepthCap {
		return Result{Ok: false, Kind: FailDepthExceeded, Reason: "depth cap exceeded", FailingNode: node}
	}
	// `undefined` is a literal leaf (isLiteralLeaf); honour it here too so `{undefined}` works.
	if node.Text() == "undefined" {
		return Result{Ok: true}
	}
	// CompTimeArgs identifiers resolve CROSS-MODULE, parity with the spread trace. The pure-fn and
	// string-literal traces keep their own same-module resolvers, so the hop is scoped to this walk.
	initializer, ok := resolveConstInitializerCrossModule(typeChecker, node)
	if !ok {
		// A `CompTimeArgs` parameter FORWARDED into another CompTimeArgs position (`optional(field)`
		// handing its own `field` to `propMod`). The value cannot be here by construction: it arrives
		// from the enclosing function's call sites, and each of those is walked and demanded at that
		// outer position, so the literal is still required exactly once, where the author writes it.
		// Refusing it here only forces every wrapper, ours and a consumer's, to carry a suppression
		// comment. The injection markers already bless the same shape (the forwarded-handle rule).
		if policy.IsForwardedParam != nil && policy.IsForwardedParam(node) {
			return Result{Ok: true}
		}
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "identifier not a `const` binding to a literal", FailingNode: node}
	}
	// `as const` guard, scoped to a const binding an OBJECT LITERAL, the case where member values
	// widen. A const bound to a builder call (`const s = string()`), a ternary or an array is NOT
	// walked: its members would false-positive. The guard matters because a widened option bag lets
	// TypeScript's overload selection pick one fn variant while the scanner injects another.
	if container := UnwrapWrappers(initializer); container != nil && container.Kind == ast.KindObjectLiteralExpression {
		if member, widened := firstWidenedComptimeMember(typeChecker, node); widened {
			return Result{Ok: false, Kind: FailWidenedConst, Reason: member, FailingNode: node}
		}
	}
	return CheckLiteral(typeChecker, initializer, depth+1, policy)
}

// eachConstVariableDeclaration walks the `const` VariableDeclarations of the identifier's symbol
// until visit returns false. `let` / `var` are skipped because they can be reassigned, so neither
// the initializer nor the annotation determines the value at the call site.
func eachConstVariableDeclaration(typeChecker *checker.Checker, identifier *ast.Node, visit func(*ast.VariableDeclaration) bool) {
	if typeChecker == nil || identifier == nil {
		return
	}
	EachConstVariableDeclaration(typeChecker.GetSymbolAtLocation(identifier), visit)
}

// EachConstVariableDeclaration is the symbol-level walk behind the identifier form, exported so a
// caller that resolves the symbol itself first (the typeid format-param recovery follows import
// aliases before walking) reuses the same const filter.
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

// resolveConstInitializer returns the initializer of the same-module `const` declaration the
// identifier resolves to, or (nil, false) when there is no such `const` with an initializer.
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

// resolveConstInitializerCrossModule is the import-alias-following twin of resolveConstInitializer
// used by the CompTimeArgs literal walk, so an imported fragment resolves like a same-module one.
// Kept separate so the same-module-only pure-fn and string-literal traces are unaffected.
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

// firstWidenedComptimeMember reports the first TOP-LEVEL property of the const's resolved object
// TYPE that lost its literal type for want of an `as const` (`{a: 'x'}` → `{a: string}`). The walk
// is deliberately shallow and object-only: a property that is itself an object is a builder result
// or a nested literal whose internals must NOT be mistaken for widened comptime values.
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

// isWidenedPrimitive reports whether tsType is a base primitive that has LOST its literal type: the
// base flag is set and the literal flag is not.
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

// ConstTypeAnnotation returns the written type-annotation node of the `const` declaration the
// identifier resolves to. Exported for the resolver's reflect-form annotation honoring:
// `const v: T = literal; createValidateFn(v)` reads `T`, not CFA's narrowed apparent type.
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

// forbiddenConstructName returns the CTA003 label for an AST kind. Keep the names short and
// user-recognisable: they appear in error messages.
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
