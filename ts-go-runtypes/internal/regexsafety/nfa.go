package regexsafety

// nfa.go builds the automaton the ambiguity walk runs on: a Thompson
// construction with epsilon transitions kept, because the blowup this
// package hunts for lives in the epsilon paths. `(a+)+` and `a+` accept
// the same language and differ only in how many ways the automaton can
// spell one string, so an automaton with its epsilon steps closed away
// cannot tell them apart.

type nfaMove struct {
	set *charSet
	to  int
}

type nfaState struct {
	eps   []int
	moves []nfaMove
	// span is the sub-expression this state was built from, innermost
	// first, so a finding can quote the loop it is about.
	span [2]int
}

type nfa struct {
	states   []nfaState
	start    int
	accept   int
	overflow bool
}

// nfaStateLimit caps construction. A pattern past it gets the exact
// nullable-loop rule only: no diagnostic is invented from a walk that
// did not run.
const nfaStateLimit = 4000

type nfaBuilder struct {
	auto *nfa
	span [2]int
	// loopBoundedFrom, when non-zero, models every bounded repeat of at
	// least that many turns as an OPEN loop. A bounded repeat cannot blow
	// up exponentially, which is why the normal build spells it out, but
	// `^(.*?,){11}P` shows that repeating an ambiguous body eleven times
	// is its own kind of catastrophe: the work grows with the eleventh
	// power of the input. Modelling it as a loop is how the same walk
	// finds it.
	loopBoundedFrom int
}

func buildNFA(root node) *nfa {
	return buildNFAWith(root, 0)
}

func buildNFAWith(root node, loopBoundedFrom int) *nfa {
	builder := &nfaBuilder{auto: &nfa{}, loopBoundedFrom: loopBoundedFrom}
	start, end := builder.build(root)
	builder.auto.start = start
	builder.auto.accept = end
	return builder.auto
}

func (b *nfaBuilder) newState() int {
	if len(b.auto.states) >= nfaStateLimit {
		b.auto.overflow = true
		// Keep building into one shared state: the caller checks
		// overflow and throws the automaton away.
		if len(b.auto.states) > 0 {
			return len(b.auto.states) - 1
		}
	}
	b.auto.states = append(b.auto.states, nfaState{span: b.span})
	return len(b.auto.states) - 1
}

func (b *nfaBuilder) addEps(from, to int) {
	if from == to {
		return
	}
	b.auto.states[from].eps = append(b.auto.states[from].eps, to)
}

func (b *nfaBuilder) addMove(from int, set *charSet, to int) {
	b.auto.states[from].moves = append(b.auto.states[from].moves, nfaMove{set: set, to: to})
}

// build returns the entry and exit state of n.
func (b *nfaBuilder) build(n node) (start, end int) {
	if b.auto.overflow {
		state := b.newState()
		return state, state
	}
	switch typed := n.(type) {
	case *emptyNode, *lookNode:
		// Zero width: consumes nothing, so it is a plain epsilon step.
		// A lookaround's own body is checked separately, as its own
		// pattern, by Check.
		return b.buildSkip()
	case *anchorNode:
		state := b.newState()
		exit := b.newState()
		// A blocking anchor pins an end of the input, so nothing follows
		// it here: leaving the two states unjoined is what stops a route
		// through `^` or `$` from being walked as part of a loop. The
		// walk reads every state, reachable from the start or not, so
		// cutting the pattern in two costs it nothing.
		if !typed.blocking {
			b.addEps(state, exit)
		}
		return state, exit
	case *charsNode:
		state := b.newState()
		exit := b.newState()
		b.addMove(state, typed.set, exit)
		return state, exit
	case *concatNode:
		start, end = b.build(typed.items[0])
		for _, item := range typed.items[1:] {
			itemStart, itemEnd := b.build(item)
			b.addEps(end, itemStart)
			end = itemEnd
		}
		return start, end
	case *altNode:
		start = b.newState()
		end = b.newState()
		for _, option := range typed.options {
			optionStart, optionEnd := b.build(option)
			b.addEps(start, optionStart)
			b.addEps(optionEnd, end)
		}
		return start, end
	case *repeatNode:
		return b.buildRepeat(typed)
	}
	state := b.newState()
	return state, state
}

