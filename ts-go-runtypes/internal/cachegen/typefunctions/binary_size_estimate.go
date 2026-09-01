package typefunctions

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// maxVarintBytes mirrors dataView.ts MAX_VARINT — the length prefix every
// serString write reserves (worst case MAX_VARINT + 3*charLength). The estimate
// budgets that reserve where a value is type-constrained (enum / index-sig keys).
const maxVarintBytes = 5

// Compile-time buffer-size estimator for createBinaryEncoderFn. It walks a type
// graph and returns an estimated on-wire byte count, baked into the `tb` entry
// and used at runtime as the `dynamic` strategy's cold-start buffer size (in
// place of the flat defaultBufferSize fallback) until per-key history warms up.
//
// The walk mirrors the binary_to.go byte accounting — float64 numbers = 8
// bytes, packed numeric/bigint widths via the format BinarySizer (the SAME
// min/max logic EmitToBinary uses, so the two can't drift), 1-byte
// bool/null/void, varint framing, optional-property bitmaps, union
// discriminators, temporal layouts — and anchors unbounded variable parts
// (strings, collections) on the config defaults, interpolating min↔max by Bias.
//
// The result need NOT be exact: it is only a SEED. If it under-shoots, the
// dynamic serializer grows in place on the first encode; if it over-shoots,
// one cold buffer is a little large. So the walk favours a generous estimate
// (Bias defaults to 0.8) and is capped per subtree at cfg.MaxBytes.

// sizeEstimateDepthCap bounds recursion through ID-less inline nodes. ID-bearing
// nodes (the common case — cache children are KindRef sentinels resolving to
// canonical, interned types) are memoized instead, so the walk is O(distinct
// types); this cap only backstops the rare un-interned inline subtree.
const sizeEstimateDepthCap = 8

// binaryToFamilyTag is the family tag of createBinaryEncoderFn's cache entries —
// the only family carrying a cold-start size estimate. Mirrors
// constants.CacheModules["toBinary"].Tag (guarded below).
const binaryToFamilyTag = "tb"

func init() {
	if constants.CacheModules["toBinary"].Tag != binaryToFamilyTag {
		panic("typefns: binaryToFamilyTag out of sync with constants.CacheModules[\"toBinary\"].Tag")
	}
}

// binaryColdStartEstimate returns the cold-start buffer estimate to bake into a
// tb (binary-encoder) entry. It is 0 — meaning "no estimate slot" — for any
// other family, an option variant, or a nil type.
func binaryColdStartEstimate(settings constants.CacheModuleSettings, variantSuffix string, runType *reflection.RunType, refTable map[string]*reflection.RunType, cfg SizeEstimateConfig) int {
	if settings.Tag != binaryToFamilyTag || variantSuffix != "" || runType == nil {
		return 0
	}
	return EstimateBinarySize(runType, refTable, cfg)
}

// SizeEstimateConfig parameterises EstimateBinarySize. Invalid Items /
// StringBytes / MaxBytes fall back to the constants.DefaultSize* values; Bias is
// only clamped to [0,1] (0 is a valid "tightest" setting, so it is never bumped
// to the default — a zero-value config therefore estimates tightest, while the
// production CLI/plugin path passes constants.DefaultSizeBias).
type SizeEstimateConfig struct {
	Bias        float64
	Items       int
	StringBytes int
	MaxBytes    int
}

func (cfg SizeEstimateConfig) normalized() SizeEstimateConfig {
	if cfg.Bias < 0 {
		cfg.Bias = 0
	} else if cfg.Bias > 1 {
		cfg.Bias = 1
	}
	if cfg.Items <= 0 {
		cfg.Items = constants.DefaultSizeItems
	}
	if cfg.StringBytes <= 0 {
		cfg.StringBytes = constants.DefaultSizeStringBytes
	}
	if cfg.MaxBytes <= 0 {
		cfg.MaxBytes = constants.DefaultSizeMaxBytes
	}
	return cfg
}

