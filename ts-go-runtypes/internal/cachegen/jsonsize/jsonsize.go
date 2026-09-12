// Package jsonsize computes the largest compact-JSON byte size a VALID value of
// a type can have, at build time, from the reflection graph alone.
//
// The number backs the per-route request and response limits of the mion
// router: a route whose params are fully bounded (every string carries a
// `length` / `maxLength`, every array a `length` / `maxItems`, every Map / Set
// a `maxItems`, and every scalar has a fixed longest spelling) gets a limit
// derived from its types, while a type with any unbounded part reports
// Bounded=false and the route falls back to the router default.
//
// The walk is a sibling of the binary cold-start estimator
// (cachegen/typefunctions/binary_size_estimate.go) but answers a different
// question: not "how many bytes will a typical binary encoding take" but "how
// many bytes can a compact JSON body of this type reach, at most". So every
// arm is a worst case: 6 bytes per UTF-16 unit for a string (the `\uXXXX`
// escape form), 24 for a number (the longest `JSON.stringify` double), every
// optional member present, the largest union member. The `compact` encoder
// strategy tuples objects into positional arrays, which is never larger than
// the keyed form, so the keyed maximum covers it too.
package jsonsize

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"unicode/utf16"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Byte budgets of the fixed-spelling scalars, quotes included where the value
// is a JSON string.
const (
	boolBytes = 5  // `false`
	nullBytes = 4  // `null`, also what a dropped tuple member becomes
	numBytes  = 24 // `-1.7976931348623157e+308`
	dateBytes = 32 // `"+275760-09-13T00:00:00.000Z"` (29) with slack
	// A Temporal value whose toJSON() has a fixed layout: the ISO text plus a
	// `[u-ca=<calendar>]` annotation, which a non-ISO calendar appends.
	temporalBytes = 96
	// bytes per UTF-16 code unit in the escaped worst case (the `\\uXXXX`
	// form); an astral character is two units, so 12 bytes, which the same
	// rule covers.
	stringUnitBytes = 6
	// The encoder's wire envelopes (cachegen/typefunctions): a root `undefined`
	// / `void` has no JSON document of its own, so the composite encoder ships
	// `[null]` (rootNeedsDataOnlyWrap); a flat union may wrap every member in
	// `[<memberIndex>,` … `]` or `[-1,` … `]` (union_flat_layout.go). The walk
	// budgets both whenever they CAN apply: this is a bound, never a size, and
	// the json-size fuzz lane (test/fuzz/type/jsonSizeBound) checks it against
	// the compiled encoder's real output.
	rootUndefinedBytes = 6 // `[null]`
	// depthCap bounds recursion through ID-less inline nodes; ID-bearing nodes
	// are memoized and cycle-checked by id instead.
	depthCap = 64
)

// Result is the walk's answer for one type.
type Result struct {
	// Bytes is the largest compact-JSON size a valid value can have. Only
	// meaningful when Bounded is true.
	Bytes int
	// Bounded reports whether every part of the type has a declared or
	// intrinsic maximum. False means Bytes is not a bound.
	Bounded bool
	// UnboundedPath names the first unbounded member the walk met, as a
	// dotted / bracketed path from the root (`items[].name`, `<value>` for a
	// Map value), with the reason after a colon. Empty when Bounded.
	UnboundedPath string
}

// MaxBytes walks rt and returns its Result. refTable resolves KindRef child
// sentinels (the session cache, or the dump's node index).
//
// This is a per-kind descent, not reflection.WalkGraph: the JSON size of a
// node is a function of its kind and of the slots that reach the wire (a
// property's Child, a tuple's Children, a Map's key / value Arguments), so
// each arm reads exactly those slots and every other slot (Parameters,
// Return, TypeMeta, the union discriminators, Extends / Implements) is
// deliberately not sized. The guard against a forgotten slot is
// TestMaxBytes_VisitsEveryWireSlot, which pins that on a bounded graph the
// walk reaches every node WalkGraph reaches; a kind with no arm is never
// claimed bounded (the default arm).
func MaxBytes(rt *reflection.RunType, refTable map[string]*reflection.RunType) Result {
	walker := newWalker(refTable)
	if root := walker.deref(rt); root != nil && (root.Kind == reflection.KindUndefined || root.Kind == reflection.KindVoid) {
		return bounded(rootUndefinedBytes)
	}
	return walker.walk(rt, "", 0)
}

