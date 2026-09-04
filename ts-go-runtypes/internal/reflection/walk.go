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

// WalkGraph visits every node reachable from root, once each. A KindRef slot
// is resolved through refTable before it is visited (an unresolvable ref is
// skipped), a node is never visited twice (cycle guard on id; an id-less node
// is visited every time it is reached), and descent goes through EachRefSlot,
// so a slot added to RunType reaches every pass built on this walk without a
// change here.
//
// This is THE walk for a standalone pass that asks a whole-type question (a
// build rule, a "does this graph contain X" predicate). A hand-rolled
// `for _, child := range node.Children` reaches only one of the child slots
// and is exactly the shape that produced the nested-node bugs; the emit
// walker in cachegen/typefunctions is the one other descent, and it too
// covers every slot its emitters can render. The kind-aware noop and
// compat predicates in cachegen/typefunctions are NOT candidates: each
// mirrors its emitter's own kind arms and must stay per-kind.
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

// ResolveRef returns the node a KindRef slot points at (nil when the ref table
// has no such id), or the node itself when it is not a ref.
func ResolveRef(node *RunType, refTable map[string]*RunType) *RunType {
	if node == nil || node.Kind != KindRef {
		return node
	}
	return refTable[node.ID]
}
