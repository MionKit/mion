package regexsafety

import "strings"

// parse.go turns a JS regex SOURCE into the small tree the safety walk
// needs. It is not a validator: whether a pattern is legal JS is settled
// by the real engine (FMT002 owns that verdict), so anything this parser
// cannot make sense of ends the parse and the safety check stands down
// rather than guessing.

// node is one element of the parsed pattern. Every node carries the rune
// offsets it was parsed from, so a finding can quote the offending
// sub-expression back to the author.
type node interface {
	span() (start, end int)
}

type baseNode struct {
	start, end int
}

func (n baseNode) span() (int, int) { return n.start, n.end }

// emptyNode matches the empty string: an empty alternative, and every
// zero-width construct the walk models as "consumes nothing".
type emptyNode struct{ baseNode }

// charsNode consumes exactly one code point out of set.
type charsNode struct {
	baseNode
	set *charSet
}

type concatNode struct {
	baseNode
	items []node
}

type altNode struct {
	baseNode
	options []node
}

// repeatNode is body repeated min..max times; max == unbounded means no
// upper limit, which is the only shape that can loop forever and so the
// only shape the ambiguity walk can find exponential blowup in.
type repeatNode struct {
	baseNode
	body     node
	min, max int
}

const unbounded = -1

// lookNode is a lookahead or lookbehind. The walk treats it as
// zero-width and checks its body separately, as its own pattern.
type lookNode struct {
	baseNode
	body node
}

// anchorNode is `^`, `$`, `\b` or `\B`: matches a POSITION, consumes
// nothing. `blocking` marks the two that pin an END of the input, `^` and
// `$` without the `m` flag. Nothing can be consumed before `^` or after
// `$`, so no loop can turn through one, and saying so is what keeps a
// branch like `\\$` from looking as though it competes with `\\.` for
// the same character.
type anchorNode struct {
	baseNode
	blocking bool
}

type parser struct {
	src        []rune
	pos        int
	ignoreCase bool
	dotAll     bool
	multiline  bool
	failed     bool
	backrefs   int
}

// parsePattern parses source under flags. ok is false when the source
// uses something this parser does not model, or is not valid at all.
func parsePattern(source, flags string) (parsed node, looks []node, ok bool) {
	p := &parser{
		src:        []rune(source),
		ignoreCase: strings.ContainsRune(flags, 'i'),
		dotAll:     strings.ContainsRune(flags, 's'),
		multiline:  strings.ContainsRune(flags, 'm'),
	}
	root := p.parseAlternation(&looks)
	if p.failed || p.pos != len(p.src) {
		return nil, nil, false
	}
	return root, looks, true
}

func (p *parser) fail() {
	p.failed = true
	p.pos = len(p.src)
}

func (p *parser) more() bool { return !p.failed && p.pos < len(p.src) }

func (p *parser) peek() rune {
	if p.pos >= len(p.src) {
		return 0
	}
	return p.src[p.pos]
}

func (p *parser) parseAlternation(looks *[]node) node {
	start := p.pos
	options := []node{p.parseConcat(looks)}
	for p.more() && p.peek() == '|' {
		p.pos++
		options = append(options, p.parseConcat(looks))
	}
	if len(options) == 1 {
		return options[0]
	}
	return &altNode{baseNode{start, p.pos}, options}
}

func (p *parser) parseConcat(looks *[]node) node {
	start := p.pos
	var items []node
	for p.more() && p.peek() != '|' && p.peek() != ')' {
		item := p.parseTerm(looks)
		if item == nil {
			break
		}
		items = append(items, item)
	}
	switch len(items) {
	case 0:
		return &emptyNode{baseNode{start, p.pos}}
	case 1:
		return items[0]
	}
	return &concatNode{baseNode{start, p.pos}, items}
}

// parseTerm is one atom plus the quantifier that may follow it.
func (p *parser) parseTerm(looks *[]node) node {
	start := p.pos
	atom := p.parseAtom(looks)
	if atom == nil {
		return nil
	}
	min, max, quantified := p.parseQuantifier()
	if !quantified {
		return atom
	}
	// A quantified zero-width atom loops without consuming; the JS engine
	// stops after one turn, and so does the walk, so drop the quantifier.
	switch atom.(type) {
	case *emptyNode, *lookNode, *anchorNode:
		return atom
	}
	return &repeatNode{baseNode{start, p.pos}, atom, min, max}
}

