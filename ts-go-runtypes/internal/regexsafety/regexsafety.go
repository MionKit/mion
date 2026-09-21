// Package regexsafety answers one build-time question about a user's `pattern` format param: can this regular expression be made to
// take exponential time? The pattern becomes a `new RegExp(...)` inside the generated validator, JavaScript backtracks, and a pattern
// like `(a+)+$` hangs the process on a few dozen characters. Downstream input validation cannot help, the validator IS what hangs.
// The check is static and pure Go so it runs on every host: the other guard, the sidecar's sample time budget, needs a host that can
// interrupt a running match, and only V8 can, so under bun it never fires.
// It is deliberately one-sided, reporting only when it can point at two routes through one loop. A construct it cannot model (a
// backreference, an unknown Unicode property) is kept distinct rather than assumed to overlap, so it never fails a build on a guess.
package regexsafety

import "strings"

// Finding describes why a pattern was rejected.
type Finding struct {
	// Reason is the user-facing phrase naming the shape that was found.
	Reason string
	// Excerpt is the sub-expression the finding is about, quoted from the pattern source.
	Excerpt string
}

// excerptLimit keeps a finding's quoted sub-expression readable: the URI and IRI patterns are kilobytes long.
const excerptLimit = 60

// Check reports whether source can be made to backtrack exponentially; a pattern this package cannot parse or is too large to walk
// comes back false, and the real regex engine keeps its own say over whether the pattern is even valid.
func Check(source, flags string) (finding Finding, ok bool) {
	if source == "" {
		return finding, false
	}
	// The `v` flag turns `[...]` into set notation with nesting and difference operators, which this parser does not model.
	if strings.ContainsRune(flags, 'v') {
		return finding, false
	}
	root, looks, parsed := parsePattern(source, flags)
	if !parsed {
		return finding, false
	}
	runes := []rune(source)
	// A loop nothing can reject after has real but unreachable ambiguity, the first greedy attempt already succeeds; reporting those
	// is how a check earns a reputation for crying wolf.
	harmless := harmlessLoops(root)
	// A loop whose body can match nothing turns forever on the spot, and saying so beats pointing at a route through an automaton.
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
	// Second pass, for the counted repeat: `^(.*?,){11}P` cannot loop forever, so the walk above rightly finds nothing, yet each of
	// the eleven turns can split the same text more than one way and the work grows with the eleventh power of the input.
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

// countedRepeatFloor is how many turns a counted repeat needs before its body's ambiguity is worth reporting: the cost is the nth
// power of the input, so a couple of turns is a rounding error and a dozen is a denial of service.
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

// findEmptyLoop returns the span of an unbounded repeat whose body matches the empty string, skipping the harmless ones.
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

// harmlessLoops collects the unbounded repeats nothing after them can ever reject: ambiguous or not, the engine never explores the
// other routes, because the first attempt runs to a match. The `\/\*(?:[^*]+|\*(?!\/))*(\*\/)?` comment scanners all over real
// code are this shape, and reporting them is the false positive that makes a check like this unusable.
func harmlessLoops(root node) map[[2]int]bool {
	out := map[[2]int]bool{}
	collectHarmless(root, nil, out)
	return out
}

// collectHarmless walks the tree carrying `after`: everything the match still has to satisfy once this node is done, outermost last.
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
		// A lookaround is checked as its own pattern: nothing inside it is followed by what comes after it.
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
