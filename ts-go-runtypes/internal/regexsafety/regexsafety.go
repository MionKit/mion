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
	// The exact rule first: a loop whose body can match nothing turns
	// forever on the spot, and naming it that way is clearer than
	// pointing at a route through an automaton.
	if span, found := findEmptyLoop(root); found {
		return Finding{
			Reason:  "a repeated group that can match the empty string, so the match can loop without consuming input",
			Excerpt: excerpt(runes, span),
		}, true
	}
	trees := append([]node{root}, lookBodies(looks)...)
	for _, tree := range trees {
		if span, found := findExponential(buildNFA(tree)); found {
			return Finding{
				Reason:  "a repeated group that can match the same text in more than one way, so a failing input is retried exponentially many times",
				Excerpt: excerpt(runes, span),
			}, true
		}
	}
	return finding, false
}

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
// matches the empty string.
func findEmptyLoop(n node) (span [2]int, found bool) {
	switch typed := n.(type) {
	case *concatNode:
		for _, item := range typed.items {
			if span, found = findEmptyLoop(item); found {
				return span, true
			}
		}
	case *altNode:
		for _, option := range typed.options {
			if span, found = findEmptyLoop(option); found {
				return span, true
			}
		}
	case *lookNode:
		return findEmptyLoop(typed.body)
	case *repeatNode:
		if span, found = findEmptyLoop(typed.body); found {
			return span, true
		}
		if typed.max == unbounded && matchesEmpty(typed.body) {
			start, end := typed.span()
			return [2]int{start, end}, true
		}
	}
	return span, false
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