func (p *parser) parseAtom(looks *[]node) node {
	start := p.pos
	switch char := p.peek(); char {
	case '^', '$':
		p.pos++
		return &anchorNode{baseNode{start, p.pos}, !p.multiline}
	case '.':
		p.pos++
		set := anyRuneSet()
		if !p.dotAll {
			set = lineTerminatorSet().negated()
		}
		return p.charsFrom(start, set)
	case '(':
		return p.parseGroup(looks)
	case '[':
		set := p.parseClass()
		if p.failed {
			return nil
		}
		return p.charsFrom(start, set)
	case '\\':
		return p.parseEscapeAtom(start)
	case '*', '+', '?':
		// A quantifier with nothing to quantify: not a legal pattern.
		p.fail()
		return nil
	case ')':
		return nil
	default:
		p.pos++
		return p.charsFrom(start, singleRune(char))
	}
}

// charsFrom wraps a set as a node, applying the `i` flag once and in one
// place so no caller can forget it.
func (p *parser) charsFrom(start int, set *charSet) node {
	if set == nil {
		p.fail()
		return nil
	}
	if p.ignoreCase {
		set = set.folded()
	}
	return &charsNode{baseNode{start, p.pos}, set}
}

func (p *parser) parseGroup(looks *[]node) node {
	start := p.pos
	p.pos++ // '('
	isLook := false
	if p.peek() == '?' {
		p.pos++
		switch p.peek() {
		case ':':
			p.pos++
		case '=', '!':
			p.pos++
			isLook = true
		case '<':
			p.pos++
			if next := p.peek(); next == '=' || next == '!' {
				p.pos++
				isLook = true
				break
			}
			// A named capture: skip the name, the body parses as usual.
			for p.more() && p.peek() != '>' {
				p.pos++
			}
			if !p.more() {
				p.fail()
				return nil
			}
			p.pos++ // '>'
		default:
			// Modifier groups and anything else new: not modelled.
			p.fail()
			return nil
		}
	}
	body := p.parseAlternation(looks)
	if p.peek() != ')' {
		p.fail()
		return nil
	}
	p.pos++
	if isLook {
		look := &lookNode{baseNode{start, p.pos}, body}
		*looks = append(*looks, look)
		return look
	}
	return body
}

// parseEscapeAtom handles a backslash escape outside a character class.
func (p *parser) parseEscapeAtom(start int) node {
	p.pos++ // '\'
	if !p.more() {
		p.fail()
		return nil
	}
	switch char := p.peek(); {
	case char == 'b' || char == 'B':
		// A word boundary sits between two characters, so a loop CAN
		// turn through one. Zero width, but not blocking.
		p.pos++
		return &anchorNode{baseNode{start, p.pos}, false}
	case char == 'k':
		// A named backreference. Skip `k<name>`, then model it opaquely.
		p.pos++
		if p.peek() != '<' {
			p.fail()
			return nil
		}
		for p.more() && p.peek() != '>' {
			p.pos++
		}
		if !p.more() {
			p.fail()
			return nil
		}
		p.pos++
		return p.charsFrom(start, p.nextBackref())
	case char >= '1' && char <= '9':
		for p.more() && p.peek() >= '0' && p.peek() <= '9' {
			p.pos++
		}
		return p.charsFrom(start, p.nextBackref())
	}
	set := p.parseClassEscape()
	if p.failed {
		return nil
	}
	return p.charsFrom(start, set)
}

// nextBackref names each backreference apart. Two different
// backreferences may well match the same text, but nothing here can
// prove it, and inventing an overlap would fail a build over a pattern
// that is fine.
func (p *parser) nextBackref() *charSet {
	p.backrefs++
	return opaqueSet("backref-" + string(rune('a'+p.backrefs%26)) + itoa(p.backrefs))
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	var digits []byte
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}

// parseClassEscape reads the escape body (the parser sits ON the
// character after the backslash) and returns the set it stands for. It
// is shared by the in-class and out-of-class paths, which is why `\b`
// and the backreferences are handled by the callers instead.
func (p *parser) parseClassEscape() *charSet {
	char := p.peek()
	p.pos++
	switch char {
	case 'd':
		return digitSet()
	case 'D':
		return digitSet().negated()
	case 'w':
		return wordSet()
	case 'W':
		return wordSet().negated()
	case 's':
		return spaceSet()
	case 'S':
		return spaceSet().negated()
	case 'n':
		return singleRune('\n')
	case 'r':
		return singleRune('\r')
	case 't':
		return singleRune('\t')
	case 'f':
		return singleRune('\f')
	case 'v':
		return singleRune('\v')
	case '0':
		return singleRune(0)
	case 'x':
		return p.fixedHex(2)
	case 'u':
		if p.peek() == '{' {
			p.pos++
			value, ok := p.hexUntilBrace()
			if !ok {
				p.fail()
				return nil
			}
			return singleRune(value)
		}
		return p.fixedHex(4)
	case 'c':
		if !p.more() {
			p.fail()
			return nil
		}
		control := p.peek()
		p.pos++
		return singleRune(control % 32)
	case 'p', 'P':
		if p.peek() != '{' {
			p.fail()
			return nil
		}
		p.pos++
		body := p.readUntilBrace()
		if p.failed {
			return nil
		}
		set := unicodePropertySet(body)
		if set == nil {
			// A property this build cannot resolve. Opaque by NAME, so
			// `\p{L}` still overlaps `\p{L}` and nothing else.
			set = opaqueSet("property-" + body)
			if char == 'P' {
				set = opaqueSet("property-not-" + body)
			}
			return set
		}
		if char == 'P' {
			return set.negated()
		}
		return set
	}
	return singleRune(char)
}

