// Package regexsafety answers one build-time question about a user's
// `pattern` format param: can this regular expression be made to take
// exponential time?
//
// A pattern format ends up as a `new RegExp(...)` inside the generated
// validator and runs on every value that validator sees. JavaScript
// matches with a backtracking engine, so a pattern like `(a+)+$` tries
// every way of splitting the input before it gives up, and a few dozen
// characters are enough to hang the process. A type author who ships one
// has shipped a denial-of-service hole, and no amount of input validation
// downstream helps, because the validator IS the thing that hangs.
//
// The check is static and pure Go, so it runs once per pattern on every
// host. That matters: the other guard, the sample time budget in the
// pattern sidecar, needs the host to be able to interrupt a running
// match, and only V8 can. Under bun it never fires.
//
// The check is deliberately one-sided. It reports a pattern only when it
// can point at two different routes through one loop, which is the thing
// that actually causes the blowup. Constructs it cannot model (a
// backreference, a Unicode property this build does not know) are kept
// distinct rather than assumed to overlap, so an unmodelled pattern comes
// back clean instead of failing someone's build on a guess.
package regexsafety

import "strings"

// Finding describes why a pattern was rejected.
type Finding struct {
	// Reason is the user-facing phrase naming the shape that was found.
	Reason string
	// Excerpt is the sub-expression the finding is about, quoted from
	// the pattern source.
	Excerpt string
}

// excerptLimit keeps a finding's quoted sub-expression readable: the URI
// and IRI patterns are kilobytes long.
const excerptLimit = 60

// Check reports whether source can be made to backtrack exponentially.
// ok is true when a finding was made; a pattern this package cannot
// parse or is too large to walk comes back with ok false, and the real
// regex engine keeps its own say over whether the pattern is even valid.
func Check(source, flags string) (finding Finding, ok bool) {
	if source == "" {
		return finding, false
	}
	// The `v` flag turns `[...]` into set notation with nesting and
	// difference operators, which this parser does not model.
	if strings.ContainsRune(flags, 'v') {
		return finding, false
	}
	root, looks, parsed := parsePattern(source, flags)
	if !parsed {
		return finding, false
	}
	runes := []rune(source)
	// Loops nothing can ever reject after are set aside first: their
	// ambiguity is real but unreachable, because the first greedy attempt
	// already succeeds. Reporting those is how a check earns a reputation
	// for crying wolf.
	harmless := harmlessLoops(root)
	// The exact rule next: a loop whose body can match nothing turns
	// forever on the spot, and naming it that way is clearer than
	// pointing at a route through an automaton.
	if span, found := findEmptyLoop(root, harmless); found {
		return Finding{
			Reason:  "a repeated group that can match the empty string, so the match can loop without consuming input",
			Excerpt: excerpt(runes, span),
		}, true
	}
	trees := append([]node{root}, lookBodies(looks)...)
	for _, tree := range trees {
		if span, found := findExponential(buildNFA(tree), harmless); found {
			return Finding{
				Reason:  "a repeated group that can match the same text in more than one way, so a failing input is retried exponentially many times",
				Excerpt: excerpt(runes, span),
			}, true
		}
	}
	// Second pass, for the counted repeat. `^(.*?,){11}P` cannot loop
	// forever, so the walk above rightly finds nothing, and it is still
	// the textbook slow pattern: each of the eleven turns can split the
	// same text more than one way, and the work grows with the eleventh
	// power of the input.
	for _, tree := range trees {
		if span, found := findExponential(buildNFAWith(tree, countedRepeatFloor), harmless); found {
			return Finding{
				Reason:  "a counted group repeated many times whose body can match the same text in more than one way, so a failing input is retried once per combination",
				Excerpt: excerpt(runes, span),
			}, true
		}
	}
	return finding, false
}

// countedRepeatFloor is how many turns a counted repeat needs before its
// body's ambiguity is worth reporting. Repeating an ambiguous body n
// times costs the nth power of the input, so a couple of turns is a
// rounding error and a dozen is a denial of service.
const countedRepeatFloor = 4

func lookBodies(looks []node) []node {
	bodies := make([]node, 0, len(looks))
	for _, look := range looks {
		if typed, ok := look.(*lookNode); ok {
			bodies = append(bodies, typed.body)
		}
	}
	return bodies
}

// findEmptyLoop returns the span of an unbounded repeat whose body
// matches the empty string, skipping the ones nothing can reject after.
func findEmptyLoop(n node, harmless map[[2]int]bool) (span [2]int, found bool) {
	switch typed := n.(type) {
	case *concatNode:
		for _, item := range typed.items {
			if span, found = findEmptyLoop(item, harmless); found {
				return span, true
			}
		}
	case *altNode:
		for _, option := range typed.options {
			if span, found = findEmptyLoop(option, harmless); found {
				return span, true
			}
		}
	case *lookNode:
		return findEmptyLoop(typed.body, harmless)
	case *repeatNode:
		if span, found = findEmptyLoop(typed.body, harmless); found {
			return span, true
		}
		start, end := typed.span()
		if typed.max == unbounded && matchesEmpty(typed.body) && !harmless[[2]int{start, end}] {
			return [2]int{start, end}, true
		}
	}
	return span, false
}

// harmlessLoops collects the unbounded repeats that nothing after them
// can ever reject. Such a loop may well be ambiguous, but the engine
// never has a reason to explore the other routes: the first attempt runs
// to a match. The `\/\*(?:[^*]+|\*(?!\/))*(\*\/)?` comment scanners
// that turn up all over real code are this shape, and reporting them
// would be the false positive that makes a check like this unusable.
func harmlessLoops(root node) map[[2]int]bool {
	out := map[[2]int]bool{}
	collectHarmless(root, nil, out)
	return out
}

// collectHarmless walks the tree carrying `after`: everything the match
// still has to satisfy once this node is done, outermost last.
func collectHarmless(n node, after []node, out map[[2]int]bool) {
	switch typed := n.(type) {
	case *concatNode:
		for index, item := range typed.items {
			rest := make([]node, 0, len(typed.items)-index-1+len(after))
			rest = append(rest, typed.items[index+1:]...)
			rest = append(rest, after...)
			collectHarmless(item, rest, out)
		}
	case *altNode:
		for _, option := range typed.options {
			collectHarmless(option, after, out)
		}
	case *lookNode:
		// A lookaround is checked as its own pattern, and nothing inside
		// it is followed by what comes after it.
		collectHarmless(typed.body, nil, out)
	case *repeatNode:
		_, bodyIsFixedLength := fixedLength(typed.body)
		countedAndAmbiguous := typed.max >= countedRepeatFloor && !bodyIsFixedLength
		if (typed.max == unbounded || countedAndAmbiguous) && allAlwaysSatisfiable(after) {
			start, end := typed.span()
			out[[2]int{start, end}] = true
		}
		collectHarmless(typed.body, after, out)
	}
}

func allAlwaysSatisfiable(nodes []node) bool {
	for _, item := range nodes {
		if !alwaysSatisfiable(item) {
			return false
		}
	}
	return true
}

func excerpt(runes []rune, span [2]int) string {
	start, end := span[0], span[1]
	if start < 0 || end > len(runes) || start >= end {
		start, end = 0, len(runes)
	}
	text := string(runes[start:end])
	if len([]rune(text)) > excerptLimit {
		text = string([]rune(text)[:excerptLimit]) + "..."
	}
	return text
}
