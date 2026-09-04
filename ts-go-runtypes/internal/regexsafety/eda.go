package regexsafety

// eda.go answers one question about an automaton: is there a state the
// machine can return to, having read the same text, along two DIFFERENT
// routes? That is exactly what makes a backtracking engine take
// exponential time, because on a string that ends up not matching it
// tries every one of those routes.
//
// The walk runs on the product of the automaton with itself: a state of
// the product is a PAIR of states, one per route, and a step moves both
// routes on the same character. A pair where the two halves have drifted
// apart, sitting on a cycle that passes back through a pair where they
// agree, is the proof.

const (
	// edaStateLimit and edaSCCLimit keep the walk's cost bounded: the
	// product of a loop with n states has n*n pairs.
	edaStateLimit = 1500
	edaSCCLimit   = 320
	// edaWorkBudget caps the total pair-transition comparisons.
	edaWorkBudget = 12_000_000
)

// flatMove is one character step of the automaton with its epsilon
// prologue folded in: from a state, walk epsilon steps to `origin`, then
// take `origin`'s move number `index`.
type flatMove struct {
	set    *charSet
	to     int
	origin int
	index  int
	// dup marks a move whose epsilon prologue itself has two or more
	// distinct routes. `(a+)+` is exactly this: one character step, two
	// ways of getting to it, and that alone is the blowup.
	dup bool
}

func sameTransition(left, right flatMove) bool {
	return left.origin == right.origin && left.index == right.index
}

// flatten folds every epsilon prologue into the character moves that
// follow it, counting how many distinct epsilon routes reach each one.
// Returns false when the automaton is too large to walk.
func flatten(auto *nfa) ([][]flatMove, bool) {
	if auto.overflow || len(auto.states) > edaStateLimit {
		return nil, false
	}
	order, acyclic := auto.epsilonOrder()
	if !acyclic {
		return nil, false
	}
	flat := make([][]flatMove, len(auto.states))
	// routes[state] counts the distinct epsilon routes from the current
	// source, capped at 2: the walk only needs "one" versus "more".
	routes := make([]int, len(auto.states))
	touched := make([]int, 0, len(auto.states))
	for source := range auto.states {
		for _, state := range touched {
			routes[state] = 0
		}
		touched = touched[:0]
		routes[source] = 1
		touched = append(touched, source)
		for _, state := range order {
			count := routes[state]
			if count == 0 {
				continue
			}
			for index, move := range auto.states[state].moves {
				flat[source] = append(flat[source], flatMove{
					set:    move.set,
					to:     move.to,
					origin: state,
					index:  index,
					dup:    count > 1,
				})
			}
			for _, next := range auto.states[state].eps {
				if routes[next] == 0 {
					touched = append(touched, next)
				}
				routes[next] += count
				if routes[next] > 2 {
					routes[next] = 2
				}
			}
		}
	}
	return flat, true
}

// findExponential reports the state a doubled route closes on, and the
// sub-expression it belongs to. ok is false when nothing was found or
// the automaton was too large to judge.
func findExponential(auto *nfa) (span [2]int, ok bool) {
	flat, walkable := flatten(auto)
	if !walkable {
		return span, false
	}
	base := make([][]int, len(flat))
	for state, moves := range flat {
		for _, move := range moves {
			base[state] = append(base[state], move.to)
		}
	}
	budget := edaWorkBudget
	for _, component := range stronglyConnected(base) {
		if len(component) > edaSCCLimit {
			continue
		}
		diagonal, found := scanComponent(component, flat, &budget)
		if found {
			return auto.states[diagonal].span, true
		}
		if budget <= 0 {
			return span, false
		}
	}
	return span, false
}

// scanComponent runs the paired walk inside one loop of the automaton.
// Both routes have to stay inside the loop: a cycle in the product needs
// a cycle in each half, and every state of a cycle lives in one
// strongly connected component.
func scanComponent(component []int, flat [][]flatMove, budget *int) (diagonal int, found bool) {
	size := len(component)
	position := make(map[int]int, size)
	for index, state := range component {
		position[state] = index
	}
	pairCount := size * size
	adjacency := make([][]int, pairCount)
	divergent := make([][]bool, pairCount)
	for leftIndex, leftState := range component {
		for rightIndex, rightState := range component {
			pair := leftIndex*size + rightIndex
			for _, leftMove := range flat[leftState] {
				leftTarget, inside := position[leftMove.to]
				if !inside {
					continue
				}
				for _, rightMove := range flat[rightState] {
					*budget--
					if *budget <= 0 {
						return 0, false
					}
					rightTarget, inside := position[rightMove.to]
					if !inside {
						continue
					}
					if !leftMove.set.intersects(rightMove.set) {
						continue
					}
					adjacency[pair] = append(adjacency[pair], leftTarget*size+rightTarget)
					divergent[pair] = append(divergent[pair],
						!sameTransition(leftMove, rightMove) || leftMove.dup)
				}
			}
		}
	}
	for _, productComponent := range stronglyConnected(adjacency) {
		member := make(map[int]bool, len(productComponent))
		for _, pair := range productComponent {
			member[pair] = true
		}
		agreed := -1
		for _, pair := range productComponent {
			if pair/size == pair%size {
				agreed = pair
				break
			}
		}
		if agreed < 0 {
			continue
		}
		for _, pair := range productComponent {
			for index, target := range adjacency[pair] {
				if member[target] && divergent[pair][index] {
					return component[agreed/size], true
				}
			}
		}
	}
	return 0, false
}

// stronglyConnected returns Tarjan's strongly connected components of a
// directed graph given as adjacency lists. Iterative on purpose: the
// recursion depth would otherwise follow the pattern's length.
func stronglyConnected(adjacency [][]int) [][]int {
	count := len(adjacency)
	index := make([]int, count)
	low := make([]int, count)
	onStack := make([]bool, count)
	for node := range index {
		index[node] = -1
	}
	var stack []int
	var components [][]int
	next := 0

	type frame struct {
		node int
		edge int
	}
	for root := 0; root < count; root++ {
		if index[root] != -1 {
			continue
		}
		callStack := []frame{{root, 0}}
		index[root], low[root] = next, next
		next++
		stack = append(stack, root)
		onStack[root] = true
		for len(callStack) > 0 {
			top := &callStack[len(callStack)-1]
			if top.edge < len(adjacency[top.node]) {
				child := adjacency[top.node][top.edge]
				top.edge++
				if index[child] == -1 {
					index[child], low[child] = next, next
					next++
					stack = append(stack, child)
					onStack[child] = true
					callStack = append(callStack, frame{child, 0})
					continue
				}
				if onStack[child] && index[child] < low[top.node] {
					low[top.node] = index[child]
				}
				continue
			}
			node := top.node
			callStack = callStack[:len(callStack)-1]
			if len(callStack) > 0 {
				parent := callStack[len(callStack)-1].node
				if low[node] < low[parent] {
					low[parent] = low[node]
				}
			}
			if low[node] != index[node] {
				continue
			}
			var component []int
			for {
				member := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				onStack[member] = false
				component = append(component, member)
				if member == node {
					break
				}
			}
			components = append(components, component)
		}
	}
	return components
}