// EstimateBinarySize returns the cold-start buffer estimate for rt's binary
// encoding. refTable resolves KindRef child sentinels (the full session cache,
// as renderEntryWithDeps holds). The result is clamped to [1, cfg.MaxBytes].
func EstimateBinarySize(rt *reflection.RunType, refTable map[string]*reflection.RunType, cfg SizeEstimateConfig) int {
	est := &sizeEstimator{
		refTable: refTable,
		cfg:      cfg.normalized(),
		memo:     map[string]int{},
		inflight: map[string]bool{},
	}
	n := est.estimate(rt, 0)
	if n < 1 {
		n = 1
	}
	return n
}

type sizeEstimator struct {
	refTable map[string]*reflection.RunType
	cfg      SizeEstimateConfig
	memo     map[string]int
	inflight map[string]bool
}

func (e *sizeEstimator) deref(rt *reflection.RunType) *reflection.RunType {
	if rt != nil && rt.Kind == reflection.KindRef {
		return e.refTable[rt.ID]
	}
	return rt
}

// estimate resolves refs, memoizes per type id, breaks cycles, clamps each
// subtree to cfg.MaxBytes, and dispatches to estimateRaw.
func (e *sizeEstimator) estimate(rt *reflection.RunType, depth int) int {
	rt = e.deref(rt)
	if rt == nil || depth > sizeEstimateDepthCap {
		return e.cfg.StringBytes
	}
	if rt.ID != "" {
		if v, ok := e.memo[rt.ID]; ok {
			return v
		}
		if e.inflight[rt.ID] {
			return e.cfg.StringBytes // cycle — rough placeholder, broken here
		}
		e.inflight[rt.ID] = true
	}
	n := e.estimateRaw(rt, depth)
	if n > e.cfg.MaxBytes {
		n = e.cfg.MaxBytes
	}
	if rt.ID != "" {
		delete(e.inflight, rt.ID)
		e.memo[rt.ID] = n
	}
	return n
}

func (e *sizeEstimator) estimateRaw(rt *reflection.RunType, depth int) int {
	switch rt.Kind {
	case reflection.KindBoolean, reflection.KindNull, reflection.KindUndefined, reflection.KindVoid:
		return 1
	case reflection.KindNumber:
		return e.numberBytes(rt)
	case reflection.KindBigInt:
		return e.bigintBytes(rt)
	case reflection.KindString:
		return e.stringBytes(rt)
	case reflection.KindTemplateLiteral:
		return e.templateLiteralBytes(rt)
	case reflection.KindLiteral:
		return 0 // value restored from the type — no wire bytes
	case reflection.KindEnum:
		return e.enumBytes(rt)
	case reflection.KindArray:
		return e.collectionBytes(rt, e.estimate(rt.Child, depth+1))
	case reflection.KindObjectLiteral, reflection.KindIntersection:
		return e.objectBytes(rt, depth)
	case reflection.KindTuple:
		return e.tupleBytes(rt, depth)
	case reflection.KindUnion:
		return e.unionBytes(rt, depth)
	case reflection.KindClass:
		return e.classBytes(rt, depth)
	case reflection.KindRegexp:
		// two strings (source + flags); flags are short. Floor at 8 so even the
		// minimal `/a/` (serString source reserve 5+3) never grows the buffer.
		body := e.cfg.StringBytes
		est := varintByteLen(body) + body + 2 + 1
		if est < 8 {
			est = 8
		}
		return est
	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject:
		body := e.cfg.StringBytes // JSON.stringify fallback
		return varintByteLen(body) + body
	case reflection.KindProperty, reflection.KindPropertySignature, reflection.KindTupleMember, reflection.KindRest, reflection.KindParameter:
		// KindParameter wraps a Map key/value or Set item (the role is on SubKind;
		// the element type is the Child) — measure the element it carries.
		return e.estimate(rt.Child, depth+1)
	default:
		return 0 // non-serializable (function / symbol / promise / …) or unknown
	}
}

// numberBytes — packed width from the format BinarySizer, else float64 (8).
func (e *sizeEstimator) numberBytes(rt *reflection.RunType) int {
	if w := formatFixedWidth(rt); w > 0 {
		return w
	}
	return 8
}

