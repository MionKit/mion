package typefunctions

import (
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// circular_skeleton.go computes the compile-time "circular skeleton" baked into
// an armed (`{rejectCircularRefs: true}`) guarded factory. The skeleton is the
// pruned graph of a type's cycle-capable positions: the property/element access
// paths that lead from one circular node to the next. At runtime the built-in
// pure fn `rt::findCycle(value, skeleton)` walks ONLY those edges with a
// descent stack local to itself and reports the first true reference cycle —
// replacing the previous whole-value, RunType-driven co-walk AND the RunType
// data bundle it needed. Only cycle-capable positions become skeleton nodes; the
// acyclic intermediates between them collapse into an edge's path segments.
//
// Runtime shape (see packages/run-types/src/runtypes/circular-pure-fns.ts):
//
//	{c: [1|0, …], e: [[{p:[seg,…], t:idx}, …], …]}
//
// Node 0 is always the guarded root. c[i] flags a TRACKED node (a circular type
// whose values ride the descent stack); the root is tracked iff it is itself
// circular. e[i] lists the outgoing circular edges from node i — each an access
// path `p` (segment list) to another tracked node `t`. Segment encodings:
//
//	["k", name]  value[name] (property or fixed tuple index; name string|number)
//	["a"]        iterate array elements
//	["s"]        iterate Set elements
//	["mk"|"mv"]  iterate Map keys / values
//	["i"]        iterate own-enumerable values (index signature)

// circSeg is one navigation step in a circular edge's access path.
type circSeg struct {
	kind    string // "k" | "a" | "s" | "mk" | "mv" | "i"
	keyName string // for "k": the property / tuple-index name
	keyNum  bool   // for "k": whether keyName is a numeric index (tuple slot)
}

// circEdge is one outgoing circular edge: the access path from a node's value to
// a tracked descendant, and the index of that tracked node.
type circEdge struct {
	path []circSeg
	to   int
}

// CircularSkeleton is the baked cycle-capable graph of a guarded root type.
type CircularSkeleton struct {
	tracked []bool       // tracked[i] — node i rides the descent stack (node 0 = root)
	edges   [][]circEdge // edges[i] — outgoing circular edges from node i
}

// BuildCircularSkeleton returns the circular skeleton for `root`, or nil when the
// type cannot cycle (no circular node reachable) — in which case the armed
// factory emits no guard at all (its body is byte-identical to the plain form,
// keyed differently; a harmless duplicate, per the rejectCircular design). The
// walk mirrors rt::findCycle's kind dispatch, but STOPS at each circular node
// instead of descending, recording the access path to it as an edge.
func BuildCircularSkeleton(root *reflection.RunType, refTable map[string]*reflection.RunType) *CircularSkeleton {
	if root == nil {
		return nil
	}
	circularIDs := reachableCircularIDs(root, refTable)
	if len(circularIDs) == 0 {
		return nil
	}

	builder := &circSkeletonBuilder{refTable: refTable, index: map[string]int{}, circular: circularIDs}
	// Node 0 is always the root; other circular nodes get indices 1..k (sorted for
	// determinism). If the root itself is circular it stays node 0 (never doubled).
	builder.index[root.ID] = 0
	others := make([]string, 0, len(circularIDs))
	for id := range circularIDs {
		if id != root.ID {
			others = append(others, id)
		}
	}
	sort.Strings(others)
	nodeIDs := append([]string{root.ID}, others...)
	for pos, id := range nodeIDs {
		builder.index[id] = pos
	}

	skeleton := &CircularSkeleton{
		tracked: make([]bool, len(nodeIDs)),
		edges:   make([][]circEdge, len(nodeIDs)),
	}
	for pos, id := range nodeIDs {
		node := root
		if id != root.ID {
			node = refTable[id]
		}
		skeleton.tracked[pos] = node != nil && node.IsCircular
		skeleton.edges[pos] = builder.computeEdges(node)
	}
	return skeleton
}

// circSkeletonBuilder holds the per-build state: the ref table, the assigned
// node indices, and the reachable-circular set + a memo for the leadsToCircular
// prune.
type circSkeletonBuilder struct {
	refTable map[string]*reflection.RunType
	index    map[string]int
	circular map[string]bool
	reaches  map[string]bool
}

// computeEdges walks `node`'s type subtree, recording an edge for every circular
// position it reaches (without descending INTO it — that node owns its own
// edges). Acyclic intermediates collapse into an edge's path. Non-circular
// subgraphs are DAGs, so the descent terminates; a path-local visited set is a
// belt-and-braces guard (a node can never legitimately repeat on one path).
func (builder *circSkeletonBuilder) computeEdges(node *reflection.RunType) []circEdge {
	var edges []circEdge
	var visit func(current *reflection.RunType, path []circSeg, onPath map[string]bool)
	visit = func(current *reflection.RunType, path []circSeg, onPath map[string]bool) {
		current = builder.resolve(current)
		if current == nil {
			return
		}
		builder.eachChildPosition(current, func(seg *circSeg, childType *reflection.RunType) {
			child := builder.resolve(childType)
			if child == nil {
				return
			}
			childPath := path
			if seg != nil {
				childPath = append(append([]circSeg{}, path...), *seg)
			}
			if builder.circular[child.ID] {
				edges = append(edges, circEdge{path: childPath, to: builder.index[child.ID]})
				return
			}
			if !builder.leadsToCircular(child) || onPath[child.ID] {
				return
			}
			onPath[child.ID] = true
			visit(child, childPath, onPath)
			delete(onPath, child.ID)
		})
	}
	visit(node, nil, map[string]bool{})
	return edges
}

// eachChildPosition yields (segment, childType) for every navigable child of a
// node, mirroring rt::findCycle's per-kind dispatch. A nil segment means the step
// is transparent (a union arm or a wrapper): the same value, no path segment.
func (builder *circSkeletonBuilder) eachChildPosition(node *reflection.RunType, visit func(seg *circSeg, childType *reflection.RunType)) {
	switch node.Kind {
	case reflection.KindObject, reflection.KindObjectLiteral, reflection.KindIntersection:
		builder.eachObjectMember(node, visit)
	case reflection.KindClass:
		switch node.SubKind {
		case reflection.SubKindMap:
			key, value := mapElementTypes(node)
			visit(&circSeg{kind: "mk"}, key)
			visit(&circSeg{kind: "mv"}, value)
		case reflection.SubKindSet:
			visit(&circSeg{kind: "s"}, setElementType(node))
		case reflection.SubKindNone:
			// User-defined class — validates structurally, walk like an object.
			builder.eachObjectMember(node, visit)
		default:
			// Date / Temporal / RegExp and other atomic builtins — no walkable children.
		}
	case reflection.KindArray:
		visit(&circSeg{kind: "a"}, node.Child)
	case reflection.KindTuple:
		for i, child := range node.Children {
			visit(&circSeg{kind: "k", keyName: strconv.Itoa(i), keyNum: true}, child)
		}
	case reflection.KindUnion:
		for _, arm := range node.Children {
			visit(nil, arm) // transparent — try each arm on the same value
		}
	case reflection.KindProperty, reflection.KindPropertySignature, reflection.KindParameter,
		reflection.KindTupleMember, reflection.KindRest:
		visit(nil, node.Child) // wrapper — unwrap, no segment
	}
}

// eachObjectMember visits an object/class's declared property members (by name)
// and its index signature (as an iterate-all-values step), skipping methods and
// unsupported members — matching rt::findCycle's walkObject.
func (builder *circSkeletonBuilder) eachObjectMember(node *reflection.RunType, visit func(seg *circSeg, childType *reflection.RunType)) {
	for _, raw := range node.Children {
		// Object members arrive as KindRef slots — resolve before reading their
		// Kind / Name / Child, or every property looks nameless and is skipped.
		member := builder.resolve(raw)
		if member == nil {
			continue
		}
		switch member.Kind {
		case reflection.KindMethod, reflection.KindMethodSignature:
			continue
		case reflection.KindIndexSignature:
			visit(&circSeg{kind: "i"}, member.Child)
			continue
		}
		if member.NotSupported || member.Name == "" || member.Child == nil {
			continue
		}
		visit(&circSeg{kind: "k", keyName: member.Name}, member.Child)
	}
}

// resolve dereferences a KindRef slot to its real node via the ref table.
func (builder *circSkeletonBuilder) resolve(node *reflection.RunType) *reflection.RunType {
	if node == nil {
		return nil
	}
	if node.Kind == reflection.KindRef {
		return builder.refTable[node.ID]
	}
	return node
}

// leadsToCircular reports whether node's ref closure contains a circular node —
// the prune that keeps the skeleton to only the edges that can reach a cycle.
func (builder *circSkeletonBuilder) leadsToCircular(node *reflection.RunType) bool {
	if builder.reaches == nil {
		builder.reaches = map[string]bool{}
	}
	if cached, ok := builder.reaches[node.ID]; ok {
		return cached
	}
	// Reserve to break the recursion on the (cyclic) type graph.
	builder.reaches[node.ID] = false
	found := false
	node.EachRefSlot(func(slot *reflection.RunType) {
		if found {
			return
		}
		resolved := builder.resolve(slot)
		if resolved == nil {
			return
		}
		if builder.circular[resolved.ID] || builder.leadsToCircular(resolved) {
			found = true
		}
	})
	builder.reaches[node.ID] = found
	return found
}

// reachableCircularIDs collects every node id flagged IsCircular in root's ref
// closure. BFS over ref slots, memo-free (single pass, small graphs).
func reachableCircularIDs(root *reflection.RunType, refTable map[string]*reflection.RunType) map[string]bool {
	circular := map[string]bool{}
	visited := map[string]bool{}
	resolve := func(node *reflection.RunType) *reflection.RunType {
		if node == nil {
			return nil
		}
		if node.Kind == reflection.KindRef {
			return refTable[node.ID]
		}
		return node
	}
	queue := []*reflection.RunType{root}
	for len(queue) > 0 {
		node := resolve(queue[len(queue)-1])
		queue = queue[:len(queue)-1]
		if node == nil || visited[node.ID] {
			continue
		}
		visited[node.ID] = true
		if node.IsCircular {
			circular[node.ID] = true
		}
		node.EachRefSlot(func(slot *reflection.RunType) { queue = append(queue, slot) })
	}
	return circular
}

// mapElementTypes returns a Map class's key and value element types (the
// `.child` of its two type arguments), mirroring rt::findCycle's walkMap.
func mapElementTypes(node *reflection.RunType) (key, value *reflection.RunType) {
	if len(node.Arguments) > 0 && node.Arguments[0] != nil {
		key = node.Arguments[0].Child
	}
	if len(node.Arguments) > 1 && node.Arguments[1] != nil {
		value = node.Arguments[1].Child
	}
	return key, value
}

// setElementType returns a Set class's element type (the `.child` of its first
// type argument), mirroring rt::findCycle's walkSet.
func setElementType(node *reflection.RunType) *reflection.RunType {
	if len(node.Arguments) > 0 && node.Arguments[0] != nil {
		return node.Arguments[0].Child
	}
	return nil
}

// JSLiteral renders the skeleton as the compact JS object literal baked into the
// armed factory closure and passed to rt::findCycle.
func (skeleton *CircularSkeleton) JSLiteral() string {
	var out strings.Builder
	out.WriteString("{c:[")
	for i, tracked := range skeleton.tracked {
		if i > 0 {
			out.WriteString(",")
		}
		if tracked {
			out.WriteString("1")
		} else {
			out.WriteString("0")
		}
	}
	out.WriteString("],e:[")
	for i, edges := range skeleton.edges {
		if i > 0 {
			out.WriteString(",")
		}
		out.WriteString("[")
		for j, edge := range edges {
			if j > 0 {
				out.WriteString(",")
			}
			out.WriteString("{p:[")
			for k, seg := range edge.path {
				if k > 0 {
					out.WriteString(",")
				}
				out.WriteString(seg.jsLiteral())
			}
			out.WriteString("],t:")
			out.WriteString(strconv.Itoa(edge.to))
			out.WriteString("}")
		}
		out.WriteString("]")
	}
	out.WriteString("]}")
	return out.String()
}

// jsLiteral renders one path segment as its JS array literal, e.g. ['k','next'],
// ['k',0] (a tuple index), or ['a'] (iterate array elements).
func (seg circSeg) jsLiteral() string {
	kind := jsquote.Single(seg.kind)
	if seg.kind != "k" {
		return "[" + kind + "]"
	}
	if seg.keyNum {
		return "[" + kind + "," + seg.keyName + "]"
	}
	return "[" + kind + "," + jsquote.Single(seg.keyName) + "]"
}