func newWalker(refTable map[string]*reflection.RunType) *walker {
	return &walker{refTable: refTable, memo: map[string]Result{}, inflight: map[string]bool{}, visited: map[string]bool{}}
}

type walker struct {
	refTable map[string]*reflection.RunType
	memo     map[string]Result
	inflight map[string]bool
	// visited records every id-bearing node the walk sized, for the slot
	// coverage test.
	visited map[string]bool
}

func (w *walker) deref(rt *reflection.RunType) *reflection.RunType {
	if rt != nil && rt.Kind == reflection.KindRef {
		return w.refTable[rt.ID]
	}
	return rt
}

func unbounded(path, reason string) Result {
	return Result{UnboundedPath: path + ": " + reason}
}

func bounded(n int) Result {
	return Result{Bytes: n, Bounded: true}
}

// walk resolves refs, memoizes by id, breaks cycles (a recursive type has no
// finite maximum) and dispatches on kind.
func (w *walker) walk(rt *reflection.RunType, path string, depth int) Result {
	rt = w.deref(rt)
	if rt == nil {
		return unbounded(path, "unresolved type")
	}
	if depth > depthCap {
		return unbounded(path, "nesting too deep")
	}
	if rt.ID != "" {
		w.visited[rt.ID] = true
		if cached, ok := w.memo[rt.ID]; ok {
			return cached
		}
		if w.inflight[rt.ID] {
			return unbounded(path, "recursive type")
		}
		w.inflight[rt.ID] = true
		defer delete(w.inflight, rt.ID)
	}
	result := w.walkKind(rt, path, depth)
	if rt.ID != "" {
		w.memo[rt.ID] = result
	}
	return result
}

func (w *walker) walkKind(rt *reflection.RunType, path string, depth int) Result {
	switch rt.Kind {
	case reflection.KindBoolean:
		return bounded(boolBytes)
	case reflection.KindNull, reflection.KindUndefined, reflection.KindVoid, reflection.KindNever:
		return bounded(nullBytes)
	case reflection.KindNumber:
		return bounded(numBytes)
	case reflection.KindBigInt:
		return bigintBytes(rt, path)
	case reflection.KindString:
		return stringBytes(rt, path)
	case reflection.KindTemplateLiteral:
		return templateLiteralBytes(rt, path)
	case reflection.KindLiteral, reflection.KindEnumMember:
		return bounded(jsonLiteralLen(rt.Literal))
	case reflection.KindEnum:
		return enumBytes(rt)
	case reflection.KindArray:
		return w.arrayBytes(rt, rt.Child, path, depth)
	case reflection.KindTuple:
		return w.tupleBytes(rt, path, depth)
	case reflection.KindObjectLiteral, reflection.KindIntersection:
		return w.objectBytes(rt, path, depth)
	case reflection.KindUnion:
		return w.unionBytes(rt, path, depth)
	case reflection.KindClass:
		return w.classBytes(rt, path, depth)
	case reflection.KindProperty, reflection.KindPropertySignature, reflection.KindTupleMember, reflection.KindParameter:
		return w.walk(rt.Child, path, depth+1)
	case reflection.KindRest:
		return w.arrayBytes(rt, rt.Child, path, depth)
	case reflection.KindFunction, reflection.KindMethod, reflection.KindMethodSignature, reflection.KindSymbol, reflection.KindPromise:
		// JSON.stringify drops these: absent in an object, `null` in an array.
		return bounded(nullBytes)
	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject:
		return unbounded(path, "any / unknown / object has no shape")
	case reflection.KindRegexp:
		return unbounded(path, "a RegExp source has no length bound")
	default:
		return unbounded(path, "kind "+strconv.Itoa(int(rt.Kind))+" has no JSON size rule")
	}
}