// bigintBytes — 8 when a 64-bit format packs it, else the decimal-string arm,
// whose reserve is MAX_VARINT + 3*digits. An unbranded bigint is mock-bounded to
// |value|<=9999 (5 chars); a non-packing BRAND is mocked within its own [min,max]
// (ignoring that bound), so budget the longest decimal the brand can emit.
func (e *sizeEstimator) bigintBytes(rt *reflection.RunType) int {
	if w := formatFixedWidth(rt); w > 0 {
		return w
	}
	maxDigits := 5 // unbranded mock bound "-9999"
	if rt.FormatAnnotation != nil {
		maxDigits = brandedBigintMaxDigits(rt.FormatAnnotation.Params)
	}
	if est := maxVarintBytes + 3*maxDigits; est > 21 {
		return est
	}
	return 21 // floor: the unbranded 20-digit assumption (varint(20)+20)
}

// brandedBigintMaxDigits returns the longest decimal string mockBigIntParams can
// emit for a non-packing bigint brand: the max char length over its bound params
// (min / max / gt / lt), floored at the default range's "-99999" (6). Param values
// arrive as decimal strings, so their length IS the digit count (over-counts a
// brand wider than the mock's ±MAX_SAFE clamp, which is sound).
func brandedBigintMaxDigits(params map[string]any) int {
	digits := 6 // mockBigIntParams default range -99999..99999
	for _, key := range []string{"min", "max", "gt", "lt"} {
		if value, ok := params[key]; ok {
			if n := bigintParamDigitLen(value); n > digits {
				digits = n
			}
		}
	}
	return digits
}

func bigintParamDigitLen(value any) int {
	if meta, ok := value.(map[string]any); ok {
		if inner, ok := meta["val"]; ok {
			return bigintParamDigitLen(inner)
		}
	}
	return len([]rune(strings.TrimSuffix(fmt.Sprint(value), "n")))
}

// templateLiteralBytes — the whole rendered template is ONE serString (reserve
// MAX_VARINT + 3*L). The static texts are a floor the mock can't shrink, and each
// placeholder adds its mock fragment, so budget the rendered length: static UTF-16
// units + the per-${string} content budget (>= the mock's bound) + a digit budget
// for numeric placeholders + literal lengths.
func (e *sizeEstimator) templateLiteralBytes(rt *reflection.RunType) int {
	envelope, ok := rt.Literal.(map[string]any)
	if !ok {
		return e.stringBytes(rt) // no layout — fall back to a plain string
	}
	inner, ok := envelope["templateLiteral"].(map[string]any)
	if !ok {
		return e.stringBytes(rt)
	}
	texts, _ := inner["texts"].([]any)
	placeholders, _ := inner["placeholders"].([]any)
	content := e.interpolate(0, e.cfg.StringBytes) // per-${string} budget >= the mock's maxRandomStringLength
	total := 0
	for _, textAny := range texts {
		if text, ok := textAny.(string); ok {
			total += utf16Len(text)
		}
	}
	for _, placeholderAny := range placeholders {
		placeholder, ok := placeholderAny.(map[string]any)
		if !ok {
			continue
		}
		switch kind := spanKind(placeholder); {
		case kind == int(reflection.KindString) || kind == int(reflection.KindAny) || kind == int(reflection.KindUnknown):
			total += content
		case kind == int(reflection.KindNumber) || kind == int(reflection.KindBigInt):
			total += 20 // robustly covers the <=5-char ±9999 mock output
		case kind == int(reflection.KindLiteral):
			if literal, ok := placeholder["literal"]; ok {
				total += utf16Len(fmt.Sprint(literal))
			}
		}
	}
	if est := maxVarintBytes + 3*total; est > 8 {
		return est
	}
	return 8
}

// spanKind reads a template-literal placeholder's kind (serialised as int, or
// float64 / int64 after a JSON round-trip).
func spanKind(span map[string]any) int {
	switch v := span["kind"].(type) {
	case int:
		return v
	case float64:
		return int(v)
	case int64:
		return int(v)
	}
	return -1
}

