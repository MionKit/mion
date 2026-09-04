package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// refTableOf indexes hand-built nodes by id (the walker/skeleton deref refs).
func refTableOf(nodes ...*reflection.RunType) map[string]*reflection.RunType {
	table := make(map[string]*reflection.RunType, len(nodes))
	for _, node := range nodes {
		table[node.ID] = node
	}
	return table
}

// TestBuildCircularSkeleton_SelfReference pins the linked-list shape:
// `Node {name; next?: Node}` — one tracked node with a single `.next` edge back
// to itself.
func TestBuildCircularSkeleton_SelfReference(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	pName := &reflection.RunType{ID: "pName", Kind: reflection.KindProperty, Name: "name", Child: makeRef("str")}
	pNext := &reflection.RunType{ID: "pNext", Kind: reflection.KindProperty, Name: "next", Optional: true, Child: makeRef("node")}
	node := &reflection.RunType{ID: "node", Kind: reflection.KindObject, IsCircular: true, Children: []*reflection.RunType{makeRef("pName"), makeRef("pNext")}}
	refTable := refTableOf(str, pName, pNext, node)

	skeleton := BuildCircularSkeleton(node, refTable)
	if skeleton == nil {
		t.Fatal("expected a skeleton for a self-referential type")
	}
	if got, want := skeleton.JSLiteral(), `{c:[1],e:[[{p:[['k','next']],t:0}]]}`; got != want {
		t.Fatalf("self-ref skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_ArrayElement pins the `Tree {children: Tree[]}` shape:
// the circular edge iterates array elements (`a`) then returns to node 0.
func TestBuildCircularSkeleton_ArrayElement(t *testing.T) {
	arr := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef("tree")}
	pKids := &reflection.RunType{ID: "pKids", Kind: reflection.KindProperty, Name: "children", Child: makeRef("arr")}
	tree := &reflection.RunType{ID: "tree", Kind: reflection.KindObject, IsCircular: true, Children: []*reflection.RunType{makeRef("pKids")}}
	refTable := refTableOf(arr, pKids, tree)

	skeleton := BuildCircularSkeleton(tree, refTable)
	if got, want := skeleton.JSLiteral(), `{c:[1],e:[[{p:[['k','children'],['a']],t:0}]]}`; got != want {
		t.Fatalf("array-element skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_Mutual pins the two-type cycle `A{b?:B}` / `B{a?:A}`:
// node 0 = A, node 1 = B, with cross edges A.b→1 and B.a→0, both tracked.
func TestBuildCircularSkeleton_Mutual(t *testing.T) {
	pB := &reflection.RunType{ID: "pB", Kind: reflection.KindProperty, Name: "b", Optional: true, Child: makeRef("b")}
	pA := &reflection.RunType{ID: "pA", Kind: reflection.KindProperty, Name: "a", Optional: true, Child: makeRef("a")}
	a := &reflection.RunType{ID: "a", Kind: reflection.KindObject, IsCircular: true, Children: []*reflection.RunType{makeRef("pB")}}
	b := &reflection.RunType{ID: "b", Kind: reflection.KindObject, IsCircular: true, Children: []*reflection.RunType{makeRef("pA")}}
	refTable := refTableOf(pB, pA, a, b)

	skeleton := BuildCircularSkeleton(a, refTable)
	// a is node 0 (root); b is node 1. Both tracked; a.b→1, b.a→0.
	if got, want := skeleton.JSLiteral(), `{c:[1,1],e:[[{p:[['k','b']],t:1}],[{p:[['k','a']],t:0}]]}`; got != want {
		t.Fatalf("mutual skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_CycleUnderNonCircularRoot pins the case where the
// guarded root is NOT itself circular (`Wrapper{node?: Recursive}`): node 0 = the
// wrapper (UNtracked, c[0]=0), reaching the circular Recursive at node 1.
func TestBuildCircularSkeleton_CycleUnderNonCircularRoot(t *testing.T) {
	pNext := &reflection.RunType{ID: "pNext", Kind: reflection.KindProperty, Name: "next", Optional: true, Child: makeRef("rec")}
	rec := &reflection.RunType{ID: "rec", Kind: reflection.KindObject, IsCircular: true, Children: []*reflection.RunType{makeRef("pNext")}}
	pNode := &reflection.RunType{ID: "pNode", Kind: reflection.KindProperty, Name: "node", Optional: true, Child: makeRef("rec")}
	wrapper := &reflection.RunType{ID: "wrap", Kind: reflection.KindObject, Children: []*reflection.RunType{makeRef("pNode")}}
	refTable := refTableOf(pNext, rec, pNode, wrapper)

	skeleton := BuildCircularSkeleton(wrapper, refTable)
	// Root (wrapper) is untracked; it reaches Recursive (node 1) via `.node`;
	// Recursive self-loops via `.next`.
	if got, want := skeleton.JSLiteral(), `{c:[0,1],e:[[{p:[['k','node']],t:1}],[{p:[['k','next']],t:1}]]}`; got != want {
		t.Fatalf("cycle-under-noncircular-root skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_Acyclic returns nil for a type that cannot cycle —
// the armed factory then emits no guard (a harmless duplicate of the plain body).
func TestBuildCircularSkeleton_Acyclic(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	pName := &reflection.RunType{ID: "pName", Kind: reflection.KindProperty, Name: "name", Child: makeRef("str")}
	plain := &reflection.RunType{ID: "plain", Kind: reflection.KindObject, Children: []*reflection.RunType{makeRef("pName")}}
	refTable := refTableOf(str, pName, plain)

	if skeleton := BuildCircularSkeleton(plain, refTable); skeleton != nil {
		t.Fatalf("expected nil skeleton for an acyclic type, got %s", skeleton.JSLiteral())
	}
}

// TestBuildCircularSkeleton_DeeplyNested pins that acyclic intermediate objects
// collapse into a single multi-segment edge path (`{a: {b: {c?: Node}}}`).
func TestBuildCircularSkeleton_DeeplyNested(t *testing.T) {
	pC := &reflection.RunType{ID: "pC", Kind: reflection.KindProperty, Name: "c", Optional: true, Child: makeRef("node")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObject, Children: []*reflection.RunType{makeRef("pC")}}
	pBmid := &reflection.RunType{ID: "pB", Kind: reflection.KindProperty, Name: "b", Child: makeRef("inner")}
	mid := &reflection.RunType{ID: "mid", Kind: reflection.KindObject, Children: []*reflection.RunType{makeRef("pB")}}
	pA := &reflection.RunType{ID: "pA", Kind: reflection.KindProperty, Name: "a", Child: makeRef("mid")}
	node := &reflection.RunType{ID: "node", Kind: reflection.KindObject, IsCircular: true, Children: []*reflection.RunType{makeRef("pA")}}
	refTable := refTableOf(pC, inner, pBmid, mid, pA, node)

	skeleton := BuildCircularSkeleton(node, refTable)
	if got, want := skeleton.JSLiteral(), `{c:[1],e:[[{p:[['k','a'],['k','b'],['k','c']],t:0}]]}`; got != want {
		t.Fatalf("deeply-nested skeleton = %s, want %s", got, want)
	}
}

// TestBuildCircularSkeleton_MapAndSetElements pins the `Node {children:
// Map<string, Node>; tags: Set<Node>}` shape: the Map value and the Set item
// each carry an edge back to node 0. The element types sit in Arguments
// behind KindParameter wrappers that arrive as refs, exactly as the
// projection emits them; before the fix the wrappers were read unresolved,
// no edge was produced, and a cycle through a Map or Set escaped the guard.
func TestBuildCircularSkeleton_MapAndSetElements(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	position0, position1 := 0, 1
	mapKey := &reflection.RunType{ID: "mk", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapKey, Name: "key", Position: &position0, Child: makeRef("str")}
	mapValue := &reflection.RunType{ID: "mv", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapValue, Name: "value", Position: &position1, Child: makeRef("node")}
	mapNode := &reflection.RunType{ID: "map", Kind: reflection.KindClass, SubKind: reflection.SubKindMap, TypeName: "Map", Arguments: []*reflection.RunType{makeRef("mk"), makeRef("mv")}}
	setItem := &reflection.RunType{ID: "si", Kind: reflection.KindParameter, SubKind: reflection.SubKindSetItem, Name: "item", Position: &position0, Child: makeRef("node")}
	setNode := &reflection.RunType{ID: "set", Kind: reflection.KindClass, SubKind: reflection.SubKindSet, TypeName: "Set", Arguments: []*reflection.RunType{makeRef("si")}}
	pKids := &reflection.RunType{ID: "pKids", Kind: reflection.KindProperty, Name: "children", Child: makeRef("map")}
	pTags := &reflection.RunType{ID: "pTags", Kind: reflection.KindProperty, Name: "tags", Child: makeRef("set")}
	node := &reflection.RunType{ID: "node", Kind: reflection.KindObject, IsCircular: true, Children: []*reflection.RunType{makeRef("pKids"), makeRef("pTags")}}
	refTable := refTableOf(str, mapKey, mapValue, mapNode, setItem, setNode, pKids, pTags, node)

	skeleton := BuildCircularSkeleton(node, refTable)
	if skeleton == nil {
		t.Fatal("expected a skeleton for a type that cycles through a Map value and a Set item")
	}
	if got, want := skeleton.JSLiteral(), `{c:[1],e:[[{p:[['k','children'],['mv']],t:0},{p:[['k','tags'],['s']],t:0}]]}`; got != want {
		t.Fatalf("map/set skeleton = %s, want %s", got, want)
	}
}