// stringBytes: quotes + the escaped worst case per unit, bounded only by a
// `length` / `maxLength` param (any string format family reads the same keys).
func stringBytes(rt *reflection.RunType, path string) Result {
	if n, ok := maxLengthParam(rt, "length", "maxLength"); ok {
		return bounded(2 + stringUnitBytes*n)
	}
	return unbounded(path, "string without maxLength")
}

// maxLengthParam reads the exact key first, then the max key, from the node's
// format params. Both count UTF-16 units for strings and entries for
// collections.
func maxLengthParam(rt *reflection.RunType, exactKey, maxKey string) (int, bool) {
	if rt == nil || rt.FormatAnnotation == nil {
		return 0, false
	}
	params := rt.FormatAnnotation.Params
	if value, ok := formats.ReadNumberParam(params, exactKey); ok && value >= 0 {
		return int(value), true
	}
	if value, ok := formats.ReadNumberParam(params, maxKey); ok && value >= 0 {
		return int(value), true
	}
	return 0, false
}

// bigintBytes: a bigint rides the wire as a decimal string, so it is bounded
// only when its brand bounds both ends; the budget is the longest of the
// bounds' digit counts plus a sign and the quotes.
func bigintBytes(rt *reflection.RunType, path string) Result {
	if rt.FormatAnnotation == nil {
		return unbounded(path, "bigint without min and max")
	}
	params := rt.FormatAnnotation.Params
	digits := 0
	lower, upper := false, false
	for _, key := range []string{"min", "gt"} {
		if value, ok := params[key]; ok {
			lower = true
			digits = max(digits, bigintDigitLen(value))
		}
	}
	for _, key := range []string{"max", "lt"} {
		if value, ok := params[key]; ok {
			upper = true
			digits = max(digits, bigintDigitLen(value))
		}
	}
	if !lower || !upper {
		return unbounded(path, "bigint without min and max")
	}
	return bounded(2 + 1 + digits)
}

func bigintDigitLen(value any) int {
	if meta, ok := value.(map[string]any); ok {
		if inner, ok := meta["val"]; ok {
			return bigintDigitLen(inner)
		}
	}
	text := fmt.Sprint(value)
	if len(text) > 0 && text[len(text)-1] == 'n' {
		text = text[:len(text)-1]
	}
	return len([]rune(text))
}

// templateLiteralBytes: the rendered template is ONE string. Static texts and
// number / literal placeholders are bounded; a `${string}` placeholder is not.
func templateLiteralBytes(rt *reflection.RunType, path string) Result {
	envelope, ok := rt.Literal.(map[string]any)
	if !ok {
		return stringBytes(rt, path)
	}
	inner, ok := envelope["templateLiteral"].(map[string]any)
	if !ok {
		return stringBytes(rt, path)
	}
	texts, _ := inner["texts"].([]any)
	placeholders, _ := inner["placeholders"].([]any)
	units := 0
	for _, textAny := range texts {
		if text, ok := textAny.(string); ok {
			units += utf16Len(text)
		}
	}
	for _, placeholderAny := range placeholders {
		placeholder, ok := placeholderAny.(map[string]any)
		if !ok {
			continue
		}
		switch spanKind(placeholder) {
		case int(reflection.KindNumber):
			units += numBytes
		case int(reflection.KindLiteral):
			units += utf16Len(fmt.Sprint(placeholder["literal"]))
		case int(reflection.KindBoolean):
			units += boolBytes
		default:
			return unbounded(path, "template literal with an unbounded placeholder")
		}
	}
	return bounded(2 + stringUnitBytes*units)
}

func spanKind(span map[string]any) int {
	switch value := span["kind"].(type) {
	case int:
		return value
	case float64:
		return int(value)
	case int64:
		return int(value)
	}
	return -1
}