// formatFixedWidth returns the format's fixed wire width via formats.BinarySizer,
// or 0 when the type carries no format or the format reports no fixed width. The
// SAME width EmitToBinary packs to — shared by the estimator (here) and the
// encoder's per-write reserve (binary_to.go) so the two can't drift.
func formatFixedWidth(rt *reflection.RunType) int {
	if rt == nil || rt.FormatAnnotation == nil {
		return 0
	}
	emitter, ok := formats.LookupForRunType(rt)
	if !ok {
		return 0
	}
	sizer, ok := emitter.(formats.BinarySizer)
	if !ok {
		return 0
	}
	return sizer.BinarySize(rt.FormatAnnotation).Fixed
}

// stringBytes — varint length prefix + interpolated content bytes. A fixed- or
// max-length format bound tightens the content estimate; otherwise it anchors
// on cfg.StringBytes.
func (e *sizeEstimator) stringBytes(rt *reflection.RunType) int {
	min, max := e.stringContentBounds(rt)
	content := e.interpolate(min, max)
	est := varintByteLen(content) + content
	if est < 8 {
		est = 8 // the shortest mock string (1 char) reserves 5+3 = 8
	}
	return est
}

// enumBytes — serEnum reserves 8 for a numeric member (4-byte tag + uint32) and
// 4 + serString(member) for a string member, whose reserve high-water is
// 4 + (MAX_VARINT + 3*codeUnits). The member is type-constrained (mockData can't
// shrink it), so budget the largest member; a number-only / empty enum stays 8.
func (e *sizeEstimator) enumBytes(rt *reflection.RunType) int {
	estimate := 8
	for _, value := range rt.Values {
		str, ok := value.(string)
		if !ok {
			continue
		}
		if candidate := 4 + maxVarintBytes + 3*utf16Len(str); candidate > estimate {
			estimate = candidate
		}
	}
	return estimate
}

// utf16Len counts UTF-16 code units (what serString reserves 3 bytes per), not
// runes or UTF-8 bytes — sound for astral members (2 units each).
func utf16Len(s string) int {
	return len(utf16.Encode([]rune(s)))
}

func (e *sizeEstimator) stringContentBounds(rt *reflection.RunType) (int, int) {
	minLen, maxLen := 0, e.cfg.StringBytes
	if rt.FormatAnnotation != nil {
		params := rt.FormatAnnotation.Params
		if v, ok := formats.ReadNumberParam(params, "length"); ok {
			length := int(v)
			return length, length // exact (e.g. a fixed-length string)
		}
		if v, ok := formats.ReadNumberParam(params, "maxLength"); ok {
			maxLen = int(v)
		}
		if v, ok := formats.ReadNumberParam(params, "minLength"); ok {
			minLen = int(v)
		}
	}
	if maxLen > e.cfg.MaxBytes {
		maxLen = e.cfg.MaxBytes
	}
	if minLen < 0 {
		minLen = 0
	}
	if minLen > maxLen {
		minLen = maxLen
	}
	return minLen, maxLen
}

// collectionBytes — varint count prefix + count·element, for arrays (and reused
// for tuple rest). count is cfg.Items, tightened by a length / maxItems bound.
func (e *sizeEstimator) collectionBytes(rt *reflection.RunType, elementBytes int) int {
	count := e.cfg.Items
	if rt != nil && rt.FormatAnnotation != nil {
		params := rt.FormatAnnotation.Params
		if v, ok := formats.ReadNumberParam(params, "length"); ok {
			count = int(v)
		} else if v, ok := formats.ReadNumberParam(params, "maxItems"); ok && int(v) < count {
			count = int(v)
		}
	}
	if count < 0 {
		count = 0
	}
	return varintByteLen(count) + count*elementBytes
}

// objectBytes — required fields in full + optional fields weighted by Bias +
// the optional-presence bitmap (ceil(N/8) bytes). Index signatures add their
// own count-prefixed key/value loop.
func (e *sizeEstimator) objectBytes(rt *reflection.RunType, depth int) int {
	total := 0
	optionalCount := 0
	for _, child := range rt.Children {
		member := e.deref(child)
		if member == nil || member.IsStatic {
			continue
		}
		if member.Kind == reflection.KindIndexSignature {
			total += e.indexSigBytes(member, depth)
			continue
		}
		if member.Kind != reflection.KindProperty && member.Kind != reflection.KindPropertySignature {
			continue
		}
		if member.Child == nil {
			continue
		}
		fieldBytes := e.estimate(member.Child, depth+1)
		if member.Optional {
			optionalCount++
			total += e.weighOptional(fieldBytes)
		} else {
			total += fieldBytes
		}
	}
	total += (optionalCount + 7) / 8
	return total
}

