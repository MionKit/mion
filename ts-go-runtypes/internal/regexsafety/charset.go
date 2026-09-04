package regexsafety

import (
	"sort"
	"unicode"
)

// maxRune is the largest code point a JS pattern can match.
const maxRune = 0x10FFFF

// runeRange is an inclusive code point range.
type runeRange struct {
	lo, hi rune
}

// charSet is the set of code points one atom of a pattern can consume:
// a sorted list of disjoint, merged ranges. The `opaque` name is the
// escape hatch for an atom this package does not model (a backreference):
// an opaque set consumes SOMETHING, so it never makes a loop body
// nullable, but it only ever overlaps another opaque set carrying the
// same name — an unmodelled atom must not invent an overlap that turns a
// fine pattern into a build error.
type charSet struct {
	ranges []runeRange
	opaque string
}

func newCharSet(ranges ...runeRange) *charSet {
	set := &charSet{ranges: append([]runeRange(nil), ranges...)}
	set.normalize()
	return set
}

func singleRune(value rune) *charSet {
	return &charSet{ranges: []runeRange{{value, value}}}
}

func opaqueSet(name string) *charSet {
	return &charSet{opaque: name}
}

// normalize sorts the ranges and merges the ones that touch or overlap,
// so every later operation can assume a canonical form.
func (s *charSet) normalize() {
	if len(s.ranges) < 2 {
		return
	}
	sort.Slice(s.ranges, func(a, b int) bool {
		if s.ranges[a].lo != s.ranges[b].lo {
			return s.ranges[a].lo < s.ranges[b].lo
		}
		return s.ranges[a].hi < s.ranges[b].hi
	})
	merged := s.ranges[:1]
	for _, next := range s.ranges[1:] {
		last := &merged[len(merged)-1]
		if next.lo <= last.hi+1 {
			if next.hi > last.hi {
				last.hi = next.hi
			}
			continue
		}
		merged = append(merged, next)
	}
	s.ranges = merged
}

func (s *charSet) addRange(lo, hi rune) {
	if lo > hi {
		lo, hi = hi, lo
	}
	s.ranges = append(s.ranges, runeRange{lo, hi})
}

func (s *charSet) addSet(other *charSet) {
	if other == nil {
		return
	}
	s.ranges = append(s.ranges, other.ranges...)
}

func (s *charSet) isEmpty() bool {
	return s.opaque == "" && len(s.ranges) == 0
}

// negated returns the complement over the whole code point space. Only
// meaningful for a concrete set; an opaque atom has no complement, so it
// negates to itself.
func (s *charSet) negated() *charSet {
	if s.opaque != "" {
		return s
	}
	out := &charSet{}
	next := rune(0)
	for _, r := range s.ranges {
		if r.lo > next {
			out.ranges = append(out.ranges, runeRange{next, r.lo - 1})
		}
		if r.hi+1 > next {
			next = r.hi + 1
		}
	}
	if next <= maxRune {
		out.ranges = append(out.ranges, runeRange{next, maxRune})
	}
	return out
}

// intersects reports whether some code point satisfies both sets — the
// one question the ambiguity walk asks of two transitions.
func (s *charSet) intersects(other *charSet) bool {
	if s == nil || other == nil {
		return false
	}
	if s.opaque != "" || other.opaque != "" {
		return s.opaque != "" && other.opaque != "" && s.opaque == other.opaque
	}
	left, right := 0, 0
	for left < len(s.ranges) && right < len(other.ranges) {
		a, b := s.ranges[left], other.ranges[right]
		if a.hi < b.lo {
			left++
			continue
		}
		if b.hi < a.lo {
			right++
			continue
		}
		return true
	}
	return false
}

// foldRuneLimit caps the ranges case folding walks rune by rune. A wide
// range (a Unicode category, `.`) already covers both cases of anything
// inside it, so folding it would add nothing.
const foldRuneLimit = 1024

// folded returns the set a case-insensitive (`i` flag) pattern really
// matches: every code point plus its simple case variants.
func (s *charSet) folded() *charSet {
	if s.opaque != "" {
		return s
	}
	out := &charSet{ranges: append([]runeRange(nil), s.ranges...)}
	for _, r := range s.ranges {
		if r.hi-r.lo >= foldRuneLimit {
			continue
		}
		for value := r.lo; value <= r.hi; value++ {
			for variant := unicode.SimpleFold(value); variant != value; variant = unicode.SimpleFold(variant) {
				out.ranges = append(out.ranges, runeRange{variant, variant})
			}
		}
	}
	out.normalize()
	return out
}