// enumBytes: the largest member's JSON spelling.
func enumBytes(rt *reflection.RunType) Result {
	longest := 0
	for _, value := range rt.Values {
		longest = max(longest, jsonLiteralLen(value))
	}
	return bounded(longest)
}

// arrayBytes: `[` + n × element + (n − 1) commas + `]`, bounded only by a
// `length` / `maxItems` on the array node (a tuple rest carries the params on
// the rest node itself) and a bounded element.
func (w *walker) arrayBytes(node, element *reflection.RunType, path string, depth int) Result {
	count, ok := maxLengthParam(node, "length", "maxItems")
	if !ok {
		return unbounded(path, "array without maxItems")
	}
	item := w.walk(element, path+"[]", depth+1)
	if !item.Bounded {
		return item
	}
	return bounded(collectionBytes(count, item.Bytes))
}

func collectionBytes(count, itemBytes int) int {
	if count <= 0 {
		return 2
	}
	return 2 + count*itemBytes + (count - 1)
}

// tupleBytes: brackets + every member (optional ones count in full, a dropped
// member still costs `null`) + commas; a rest member takes the array rule.
func (w *walker) tupleBytes(rt *reflection.RunType, path string, depth int) Result {
	total := 2
	members := 0
	for i, child := range rt.Children {
		member := w.deref(child)
		if member == nil {
			return unbounded(path+"["+strconv.Itoa(i)+"]", "unresolved tuple member")
		}
		memberPath := path + "[" + strconv.Itoa(i) + "]"
		var result Result
		if member.Kind == reflection.KindRest {
			result = w.arrayBytes(member, member.Child, memberPath, depth)
			if !result.Bounded {
				return result
			}
			// the rest's own brackets are not on the wire: its items are spliced in
			total += result.Bytes - 2 + 1
			continue
		}
		result = w.walk(member, memberPath, depth+1)
		if !result.Bounded {
			return result
		}
		total += result.Bytes
		members++
	}
	if members > 1 {
		total += members - 1
	}
	return bounded(total)
}

// objectBytes: braces + every data property as `"key":value` (optional ones
// counted present) + commas. Methods and statics never reach the wire; an
// index signature has no key bound, so a record is unbounded.
func (w *walker) objectBytes(rt *reflection.RunType, path string, depth int) Result {
	// patternProperties are index signatures by another name: keys matching a
	// pattern, with no count bound, so the object is open-ended like a record.
	if len(rt.PatternProps) > 0 {
		return unbounded(path+"[pattern]", "patternProperties has no key bound")
	}
	total := 2
	props := 0
	for _, child := range rt.Children {
		member := w.deref(child)
		if member == nil || member.IsStatic {
			continue
		}
		if member.Kind == reflection.KindIndexSignature {
			return unbounded(path+"[key]", "index signature has no key bound")
		}
		if member.Kind != reflection.KindProperty && member.Kind != reflection.KindPropertySignature {
			continue
		}
		if member.Child == nil {
			continue
		}
		memberPath := path + "." + member.Name
		if path == "" {
			memberPath = member.Name
		}
		// walked through the property node itself (its arm sizes the Child), so
		// the property is memoized and counted as visited like every other node
		value := w.walk(child, memberPath, depth+1)
		if !value.Bounded {
			return value
		}
		total += jsonLiteralLen(member.Name) + 1 + value.Bytes
		props++
	}
	if props > 1 {
		total += props - 1
	}
	return bounded(total)
}

// unionBytes: the largest member plus the flat-union envelope, bounded only
// when every member is. The encoder wraps a member as `[<index>,value]` (or
// `[-1,value]`) whenever the union carries a transform or an object member;
// the walk cannot see the emitter's layout decision, so it always budgets the
// widest envelope the member count allows.
func (w *walker) unionBytes(rt *reflection.RunType, path string, depth int) Result {
	if len(rt.Children) == 0 {
		return bounded(nullBytes)
	}
	largest := 0
	for i, member := range rt.Children {
		result := w.walk(member, path+"|"+strconv.Itoa(i), depth+1)
		if !result.Bounded {
			return result
		}
		largest = max(largest, result.Bytes)
	}
	return bounded(largest + unionEnvelopeBytes(len(rt.Children)))
}