// indexSigBytes — uint32 count (back-patched, 4 bytes) + count·(key + value).
func (e *sizeEstimator) indexSigBytes(rt *reflection.RunType, depth int) int {
	keyBytes := e.cfg.StringBytes
	if rt.Index != nil {
		keyBytes = e.estimate(rt.Index, depth+1)
		// A string index key is synthesized as `key{i}` (i up to Items-1) — a
		// length floor mockData can't shrink. Budget its serString reserve so the
		// seed covers the longest key the encoder writes.
		if key := e.deref(rt.Index); key != nil && (key.Kind == reflection.KindString || key.Kind == reflection.KindTemplateLiteral) {
			maxKeyLen := 3 + len(strconv.Itoa(max(0, e.cfg.Items-1))) // len("key" + (Items-1))
			if floor := maxVarintBytes + 3*maxKeyLen; floor > keyBytes {
				keyBytes = floor
			}
		}
	}
	valBytes := e.estimate(rt.Child, depth+1)
	return 4 + e.cfg.Items*(keyBytes+valBytes)
}

// tupleBytes — required members in full, optional members Bias-weighted plus the
// optional bitmap, a rest member as a count-prefixed collection.
func (e *sizeEstimator) tupleBytes(rt *reflection.RunType, depth int) int {
	total := 0
	optionalCount := 0
	for _, child := range rt.Children {
		member := e.deref(child)
		if member == nil {
			continue
		}
		if member.Kind == reflection.KindRest {
			total += e.collectionBytes(member, e.estimate(member.Child, depth+1))
			continue
		}
		memberType := member
		if member.Kind == reflection.KindTupleMember && member.Child != nil {
			memberType = member.Child
		}
		memberBytes := e.estimate(memberType, depth+1)
		if member.Optional {
			optionalCount++
			total += e.weighOptional(memberBytes)
		} else {
			total += memberBytes
		}
	}
	total += (optionalCount + 7) / 8
	return total
}

// unionBytes — the discriminator (1 byte, 2 above 255 members) plus the LARGEST
// member's footprint (the mock can pick any member, so the seed must cover the
// biggest), plus the object-branch framing (see below).
func (e *sizeEstimator) unionBytes(rt *reflection.RunType, depth int) int {
	members := rt.Children
	if len(members) == 0 {
		return 1
	}
	discriminator := 1
	if len(members) > 255 {
		discriminator = 2
	}
	maxBytes := 0
	objectMembers, mergedProps := 0, 0
	for _, member := range members {
		b := e.estimate(member, depth+1)
		if b > maxBytes {
			maxBytes = b
		}
		if resolved := e.deref(member); isUnionObjectMember(resolved) {
			objectMembers++
			mergedProps += e.dataPropCount(resolved)
		}
	}
	// Object members ride a flat "object branch" (union_flat_binary.go): a
	// sub-discriminator (1 byte when more than one object member, to pick which)
	// plus a MERGED presence bitmap over the non-universal props. The exact
	// merged-layout accounting (which props are discriminants vs merged-optional)
	// is complex, so OVER-estimate soundly: a 1-byte framing slack + a bitmap
	// upper bound of ceil(allProps/8). A seed may over-shoot; under-shooting would
	// grow the cold buffer on an in-bounds value.
	overhead := 0
	if objectMembers > 0 {
		overhead = 1 + (mergedProps+7)/8
		if objectMembers > 1 {
			overhead++
		}
	}
	return discriminator + maxBytes + overhead
}

// isUnionObjectMember reports whether a union member is encoded through the flat
// union's merged object branch (structural objects + intersections).
func isUnionObjectMember(rt *reflection.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case reflection.KindObjectLiteral, reflection.KindIntersection:
		return true
	case reflection.KindClass:
		return rt.SubKind == reflection.SubKindNone
	}
	return false
}

