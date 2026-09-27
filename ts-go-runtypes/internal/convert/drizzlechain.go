package convert

// The one method-chain walker of the drizzle arms: convert reads extraConfig entries through it, and
// drizzle-migrate folds drizzle's chained column calls into the single-call props object with it.

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
)

// CallChainLink is one method call of a chain: the method name and its call node.
type CallChainLink struct {
	Method string
	Call   *ast.Node
}

// WalkCallChain splits `base(…).m1(…).m2(…)` into the innermost call and its method links in call order.
func WalkCallChain(expr *ast.Node) (base *ast.Node, links []CallChainLink, ok bool) {
	current := expr
	for current != nil && ast.IsCallExpression(current) {
		callee := current.AsCallExpression().Expression
		if callee != nil && ast.IsPropertyAccessExpression(callee) {
			access := callee.AsPropertyAccessExpression()
			if access.Expression != nil && ast.IsCallExpression(access.Expression) {
				links = append(links, CallChainLink{Method: access.Name().Text(), Call: current})
				current = access.Expression
				continue
			}
		}
		for left, right := 0, len(links)-1; left < right; left, right = left+1, right-1 {
			links[left], links[right] = links[right], links[left]
		}
		return current, links, true
	}
	return nil, nil, false
}

// IsDrizzleModName reports whether a props key is a modifier call rather than one of the builder's own config keys.
func IsDrizzleModName(name string) bool { return drizzleModNames[name] }

// IsDrizzleRuntimeMod reports whether a modifier takes a callback, which a type cannot spell.
func IsDrizzleRuntimeMod(name string) bool {
	return name == "$default" || name == "$defaultFn" || name == "$onUpdate" || name == "$onUpdateFn"
}

// ColumnChainProps walks a drizzle column chain; refusal says why a link cannot fold into one props member.
func ColumnChainProps(expr *ast.Node) (base *ast.Node, links []CallChainLink, refusal string) {
	base, links, ok := WalkCallChain(expr)
	if !ok {
		return nil, nil, "a column must be a builder call"
	}
	seen := map[string]bool{}
	for _, link := range links {
		call := link.Call.AsCallExpression()
		argCount := 0
		if call.Arguments != nil {
			argCount = len(call.Arguments.Nodes)
		}
		switch {
		case !IsDrizzleModName(link.Method):
			return nil, nil, fmt.Sprintf(".%s() is not a column modifier the single-call builders take", link.Method)
		case seen[link.Method]:
			return nil, nil, fmt.Sprintf(".%s() is applied more than once, and the props object holds each modifier once", link.Method)
		case link.Method == "$type" && (argCount != 0 || call.TypeArguments == nil || len(call.TypeArguments.Nodes) != 1):
			return nil, nil, ".$type() needs exactly one type argument and no value argument"
		case IsDrizzleRuntimeMod(link.Method) && argCount != 1:
			return nil, nil, fmt.Sprintf(".%s() takes exactly one callback", link.Method)
		}
		seen[link.Method] = true
	}
	return base, links, ""
}