func (p *parser) fixedHex(width int) *charSet {
	value := rune(0)
	for index := 0; index < width; index++ {
		digit, ok := hexValue(p.peek())
		if !ok {
			p.fail()
			return nil
		}
		value = value*16 + digit
		p.pos++
	}
	return singleRune(value)
}

func (p *parser) hexUntilBrace() (rune, bool) {
	value := rune(0)
	digits := 0
	for p.more() && p.peek() != '}' {
		digit, ok := hexValue(p.peek())
		if !ok || value > maxRune {
			return 0, false
		}
		value = value*16 + digit
		digits++
		p.pos++
	}
	if !p.more() || digits == 0 || value > maxRune {
		return 0, false
	}
	p.pos++ // '}'
	return value, true
}

func (p *parser) readUntilBrace() string {
	start := p.pos
	for p.more() && p.peek() != '}' {
		p.pos++
	}
	if !p.more() {
		p.fail()
		return ""
	}
	body := string(p.src[start:p.pos])
	p.pos++ // '}'
	return body
}

func hexValue(char rune) (rune, bool) {
	switch {
	case char >= '0' && char <= '9':
		return char - '0', true
	case char >= 'a' && char <= 'f':
		return char - 'a' + 10, true
	case char >= 'A' && char <= 'F':
		return char - 'A' + 10, true
	}
	return 0, false
}

// parseClass reads a `[...]` character class into one set.
func (p *parser) parseClass() *charSet {
	p.pos++ // '['
	negate := false
	if p.peek() == '^' {
		negate = true
		p.pos++
	}
	out := &charSet{}
	first := true
	for {
		if !p.more() {
			p.fail()
			return nil
		}
		if p.peek() == ']' && !first {
			p.pos++
			break
		}
		if p.peek() == ']' && first {
			// A leading `]` is a literal only in a legacy pattern; treat
			// the empty class as unmodelled rather than guess.
			p.fail()
			return nil
		}
		first = false
		lowSet, lowRune, single := p.parseClassMember()
		if p.failed {
			return nil
		}
		if !single {
			out.addSet(lowSet)
			continue
		}
		// A `-` between two single members makes a range; a trailing one
		// is a literal dash.
		if p.peek() == '-' && p.pos+1 < len(p.src) && p.src[p.pos+1] != ']' {
			p.pos++
			highSet, highRune, highSingle := p.parseClassMember()
			if p.failed {
				return nil
			}
			if !highSingle {
				// `[a-\d]` is not a range; JS reads the dash literally.
				out.addRange(lowRune, lowRune)
				out.addRange('-', '-')
				out.addSet(highSet)
				continue
			}
			if highRune < lowRune {
				p.fail()
				return nil
			}
			out.addRange(lowRune, highRune)
			continue
		}
		out.addRange(lowRune, lowRune)
	}
	out.normalize()
	if negate {
		out = out.negated()
	}
	return out
}

// parseClassMember reads one member of a class: either a multi-code-point
// escape (single is false) or one code point (single is true).
func (p *parser) parseClassMember() (set *charSet, value rune, single bool) {
	if p.peek() != '\\' {
		char := p.peek()
		p.pos++
		return nil, char, true
	}
	p.pos++ // '\'
	if !p.more() {
		p.fail()
		return nil, 0, false
	}
	// Inside a class `\b` is a backspace, not a word boundary.
	if p.peek() == 'b' {
		p.pos++
		return nil, '\b', true
	}
	escaped := p.parseClassEscape()
	if p.failed {
		return nil, 0, false
	}
	if len(escaped.ranges) == 1 && escaped.opaque == "" && escaped.ranges[0].lo == escaped.ranges[0].hi {
		return nil, escaped.ranges[0].lo, true
	}
	return escaped, 0, false
}