func (b *nfaBuilder) buildRepeat(repeat *repeatNode) (start, end int) {
	outer := b.span
	repeatStart, repeatEnd := repeat.span()
	b.span = [2]int{repeatStart, repeatEnd}
	defer func() { b.span = outer }()

	if repeat.max == 0 {
		return b.buildSkip()
	}
	_, bodyIsFixedLength := fixedLength(repeat.body)
	if b.loopBoundedFrom > 0 && repeat.max != unbounded && repeat.max >= b.loopBoundedFrom && !bodyIsFixedLength {
		if repeat.min == 0 {
			return b.buildLoop(repeat.body)
		}
		bodyStart, bodyEnd := b.build(repeat.body)
		exit := b.newState()
		b.addEps(bodyEnd, bodyStart)
		b.addEps(bodyEnd, exit)
		return bodyStart, exit
	}
	// The mandatory copies are spelled out: an exact count is what makes
	// `%[0-9A-Fa-f]{2}` unambiguous, and collapsing it would invent an
	// ambiguity the pattern does not have.
	copies := repeat.min
	limit := exactCopyLimit
	if repeat.max == unbounded {
		// Above an open tail the exact minimum changes no verdict.
		limit = openMinCopies
	}
	if copies > limit {
		copies = limit
	}
	start, end = -1, -1
	for index := 0; index < copies; index++ {
		copyStart, copyEnd := b.build(repeat.body)
		if start < 0 {
			start = copyStart
		} else {
			b.addEps(end, copyStart)
		}
		end = copyEnd
	}
	optional := repeat.max - repeat.min
	if repeat.max != unbounded && optional == 0 {
		if start < 0 {
			return b.buildSkip()
		}
		return start, end
	}
	var tailStart, tailEnd int
	switch {
	case repeat.max == unbounded:
		tailStart, tailEnd = b.buildLoop(repeat.body)
	case optional <= boundedExpandLimit:
		// A bounded repeat is spelled out as NESTED optionals, `(X(X)?)?`
		// rather than `X?X?`, so that one X still has exactly one way to
		// match. Getting this right is what keeps the domain and hostname
		// patterns, whose labels are `{0,61}`, out of the report.
		tailStart, tailEnd = b.buildNestedOptional(repeat.body, optional)
	default:
		// A very wide bound is modelled as an open loop. It over-states
		// what the pattern accepts, and a loop is the shape a wide bound
		// backtracks like anyway.
		tailStart, tailEnd = b.buildLoop(repeat.body)
	}
	if start < 0 {
		return tailStart, tailEnd
	}
	b.addEps(end, tailStart)
	return start, tailEnd
}

// buildSkip is a pair of states joined by an epsilon: matches nothing.
func (b *nfaBuilder) buildSkip() (start, end int) {
	start = b.newState()
	end = b.newState()
	b.addEps(start, end)
	return start, end
}

// buildLoop is `X*`: one loop state, entered and left without consuming.
func (b *nfaBuilder) buildLoop(body node) (start, end int) {
	bodyStart, bodyEnd := b.build(body)
	loop := b.newState()
	exit := b.newState()
	b.addEps(loop, bodyStart)
	b.addEps(bodyEnd, loop)
	b.addEps(loop, exit)
	return loop, exit
}

// buildNestedOptional is `(X(X(X)?)?)?`, count deep.
func (b *nfaBuilder) buildNestedOptional(body node, count int) (start, end int) {
	entry := b.newState()
	exit := b.newState()
	bodyStart, bodyEnd := b.build(body)
	b.addEps(entry, bodyStart)
	b.addEps(entry, exit)
	if count <= 1 || b.auto.overflow {
		b.addEps(bodyEnd, exit)
		return entry, exit
	}
	innerStart, innerEnd := b.buildNestedOptional(body, count-1)
	b.addEps(bodyEnd, innerStart)
	b.addEps(innerEnd, exit)
	return entry, exit
}

const (
	// exactCopyLimit caps how many times an exact `X{n}` is spelled out,
	// and boundedExpandLimit how many optional copies a `{n,m}` becomes.
	// A pattern is free to ask for thousands, and past these the walk
	// falls back to a loop.
	exactCopyLimit     = 64
	boundedExpandLimit = 64
	// openMinCopies is how much of `X{n,}`'s minimum is spelled out
	// before the open tail takes over. The minimum changes no verdict.
	openMinCopies = 2
)

// epsilonOrder returns the states in an order where every epsilon
// transition points forward, and false when the epsilon graph has a
// cycle. A cycle means a loop that can turn without consuming anything,
// which the nullable-loop rule reports on its own.
func (a *nfa) epsilonOrder() ([]int, bool) {
	const (
		unseen = iota
		onStack
		done
	)
	state := make([]int8, len(a.states))
	order := make([]int, 0, len(a.states))
	// Iterative depth-first search: the recursion depth on a long
	// pattern would otherwise track the pattern's length.
	type frame struct {
		state int
		next  int
	}
	for root := range a.states {
		if state[root] != unseen {
			continue
		}
		stack := []frame{{root, 0}}
		state[root] = onStack
		for len(stack) > 0 {
			top := &stack[len(stack)-1]
			if top.next >= len(a.states[top.state].eps) {
				state[top.state] = done
				order = append(order, top.state)
				stack = stack[:len(stack)-1]
				continue
			}
			next := a.states[top.state].eps[top.next]
			top.next++
			switch state[next] {
			case onStack:
				return nil, false
			case unseen:
				state[next] = onStack
				stack = append(stack, frame{next, 0})
			}
		}
	}
	// order is finish-time order, so reverse it for topological order.
	for left, right := 0, len(order)-1; left < right; left, right = left+1, right-1 {
		order[left], order[right] = order[right], order[left]
	}
	return order, true
}