// unionEnvelopeBytes: `[` + the widest member index (`-1`, or the last index)
// + `,` + `]`.
func unionEnvelopeBytes(members int) int {
	return 1 + max(len("-1"), len(strconv.Itoa(members-1))) + 1 + 1
}

// classBytes: the builtins with a fixed JSON spelling are constants; a Map is
// an array of `[key,value]` pairs and a Set an array of items, both bounded
// only by a `maxItems` (the count key of their structural bag); a plain user
// class is unbounded.
func (w *walker) classBytes(rt *reflection.RunType, path string, depth int) Result {
	switch rt.SubKind {
	case reflection.SubKindDate:
		return bounded(dateBytes)
	case reflection.SubKindMap:
		count, ok := maxLengthParam(rt, "length", "maxItems")
		if !ok {
			return unbounded(path, "Map without maxItems")
		}
		key, value := w.mapElements(rt, path, depth)
		if !key.Bounded {
			return key
		}
		if !value.Bounded {
			return value
		}
		return bounded(collectionBytes(count, key.Bytes+value.Bytes+3))
	case reflection.SubKindSet:
		count, ok := maxLengthParam(rt, "length", "maxItems")
		if !ok {
			return unbounded(path, "Set without maxItems")
		}
		item := w.setElement(rt, path, depth)
		if !item.Bounded {
			return item
		}
		return bounded(collectionBytes(count, item.Bytes))
	case reflection.SubKindTemporalInstant, reflection.SubKindTemporalPlainTime, reflection.SubKindTemporalPlainDate,
		reflection.SubKindTemporalPlainDateTime, reflection.SubKindTemporalPlainYearMonth, reflection.SubKindTemporalPlainMonthDay:
		return bounded(temporalBytes)
	case reflection.SubKindTemporalZonedDateTime:
		return unbounded(path, "ZonedDateTime carries a time zone name of any length")
	case reflection.SubKindTemporalDuration:
		return unbounded(path, "Duration digits have no bound")
	case reflection.SubKindNonSerializable:
		return bounded(nullBytes)
	case reflection.SubKindNone:
		// A user class takes the registered-serializer road when one exists
		// (registration happens at runtime, so the build cannot know), and that
		// output is opaque: no structural bound would be honest.
		return unbounded(path, "a class instance may use a registered serializer")
	default:
		return unbounded(path, "class has no JSON size rule")
	}
}

// mapElements / setElement resolve the element types a Map / Set carries on
// its SubKind-tagged Arguments (appendMapArguments / appendSetArguments in
// runtype/serialize.go), NOT on Children.
func (w *walker) mapElements(rt *reflection.RunType, path string, depth int) (key, value Result) {
	key = unbounded(path+"<key>", "Map key type missing")
	value = unbounded(path+"<value>", "Map value type missing")
	for _, child := range rt.Arguments {
		member := w.deref(child)
		if member == nil {
			continue
		}
		switch member.SubKind {
		case reflection.SubKindMapKey:
			key = w.walk(member, path+"<key>", depth+1)
		case reflection.SubKindMapValue:
			value = w.walk(member, path+"<value>", depth+1)
		}
	}
	return key, value
}

func (w *walker) setElement(rt *reflection.RunType, path string, depth int) Result {
	item := unbounded(path+"<item>", "Set item type missing")
	for _, child := range rt.Arguments {
		member := w.deref(child)
		if member != nil && member.SubKind == reflection.SubKindSetItem {
			item = w.walk(member, path+"<item>", depth+1)
		}
	}
	return item
}

// jsonLiteralLen is the byte length of a literal's compact JSON spelling
// (`JSON.stringify` never escapes `<` / `>` / `&`, so neither does this).
func jsonLiteralLen(value any) int {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nullBytes
	}
	return buffer.Len() - 1 // Encode appends a newline
}

func utf16Len(text string) int {
	return len(utf16.Encode([]rune(text)))
}
