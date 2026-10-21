package reflection

// WalkAction is what a WalkGraph visitor returns for the node it was handed.
type WalkAction int

const (
	// WalkContinue descends into the node's children.
	WalkContinue WalkAction = iota
	// WalkSkipChildren keeps the node but does not descend into it.
	WalkSkipChildren
	// WalkStop ends the whole walk.
	WalkStop
)

// WalkGraph visits every node reachable from root once: a KindRef slot is resolved through refTable first (an
// unresolvable ref is skipped), an id-bearing node is visited once and an id-less one every time it is reached,
// and descent goes through EachRefSlot, so a slot added to RunType reaches every pass built on this walk.
//
// THE walk for a standalone pass asking a whole-type question. A hand-rolled
// `for _, child := range node.Children` reaches one child slot only and is the shape that produced the
// nested-node bugs. The kind-aware noop and compat predicates in cachegen/typefunctions are NOT candidates:
// each mirrors its own emitter's kind arms and must stay per-kind.
func WalkGraph(root *RunType, refTable map[string]*RunType, visit func(node *RunType) WalkAction) {
	visited := map[string]bool{}
	stopped := false
	var walk func(node *RunType)
	walk = func(node *RunType) {
		if stopped || node == nil {
			return
		}
		if node.Kind == KindRef {
			node = refTable[node.ID]
			if node == nil {
				return
			}
		}
		if node.ID != "" {
			if visited[node.ID] {
				return
			}
			visited[node.ID] = true
		}
		switch visit(node) {
		case WalkStop:
			stopped = true
			return
		case WalkSkipChildren:
			return
		}
		node.EachRefSlot(func(child *RunType) {
			if !stopped {
				walk(child)
			}
		})
	}
	walk(root)
}

// ResolveRef returns the node a KindRef slot points at (nil when refTable has no such id), or node itself.
func ResolveRef(node *RunType, refTable map[string]*RunType) *RunType {
	if node == nil || node.Kind != KindRef {
		return node
	}
	return refTable[node.ID]
}