// dataPropCount — the object's data properties (any non-static property), the
// upper bound on how many can land in the merged union bitmap.
func (e *sizeEstimator) dataPropCount(rt *reflection.RunType) int {
	count := 0
	for _, child := range rt.Children {
		member := e.deref(child)
		if member == nil || member.IsStatic {
			continue
		}
		if member.Kind == reflection.KindProperty || member.Kind == reflection.KindPropertySignature {
			count++
		}
	}
	return count
}

// classBytes — the builtin classes pack to fixed layouts (Date, the compact
// Temporal types); Map/Set are count-prefixed element loops; everything else
// (user classes via a registered serializer, string-fallback Temporal) anchors
// on a string-ish default.
func (e *sizeEstimator) classBytes(rt *reflection.RunType, depth int) int {
	switch rt.SubKind {
	case reflection.SubKindDate:
		return 8
	case reflection.SubKindMap:
		key, val := e.mapElement(rt, depth)
		return varintByteLen(e.cfg.Items) + e.cfg.Items*(key+val)
	case reflection.SubKindSet:
		item := e.setElement(rt, depth)
		return varintByteLen(e.cfg.Items) + e.cfg.Items*item
	case reflection.SubKindTemporalInstant:
		return 12 // int64 seconds + int32 sub-second nanos
	case reflection.SubKindTemporalPlainTime:
		return 9 // hour/min/sec + ms/us/ns
	case reflection.SubKindTemporalPlainDate:
		return 7 // disc + i32 year + month + day
	case reflection.SubKindTemporalPlainDateTime:
		return 16 // disc + date(6) + time(9)
	case reflection.SubKindTemporalPlainYearMonth:
		return 6 // disc + i32 year + month
	case reflection.SubKindTemporalZonedDateTime, reflection.SubKindTemporalDuration, reflection.SubKindTemporalPlainMonthDay:
		body := e.cfg.StringBytes // lossless toJSON() string fallback
		return varintByteLen(body) + body
	case reflection.SubKindNonSerializable:
		return 0
	default:
		body := e.cfg.StringBytes // user class via a registered serializer
		return varintByteLen(body) + body
	}
}

// mapElement / setElement resolve the element types a Map / Set carries on its
// SubKind-tagged children, defaulting to a string-ish estimate when absent.
func (e *sizeEstimator) mapElement(rt *reflection.RunType, depth int) (key, val int) {
	key, val = e.cfg.StringBytes, e.cfg.StringBytes
	// Map key/value parameters live on Arguments (appendMapArguments in
	// serialize.go), NOT Children.
	for _, child := range rt.Arguments {
		member := e.deref(child)
		if member == nil {
			continue
		}
		switch member.SubKind {
		case reflection.SubKindMapKey:
			key = e.estimate(member, depth+1)
		case reflection.SubKindMapValue:
			val = e.estimate(member, depth+1)
		}
	}
	return key, val
}

func (e *sizeEstimator) setElement(rt *reflection.RunType, depth int) int {
	item := e.cfg.StringBytes
	// The Set item parameter lives on Arguments (appendSetArguments), NOT Children.
	for _, child := range rt.Arguments {
		member := e.deref(child)
		if member != nil && member.SubKind == reflection.SubKindSetItem {
			item = e.estimate(member, depth+1)
		}
	}
	return item
}

// weighOptional scales an optional field's bytes by Bias (its assumed presence).
func (e *sizeEstimator) weighOptional(bytes int) int {
	return int(e.cfg.Bias*float64(bytes) + 0.5)
}

// interpolate returns min + Bias·(max − min).
func (e *sizeEstimator) interpolate(min, max int) int {
	if max <= min {
		return min
	}
	return min + int(e.cfg.Bias*float64(max-min)+0.5)
}

// varintByteLen is the Go mirror of dataView.ts's varintLen — the unsigned
// LEB128 width of n (n < 2**32).
func varintByteLen(n int) int {
	switch {
	case n < 0x80:
		return 1
	case n < 0x4000:
		return 2
	case n < 0x200000:
		return 3
	case n < 0x10000000:
		return 4
	default:
		return 5
	}
}