// parseQuantifier reads the quantifier that may follow an atom, laziness
// included (`*?` backtracks in a different order but explores the same
// tree, so it is no safer).
func (p *parser) parseQuantifier() (min, max int, ok bool) {
	if !p.more() {
		return 0, 0, false
	}
	switch p.peek() {
	case '*':
		p.pos++
		min, max, ok = 0, unbounded, true
	case '+':
		p.pos++
		min, max, ok = 1, unbounded, true
	case '?':
		p.pos++
		min, max, ok = 0, 1, true
	case '{':
		min, max, ok = p.parseBracedQuantifier()
	default:
		return 0, 0, false
	}
	if ok && p.more() && p.peek() == '?' {
		p.pos++
	}
	return min, max, ok
}

// parseBracedQuantifier reads `{n}`, `{n,}` or `{n,m}`. Anything else
// leaves the position untouched: JS reads a stray `{` as a literal, and
// the atom that produced it already consumed its own text.
func (p *parser) parseBracedQuantifier() (min, max int, ok bool) {
	mark := p.pos
	p.pos++ // '{'
	low, hasLow := p.parseDigits()
	if !hasLow {
		p.pos = mark
		return 0, 0, false
	}
	if p.peek() == '}' {
		p.pos++
		return low, low, true
	}
	if p.peek() != ',' {
		p.pos = mark
		return 0, 0, false
	}
	p.pos++
	if p.peek() == '}' {
		p.pos++
		return low, unbounded, true
	}
	high, hasHigh := p.parseDigits()
	if !hasHigh || p.peek() != '}' || high < low {
		p.pos = mark
		return 0, 0, false
	}
	p.pos++
	return low, high, true
}

func (p *parser) parseDigits() (int, bool) {
	start := p.pos
	value := 0
	for p.more() && p.peek() >= '0' && p.peek() <= '9' {
		value = value*10 + int(p.peek()-'0')
		if value > 1<<20 {
			value = 1 << 20
		}
		p.pos++
	}
	return value, p.pos > start
}

// alwaysSatisfiable reports whether a node can be satisfied by consuming
// nothing, WHEREVER the match has got to. That is stricter than matching
// the empty string: `$` and a lookaround match nothing, but only in the
// right place, so neither counts.
//
// It is the question behind "can this pattern actually be made to blow
// up". Exponential backtracking needs the match to FAIL after the
// ambiguous loop, so the engine goes back and tries the other routes. If
// everything after the loop can always be satisfied, the first greedy
// attempt succeeds and the alternatives are never explored.
func alwaysSatisfiable(n node) bool {
	switch typed := n.(type) {
	case *emptyNode:
		return true
	case *anchorNode, *lookNode, *charsNode:
		return false
	case *concatNode:
		for _, item := range typed.items {
			if !alwaysSatisfiable(item) {
				return false
			}
		}
		return true
	case *altNode:
		for _, option := range typed.options {
			if alwaysSatisfiable(option) {
				return true
			}
		}
		return false
	case *repeatNode:
		return typed.min == 0 || alwaysSatisfiable(typed.body)
	}
	return true
}

// fixedLength returns the one length a node always matches, when it has
// one. A counted repeat of a FIXED-length body splits its text exactly
// one way, however many times it turns: `(?:[A-Za-z0-9+/]{4})*` is the
// base64 format and it is unambiguous. Only a body that can match
// different lengths gives the engine a choice.
func fixedLength(n node) (length int, ok bool) {
	switch typed := n.(type) {
	case *emptyNode, *anchorNode, *lookNode:
		return 0, true
	case *charsNode:
		return 1, true
	case *concatNode:
		total := 0
		for _, item := range typed.items {
			size, fixed := fixedLength(item)
			if !fixed {
				return 0, false
			}
			total += size
		}
		return total, true
	case *altNode:
		first, fixed := fixedLength(typed.options[0])
		if !fixed {
			return 0, false
		}
		for _, option := range typed.options[1:] {
			size, optionFixed := fixedLength(option)
			if !optionFixed || size != first {
				return 0, false
			}
		}
		return first, true
	case *repeatNode:
		if typed.min != typed.max {
			return 0, false
		}
		size, fixed := fixedLength(typed.body)
		if !fixed {
			return 0, false
		}
		return size * typed.min, true
	}
	return 0, false
}

// matchesEmpty reports whether a node can match the empty string. It is
// the whole of the nullable-loop rule and it is exact, so it is worth
// keeping separate from the automaton walk.
func matchesEmpty(n node) bool {
	switch typed := n.(type) {
	case *emptyNode, *lookNode, *anchorNode:
		return true
	case *charsNode:
		return false
	case *concatNode:
		for _, item := range typed.items {
			if !matchesEmpty(item) {
				return false
			}
		}
		return true
	case *altNode:
		for _, option := range typed.options {
			if matchesEmpty(option) {
				return true
			}
		}
		return false
	case *repeatNode:
		return typed.min == 0 || matchesEmpty(typed.body)
	}
	return true
}