// The predefined class escapes, spelled once.
func digitSet() *charSet { return newCharSet(runeRange{'0', '9'}) }

func wordSet() *charSet {
	return newCharSet(
		runeRange{'0', '9'},
		runeRange{'A', 'Z'},
		runeRange{'_', '_'},
		runeRange{'a', 'z'},
	)
}

// spaceSet is JS `\s`: the WhiteSpace and LineTerminator productions.
func spaceSet() *charSet {
	return newCharSet(
		runeRange{'\t', '\r'},
		runeRange{' ', ' '},
		runeRange{0x00a0, 0x00a0},
		runeRange{0x1680, 0x1680},
		runeRange{0x2000, 0x200a},
		runeRange{0x2028, 0x2029},
		runeRange{0x202f, 0x202f},
		runeRange{0x205f, 0x205f},
		runeRange{0x3000, 0x3000},
		runeRange{0xfeff, 0xfeff},
	)
}

func lineTerminatorSet() *charSet {
	return newCharSet(
		runeRange{'\n', '\n'},
		runeRange{'\r', '\r'},
		runeRange{0x2028, 0x2029},
	)
}

func anyRuneSet() *charSet { return newCharSet(runeRange{0, maxRune}) }

// unicodePropertySet resolves a `\p{...}` body to real code point
// ranges, so two property escapes intersect exactly instead of by guess.
// Accepts the general category (`L`, `Nd`), its long alias
// (`Letter`, `Number`), a `Script=`/`sc=` value, and the binary
// properties Go's unicode tables carry. Returns nil for a name this
// build does not know, and the caller falls back to an opaque atom.
func unicodePropertySet(body string) *charSet {
	name := body
	if key, value, found := cutProperty(body); found {
		switch key {
		case "script", "sc":
			return tableToSet(unicode.Scripts[canonicalPropertyName(value)])
		case "general_category", "gc":
			name = value
		default:
			return nil
		}
	}
	name = canonicalPropertyName(name)
	if table, ok := unicode.Categories[name]; ok {
		return tableToSet(table)
	}
	if table, ok := unicode.Scripts[name]; ok {
		return tableToSet(table)
	}
	if table, ok := unicode.Properties[name]; ok {
		return tableToSet(table)
	}
	return nil
}

// canonicalPropertyName maps the long spellings JS accepts onto the
// short names Go's tables are keyed by.
func canonicalPropertyName(name string) string {
	switch name {
	case "Letter":
		return "L"
	case "Mark", "Combining_Mark":
		return "M"
	case "Number":
		return "N"
	case "Punctuation", "punct":
		return "P"
	case "Symbol":
		return "S"
	case "Separator":
		return "Z"
	case "Other":
		return "C"
	case "Uppercase_Letter":
		return "Lu"
	case "Lowercase_Letter":
		return "Ll"
	case "Titlecase_Letter":
		return "Lt"
	case "Modifier_Letter":
		return "Lm"
	case "Other_Letter":
		return "Lo"
	case "Decimal_Number", "digit":
		return "Nd"
	case "Letter_Number":
		return "Nl"
	case "Other_Number":
		return "No"
	case "Space_Separator":
		return "Zs"
	case "Line_Separator":
		return "Zl"
	case "Paragraph_Separator":
		return "Zp"
	}
	return name
}

func cutProperty(body string) (key, value string, found bool) {
	for index := 0; index < len(body); index++ {
		if body[index] == '=' {
			return lowerASCII(body[:index]), body[index+1:], true
		}
	}
	return "", "", false
}

func lowerASCII(text string) string {
	out := []byte(text)
	for index, char := range out {
		if char >= 'A' && char <= 'Z' {
			out[index] = char + ('a' - 'A')
		}
	}
	return string(out)
}

func tableToSet(table *unicode.RangeTable) *charSet {
	if table == nil {
		return nil
	}
	out := &charSet{}
	for _, r := range table.R16 {
		if r.Stride != 1 {
			for value := rune(r.Lo); value <= rune(r.Hi); value += rune(r.Stride) {
				out.addRange(value, value)
			}
			continue
		}
		out.addRange(rune(r.Lo), rune(r.Hi))
	}
	for _, r := range table.R32 {
		if r.Stride != 1 {
			for value := rune(r.Lo); value <= rune(r.Hi); value += rune(r.Stride) {
				out.addRange(value, value)
			}
			continue
		}
		out.addRange(rune(r.Lo), rune(r.Hi))
	}
	out.normalize()
	return out
}
