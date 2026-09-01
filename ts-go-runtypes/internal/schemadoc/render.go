// The runtime JSON-Schema document renderer: walks a reflection.RunType graph
// and renders ONE self-contained document as JS object-literal source — the
// body the `jsc` cache family emits (`() => ({…})`), later served through the
// StandardJSONSchemaV1 converter. Emits the textual dialect
// (wire-first standard keywords + the jsType /
// rtFormat extension rows), pinned by the corpus golden in internal/convert.
//
// The document is descriptive, one-way
// output, so an unspellable corner DEGRADES: it renders its closest honest
// under-constraint
// (usually `{}` — "any value") and records a Warning instead of failing the
// build. Notable spellings:
//
//   - references: no declaration table. Cycles close via
//     `$defs` — a back-edge to the ROOT renders `{$ref: '#'}`,
//     any other back-edge renders `{$ref: '#/$defs/<id>'}` and the
//     cycling node's body is appended to the root's `$defs`;
//   - user classes render STRUCTURALLY (their wire shape — the nominal
//     identity is a validator concern, not a document one);
//   - enums render as their value list (`{enum: […]}`);
//   - method / call-signature members DROP (they are not data and never reach
//     the wire — the same projection DataOnly applies).
package schemadoc

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Warning is one degradation notice a render emitted.
type Warning struct {
	Message string
}

// Document is a rendered schema document: JS object-literal source plus the
// degradation warnings collected on the walk.
type Document struct {
	Source   string
	Warnings []Warning
}

// UnionWireLayout is the renderer's structural view of a union's WIRE layout —
// a projection of the JSON serializer's FlatLayout (cachegen/typefunctions,
// union_flat_layout.go), provided by the caller so the document describes the
// exact envelope the encoder writes and the decoder reads. When Wraps is
// false the union travels raw and the natural spelling (enum / anyOf / oneOf)
// is the wire truth.
type UnionWireLayout struct {
	// Wraps mirrors FlatLayout.AtomicNeedsTuple: the union travels as
	// `[index, value]` envelopes (object members merged under index -1).
	Wraps bool
	// Atomics carries the per-member-dispatch members with their wire index.
	Atomics []UnionWireAtomic
	// HasMergedObjects is true when the union has mergeable object members —
	// the `[-1, mergedObject]` arm exists.
	HasMergedObjects bool
	// MergedProps is the merged-object property list, first-appearance order.
	MergedProps []UnionWireProp
}

// UnionWireAtomic is one atomic-bucket member: its node and wire index.
type UnionWireAtomic struct {
	Node  *reflection.RunType
	Index int
}

// UnionWireProp is one merged-object property. Candidates keeps the
// serializer's sub-index positions (a stripped candidate stays as nil so the
// surviving indices do not shift).
type UnionWireProp struct {
	Name       string
	IsSafeName bool
	// Required mirrors the layout: declared non-optionally by EVERY object
	// member, so the key is always present on the wire.
	Required bool
	// NeedsSubWrap: a conflicting prop's value travels as its own nested
	// `[subIndex, value]` envelope selecting the candidate.
	NeedsSubWrap bool
	Candidates   []*reflection.RunType
}

// UnionLayoutFn supplies the wire layout for a union node, or nil when the
// caller has no layout to offer (the renderer then spells the union in its
// natural form — correct for raw unions and for the convert-parity path).
type UnionLayoutFn func(union *reflection.RunType) *UnionWireLayout

// RenderDocument renders the JSON-Schema document for root. deref resolves
// `{kind: ref, id}` sentinels to their canonical nodes (pass the identity
// function when the graph is already fully wired).
func RenderDocument(root *reflection.RunType, deref func(*reflection.RunType) *reflection.RunType) Document {
	return RenderDocumentWire(root, deref, nil)
}

// RenderDocumentWire is RenderDocument with a union wire-layout provider: the
// jsc cache emitter passes a projection of the REAL FlatLayout so wrapped
// unions render their `[index, value]` envelope instead of the natural form.
func RenderDocumentWire(root *reflection.RunType, deref func(*reflection.RunType) *reflection.RunType, layoutFor UnionLayoutFn) Document {
	renderState := &docRenderer{deref: deref, layoutFor: layoutFor, walking: map[string]bool{}, defs: map[string]*reflection.RunType{}}
	resolvedRoot := renderState.resolve(root)
	if resolvedRoot != nil {
		renderState.rootID = resolvedRoot.ID
	}
	body := renderState.expr(root)
	// Cycles registered defs; each def body may register more. The walk is
	// bounded: a def is rendered once, and the graph's node set is finite.
	rendered := map[string]string{}
	for {
		pendingIDs := make([]string, 0, len(renderState.defs))
		for id := range renderState.defs {
			if _, done := rendered[id]; !done {
				pendingIDs = append(pendingIDs, id)
			}
		}
		if len(pendingIDs) == 0 {
			break
		}
		sort.Strings(pendingIDs)
		for _, id := range pendingIDs {
			rendered[id] = renderState.expr(renderState.defs[id])
		}
	}
	if len(rendered) > 0 {
		ids := make([]string, 0, len(rendered))
		for id := range rendered {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		defParts := make([]string, 0, len(ids))
		for _, id := range ids {
			defParts = append(defParts, fmt.Sprintf("%s: %s", QuoteSingle(id), rendered[id]))
		}
		defsClause := fmt.Sprintf("$defs: {%s}", strings.Join(defParts, ", "))
		if body == "{}" {
			body = "{" + defsClause + "}"
		} else if strings.HasSuffix(body, "}") {
			body = body[:len(body)-1] + ", " + defsClause + "}"
		}
	}
	return Document{Source: body, Warnings: renderState.warnings}
}

type docRenderer struct {
	deref     func(*reflection.RunType) *reflection.RunType
	layoutFor UnionLayoutFn
	rootID    string
	walking   map[string]bool
	defs      map[string]*reflection.RunType
	warnings  []Warning
}

func (r *docRenderer) resolve(node *reflection.RunType) *reflection.RunType {
	if node != nil && node.Kind == reflection.KindRef && r.deref != nil {
		return r.deref(node)
	}
	return node
}

func (r *docRenderer) warn(format string, args ...any) {
	r.warnings = append(r.warnings, Warning{Message: fmt.Sprintf(format, args...)})
}

// degrade records a warning and renders the honest under-constraint.
func (r *docRenderer) degrade(format string, args ...any) string {
	r.warn(format, args...)
	return "{}"
}

// expr renders one node. Total: every node renders something.
func (r *docRenderer) expr(node *reflection.RunType) string {
	node = r.resolve(node)
	if node == nil {
		return r.degrade("an unresolved reference rendered as {} (any value)")
	}
	if node.ID != "" {
		if node.ID == r.rootID && len(r.walking) > 0 {
			return "{$ref: '#'}"
		}
		if r.walking[node.ID] {
			r.defs[node.ID] = node
			return fmt.Sprintf("{$ref: '#/$defs/%s'}", node.ID)
		}
		r.walking[node.ID] = true
		defer delete(r.walking, node.ID)
	}
	if len(node.TypeMeta) > 0 {
		return r.metaText(node)
	}
	return r.exprCore(node)
}

// metaText renders a `base & {…}` metadata intersection as the tsMeta dialect
// keyword — the printer's spelling, without the portable gate.
func (r *docRenderer) metaText(node *reflection.RunType) string {
	baseNode := *node
	baseNode.TypeMeta = nil
	baseNode.ID = ""
	baseText := r.exprCore(&baseNode)
	metaTexts := make([]string, 0, len(node.TypeMeta))
	for _, metaRef := range node.TypeMeta {
		meta := r.resolve(metaRef)
		if meta == nil {
			return r.degrade("a metadata intersection with an unresolved member rendered as {}")
		}
		metaTexts = append(metaTexts, r.expr(metaRef))
	}
	return fmt.Sprintf("{tsMeta: {base: %s, meta: [%s]}}", baseText, strings.Join(metaTexts, ", "))
}

func (r *docRenderer) exprCore(node *reflection.RunType) string {
	if annotation := node.FormatAnnotation; annotation != nil && !IsStructuralAnnotation(annotation) {
		family, _, known := LeafFormat(annotation)
		if !known {
			return r.degrade("format family %q has no document spelling; rendered as {}", annotation.Name)
		}
		paramsText, paramsOK := PrintFormatParams(annotation.Params, family.BigintParams)
		if family.BigintParams {
			paramsText, paramsOK = PrintBigintParamsAsDigits(annotation.Params)
		}
		if !paramsOK {
			return r.degrade("format family %q carries unrenderable params; rendered as {}", annotation.Name)
		}
		parts := []string{FormatWireParts(family, annotation)}
		if mirrored := StandardParamKeywords(annotation.Params, family); mirrored != "" {
			parts = append(parts, mirrored)
		}
		parts = append(parts, fmt.Sprintf("rtFormat: %s", QuoteSingle(annotation.Name)))
		if len(annotation.Params) > 0 {
			parts = append(parts, fmt.Sprintf("rtFormatParams: %s", paramsText))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	}
	switch node.Kind {
	case reflection.KindString:
		return "{type: 'string'}"
	case reflection.KindNumber:
		return "{type: 'number'}"
	case reflection.KindBoolean:
		return "{type: 'boolean'}"
	case reflection.KindNull:
		return "{type: 'null'}"
	case reflection.KindUnknown:
		return "{}"
	case reflection.KindNever:
		return "{enum: []}"
	case reflection.KindAny:
		return "{jsType: 'any'}"
	case reflection.KindUndefined:
		return "{type: 'null', jsType: 'undefined'}"
	case reflection.KindVoid:
		return "{type: 'null', jsType: 'void'}"
	case reflection.KindSymbol:
		return "{jsType: 'symbol'}"
	case reflection.KindBigInt:
		return "{type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'}"
	case reflection.KindLiteral:
		if IsBigIntLiteral(node) {
			digits, ok := node.Literal.(string)
			if !ok {
				return r.degrade("a bigint literal with a non-string payload rendered as {}")
			}
			return fmt.Sprintf("{type: 'string', const: %s, jsType: 'bigint'}", QuoteSingle(strings.TrimSuffix(digits, "n")))
		}
		literalText, ok := LiteralValueText(node)
		if !ok {
			return r.degrade("%s has no document spelling; rendered as {}", KindLabel(node.Kind))
		}
		return fmt.Sprintf("{const: %s}", literalText)
	case reflection.KindArray:
		childText := r.expr(node.Child)
		defaulted := DefaultedStructuralParams(StructuralAnnotationParams(node))
		if HasStructuralPayload(node) {
			parts := r.structuralParts(node, StructuralAnnotationParams(node))
			return fmt.Sprintf("{type: 'array', items: %s, %s%s}", childText, strings.Join(parts, ", "), RTFormatParamsSuffix(defaulted))
		}
		return fmt.Sprintf("{type: 'array', items: %s%s}", childText, RTFormatParamsSuffix(defaulted))
	case reflection.KindPromise:
		childText := r.expr(node.Child)
		return fmt.Sprintf("{jsType: 'Promise', jsResolved: %s}", childText)
	case reflection.KindClass:
		return r.classText(node)
	case reflection.KindRegexp:
		return "{type: 'string', jsType: 'RegExp'}"
	case reflection.KindEnum:
		return r.enumText(node)
	case reflection.KindUnion:
		return r.unionText(node)
	case reflection.KindObjectLiteral:
		return r.objectText(node)
	case reflection.KindTuple:
		return r.tupleText(node)
	case reflection.KindTemplateLiteral:
		return r.templateText(node)
	case reflection.KindFunction, reflection.KindMethod, reflection.KindMethodSignature, reflection.KindCallSignature:
		return r.functionText(node)
	case reflection.KindObject:
		return "{type: ['object', 'array'], jsType: 'object'}"
	}
	return r.degrade("%s has no document spelling; rendered as {}", KindLabel(node.Kind))
}

// classText renders class kinds: the natives keep their dialect spellings
// (printer parity), a user class renders structurally.
func (r *docRenderer) classText(node *reflection.RunType) string {
	switch node.SubKind {
	case reflection.SubKindDate:
		return "{type: 'string', format: 'date-time', jsType: 'Date'}"
	case reflection.SubKindMap:
		arguments := r.nativeArguments(node)
		if len(arguments) != 2 {
			return r.degrade("a Map with an unreadable argument list rendered as {}")
		}
		return fmt.Sprintf(
			"{type: 'array', items: {type: 'array', prefixItems: [%s, %s], minItems: 2, items: false}, jsType: 'Map'}",
			r.expr(arguments[0]), r.expr(arguments[1]))
	case reflection.SubKindSet:
		arguments := r.nativeArguments(node)
		if len(arguments) != 1 {
			return r.degrade("a Set with an unreadable argument list rendered as {}")
		}
		return fmt.Sprintf("{type: 'array', items: %s, uniqueItems: true, jsType: 'Set'}", r.expr(arguments[0]))
	case reflection.SubKindNonSerializable:
		return r.degrade("a non-serializable class rendered as {} (it never reaches the wire)")
	}
	if IsRegExpNode(node) {
		return "{type: 'string', jsType: 'RegExp'}"
	}
	if info, isTemporal := reflection.TemporalInfoBySubKind(node.SubKind); isTemporal {
		wire := ""
		if format := info.WireFormat(); format != "" {
			wire = fmt.Sprintf("format: %s, ", QuoteSingle(format))
		} else if pattern := info.WirePattern(); pattern != "" {
			wire = fmt.Sprintf("pattern: %s, ", QuoteSingle(pattern))
		}
		return fmt.Sprintf("{type: 'string', %sjsType: %s}", wire, QuoteSingle(info.DialectName()))
	}
	// A user class: the document describes its WIRE shape, which is the
	// structural member set (the class serializer rebuilds the instance).
	return r.objectText(node)
}

// enumText renders an enum as its value list.
func (r *docRenderer) enumText(node *reflection.RunType) string {
	if len(node.Values) == 0 {
		return "{enum: []}"
	}
	parts := make([]string, 0, len(node.Values))
	for _, value := range node.Values {
		valueText, ok := ParamValueText(value, false)
		if !ok {
			return r.degrade("an enum with an unrenderable value rendered as {}")
		}
		parts = append(parts, valueText)
	}
	return fmt.Sprintf("{enum: [%s]}", strings.Join(SortArms(parts), ", "))
}

// unionText renders a union. The WIRE decides the spelling: when the caller
// supplied a layout and the union wraps (the serializer's flat-union envelope,
// union_flat_layout.go), the document describes the envelope — `[index,
// value]` tuples, object members merged under index -1 — because that IS what
// travels and what the decoder reads. A raw union (every member JSON-natural)
// and the layout-less path (convert parity) keep the natural vocabulary:
// oneOf (exclusive brand), a plain-literal enum list, or anyOf.
func (r *docRenderer) unionText(node *reflection.RunType) string {
	if r.layoutFor != nil {
		if wire := r.layoutFor(node); wire != nil && wire.Wraps {
			return r.unionEnvelopeText(wire)
		}
	}
	return r.unionNaturalText(node)
}

// unionEnvelopeText renders the flat-union wire envelope. Arm order is wire
// order (atomic members by index, the merged-object arm last) — meaningful,
// so deliberately NOT text-sorted like natural anyOf arms.
func (r *docRenderer) unionEnvelopeText(wire *UnionWireLayout) string {
	envelope := func(indexText, payload string) string {
		return fmt.Sprintf("{type: 'array', prefixItems: [{const: %s}, %s], minItems: 2, items: false}", indexText, payload)
	}
	arms := make([]string, 0, len(wire.Atomics)+1)
	for _, atomic := range wire.Atomics {
		arms = append(arms, envelope(strconv.Itoa(atomic.Index), r.expr(atomic.Node)))
	}
	if wire.HasMergedObjects {
		propertyParts := make([]string, 0, len(wire.MergedProps))
		requiredParts := make([]string, 0, len(wire.MergedProps))
		for _, prop := range wire.MergedProps {
			key := prop.Name
			if !prop.IsSafeName {
				key = QuoteSingle(prop.Name)
			}
			propertyParts = append(propertyParts, fmt.Sprintf("%s: %s", key, r.mergedPropText(prop, envelope)))
			if prop.Required {
				requiredParts = append(requiredParts, QuoteSingle(prop.Name))
			}
		}
		merged := "{type: 'object'"
		if len(propertyParts) > 0 {
			merged += fmt.Sprintf(", properties: {%s}", strings.Join(propertyParts, ", "))
		}
		if len(requiredParts) > 0 {
			merged += fmt.Sprintf(", required: [%s]", strings.Join(requiredParts, ", "))
		}
		merged += "}"
		arms = append(arms, envelope("-1", merged))
	}
	return fmt.Sprintf("{anyOf: [%s], jsType: 'union'}", strings.Join(arms, ", "))
}

// mergedPropText renders one merged-object property's wire: the single
// candidate's document, an anyOf across candidates, or — for a sub-wrapped
// conflict prop — the nested `[subIndex, value]` envelopes. Candidate slice
// positions ARE the sub-indexes (stripped candidates hold their slot as nil).
func (r *docRenderer) mergedPropText(prop UnionWireProp, envelope func(string, string) string) string {
	var arms []string
	for subIndex, candidate := range prop.Candidates {
		if candidate == nil {
			continue // a DataOnly-stripped candidate — never on the wire
		}
		if prop.NeedsSubWrap {
			arms = append(arms, envelope(strconv.Itoa(subIndex), r.expr(candidate)))
		} else {
			arms = append(arms, r.expr(candidate))
		}
	}
	if len(arms) == 0 {
		return "{}"
	}
	if len(arms) == 1 {
		return arms[0]
	}
	return fmt.Sprintf("{anyOf: [%s]}", strings.Join(arms, ", "))
}

// unionNaturalText is the raw-union / layout-less spelling.
func (r *docRenderer) unionNaturalText(node *reflection.RunType) string {
	allPlainLiterals := true
	var literalParts []string
	for _, armRef := range node.Children {
		arm := r.resolve(armRef)
		if arm == nil || arm.FormatAnnotation != nil || IsBigIntLiteral(arm) {
			allPlainLiterals = false
			break
		}
		switch arm.Kind {
		case reflection.KindLiteral:
			literalText, ok := LiteralValueText(arm)
			if !ok {
				allPlainLiterals = false
			} else {
				literalParts = append(literalParts, literalText)
			}
		case reflection.KindNull:
			literalParts = append(literalParts, "null")
		default:
			allPlainLiterals = false
		}
		if !allPlainLiterals {
			break
		}
	}
	if allPlainLiterals {
		return fmt.Sprintf("{enum: [%s]}", strings.Join(SortArms(literalParts), ", "))
	}
	arms := make([]string, 0, len(node.Children))
	for _, armRef := range node.Children {
		arms = append(arms, r.expr(armRef))
	}
	return fmt.Sprintf("{anyOf: [%s]}", strings.Join(SortArms(arms), ", "))
}

// objectText renders an object shape (or a user class's structural wire).
// Method / call-signature members drop (not data); symbol-keyed members drop
// (never on the wire); non-string index signatures ride tsIndexes.
func (r *docRenderer) objectText(node *reflection.RunType) string {
	defaulted := DefaultedStructuralParams(StructuralAnnotationParams(node))
	type indexPair struct{ key, value *reflection.RunType }
	var indexes []indexPair
	var propertyParts, requiredParts, readonlyParts []string
	for _, memberRef := range node.Children {
		member := r.resolve(memberRef)
		if member == nil {
			return r.degrade("an object with an unresolved member rendered as {}")
		}
		if member.Kind == reflection.KindIndexSignature {
			indexKey := r.resolve(member.Index)
			indexValue := r.resolve(member.Child)
			if indexKey == nil || indexValue == nil {
				return r.degrade("an index signature with an unresolved side rendered as {}")
			}
			indexes = append(indexes, indexPair{key: indexKey, value: indexValue})
			continue
		}
		switch member.Kind {
		case reflection.KindCallSignature, reflection.KindMethodSignature, reflection.KindMethod:
			continue // not data — never on the wire
		case reflection.KindPropertySignature, reflection.KindProperty:
		default:
			r.warn("object member %q (%s) has no document spelling and was dropped", member.Name, KindLabel(member.Kind))
			continue
		}
		if isSymbolKeyedMemberName(member.Name) {
			continue // symbol-keyed — never on the wire
		}
		child := r.resolve(member.Child)
		if child == nil {
			return r.degrade("an object member with an unresolved child rendered as {}")
		}
		key := member.Name
		if !member.IsSafeName {
			key = QuoteSingle(member.Name)
		}
		propertyParts = append(propertyParts, fmt.Sprintf("%s: %s", key, r.expr(member.Child)))
		if !member.Optional {
			requiredParts = append(requiredParts, QuoteSingle(member.Name))
		}
		if member.Readonly {
			readonlyParts = append(readonlyParts, QuoteSingle(member.Name))
		}
	}
	tsIndexesText := ""
	additionalText := ""
	if len(indexes) > 1 || (len(indexes) == 1 && indexes[0].key.Kind != reflection.KindString) {
		pairs := make([]string, 0, len(indexes))
		patterns := make([]string, 0, len(indexes))
		for _, index := range indexes {
			pairs = append(pairs, fmt.Sprintf("{key: %s, value: %s}", r.expr(index.key), r.expr(index.value)))
			if pattern := WireKeyPattern(index.key); pattern != "" {
				patterns = append(patterns, pattern)
			}
		}
		tsIndexesText = fmt.Sprintf("tsIndexes: [%s]", strings.Join(pairs, ", "))
		if len(patterns) == 1 {
			tsIndexesText = fmt.Sprintf("propertyNames: {pattern: %s}, %s", QuoteSingle(patterns[0]), tsIndexesText)
		}
	} else if len(indexes) == 1 {
		valueText := r.expr(indexes[0].value)
		if len(propertyParts) == 0 {
			schemaBag := r.structuralBag(node, tsIndexesText)
			return fmt.Sprintf("{type: 'object', additionalProperties: %s%s%s}", valueText, schemaBag, RTFormatParamsSuffix(defaulted))
		}
		additionalText = fmt.Sprintf(", additionalProperties: %s", valueText)
	}
	out := "{type: 'object'"
	if len(propertyParts) > 0 {
		out += fmt.Sprintf(", properties: {%s}", strings.Join(propertyParts, ", "))
	}
	if len(requiredParts) > 0 {
		out += fmt.Sprintf(", required: [%s]", strings.Join(requiredParts, ", "))
	}
	if len(readonlyParts) > 0 {
		out += fmt.Sprintf(", tsReadonly: [%s]", strings.Join(readonlyParts, ", "))
	}
	return out + additionalText + r.structuralBag(node, tsIndexesText) + RTFormatParamsSuffix(defaulted) + "}"
}

// structuralBag renders the leading-comma bag of tsIndexes + structural parts
// the object spelling appends.
func (r *docRenderer) structuralBag(node *reflection.RunType, tsIndexesText string) string {
	schemaBag := ""
	if HasStructuralPayload(node) {
		parts := r.structuralParts(node, StructuralAnnotationParams(node))
		if len(parts) > 0 {
			schemaBag = ", " + strings.Join(parts, ", ")
		}
	}
	if tsIndexesText != "" {
		schemaBag = ", " + tsIndexesText + schemaBag
	}
	return schemaBag
}

// structuralParts mirrors the printer's schema-target structural rendering
// with degrade semantics: unrenderable corners drop with a warning.
func (r *docRenderer) structuralParts(node *reflection.RunType, params map[string]any) []string {
	var parts []string
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if key == "closed" || key == "closedPatterns" {
			continue
		}
		valueText, ok := ParamValueText(params[key], false)
		if !ok {
			r.warn("structural param %q carries an unrenderable value and was dropped", key)
			continue
		}
		parts = append(parts, fmt.Sprintf("%s: %s", key, valueText))
	}
	if len(node.Contains) > 1 {
		r.warn("stacked contains checks render only the first")
	}
	if len(node.Contains) >= 1 {
		check := node.Contains[0]
		parts = append(parts, fmt.Sprintf("contains: %s", r.expr(check.Child)))
		if check.Min != 1 {
			parts = append(parts, fmt.Sprintf("minContains: %s", strconv.FormatFloat(check.Min, 'g', -1, 64)))
		}
		if check.Max >= 0 {
			parts = append(parts, fmt.Sprintf("maxContains: %s", strconv.FormatFloat(check.Max, 'g', -1, 64)))
		}
	}
	if len(node.PatternProps) > 0 {
		patternParts := make([]string, 0, len(node.PatternProps))
		for _, patternCheck := range node.PatternProps {
			patternParts = append(patternParts, fmt.Sprintf("%s: %s", QuoteSingle(patternCheck.Source), r.expr(patternCheck.Value)))
		}
		parts = append(parts, fmt.Sprintf("patternProperties: {%s}", strings.Join(patternParts, ", ")))
	}
	if len(node.PropNames) > 1 {
		r.warn("stacked propertyNames checks render only the first")
	}
	if len(node.PropNames) >= 1 {
		parts = append(parts, fmt.Sprintf("propertyNames: %s", r.expr(node.PropNames[0])))
	}
	parts = r.closedParts(node, params, parts)
	return parts
}

// closedParts renders `additionalProperties: false` when the closed list is
// exactly the declared member set; anything else degrades (the document says
// less, never something wrong).
func (r *docRenderer) closedParts(node *reflection.RunType, params map[string]any, parts []string) []string {
	closedValue, hasClosed := params["closed"]
	_, hasClosedPatterns := params["closedPatterns"]
	if hasClosedPatterns {
		r.warn("pattern-scoped closedness has no document spelling; the document under-constrains")
		return parts
	}
	if !hasClosed {
		return parts
	}
	closedList, _ := closedValue.([]any)
	declaredKeys := map[string]bool{}
	for _, memberRef := range node.Children {
		member := r.resolve(memberRef)
		if member != nil {
			declaredKeys[member.Name] = true
		}
	}
	if len(closedList) != len(declaredKeys) {
		r.warn("closedness with a non-declared key list has no document spelling; the document under-constrains")
		return parts
	}
	for _, key := range closedList {
		keyName, _ := key.(string)
		if !declaredKeys[keyName] {
			r.warn("closedness with a non-declared key list has no document spelling; the document under-constrains")
			return parts
		}
	}
	return append(parts, "additionalProperties: false")
}

// tupleText renders a tuple as prefixItems / minItems / items (+ tsLabels).
func (r *docRenderer) tupleText(node *reflection.RunType) string {
	var required, optional []*reflection.RunType
	var rest *reflection.RunType
	var labels []string
	memberCount, labelCount := 0, 0
	for _, memberRef := range node.Children {
		member := r.resolve(memberRef)
		if member == nil {
			return r.degrade("a tuple with an unresolved member rendered as {type: 'array'}")
		}
		inner := member.Child
		memberCount++
		if member.Name != "" {
			labelCount++
		}
		isRest := false
		for _, flag := range member.Flags {
			if flag == "rest" {
				isRest = true
			}
		}
		labels = append(labels, member.Name)
		switch {
		case isRest:
			if rest != nil {
				r.warn("a tuple with two rest slots rendered as {type: 'array'}")
				return "{type: 'array'}"
			}
			rest = inner
		case member.Optional:
			optional = append(optional, inner)
		default:
			if len(optional) > 0 || rest != nil {
				r.warn("a tuple with interleaved optional slots rendered as {type: 'array'}")
				return "{type: 'array'}"
			}
			required = append(required, inner)
		}
	}
	labeled := memberCount > 0 && labelCount == memberCount
	prefixParts := make([]string, 0, len(required)+len(optional))
	for _, member := range append(append([]*reflection.RunType{}, required...), optional...) {
		prefixParts = append(prefixParts, r.expr(member))
	}
	out := fmt.Sprintf("{type: 'array', prefixItems: [%s]", strings.Join(prefixParts, ", "))
	if len(required) > 0 {
		out += fmt.Sprintf(", minItems: %d", len(required))
	}
	if rest != nil {
		out += fmt.Sprintf(", items: %s", r.expr(rest))
	} else {
		out += ", items: false"
	}
	if labeled {
		quoted := make([]string, 0, len(labels))
		for _, label := range labels {
			quoted = append(quoted, QuoteSingle(label))
		}
		out += fmt.Sprintf(", tsLabels: [%s]", strings.Join(quoted, ", "))
	}
	return out + "}"
}

// templateText renders a template literal: pattern + the tsTemplate dialect,
// degrading to the anchored pattern alone (or a bare string) when a
// placeholder has no schema spelling.
func (r *docRenderer) templateText(node *reflection.RunType) string {
	texts, placeholders, ok := TemplateParts(node)
	if !ok {
		return r.degrade("a template literal with an unreadable payload rendered as {}")
	}
	quotedTexts := make([]string, 0, len(texts))
	for _, text := range texts {
		quotedTexts = append(quotedTexts, QuoteSingle(text))
	}
	placeholderTexts := make([]string, 0, len(placeholders))
	for _, placeholder := range placeholders {
		placeholderText, placeholderOK := TemplateSpanSchemaText(placeholder)
		if !placeholderOK {
			// The anchored pattern still describes the string honestly; only
			// the exact-recovery dialect is lost.
			r.warn("a template-literal placeholder has no schema spelling; the document keeps the pattern only")
			return fmt.Sprintf("{type: 'string', pattern: %s}", QuoteSingle(TemplateWirePattern(texts)))
		}
		placeholderTexts = append(placeholderTexts, placeholderText)
	}
	return fmt.Sprintf("{type: 'string', pattern: %s, tsTemplate: {texts: [%s], placeholders: [%s]}}",
		QuoteSingle(TemplateWirePattern(texts)), strings.Join(quotedTexts, ", "), strings.Join(placeholderTexts, ", "))
}

// functionText renders a signature as the tsFunction dialect (printer
// vocabulary); parameter defaults / optionals / rests degrade.
func (r *docRenderer) functionText(node *reflection.RunType) string {
	var prefixParts []string
	var labels []string
	labeled := len(node.Parameters) > 0
	requiredCount := 0
	for _, paramRef := range node.Parameters {
		param := r.resolve(paramRef)
		if param == nil || param.DefaultVal != nil || nodeHasFlag(param, "nonLiteralDefault") ||
			param.Optional || nodeHasFlag(param, "rest") {
			return r.degrade("a signature with optional/rest/defaulted parameters has no document spelling; rendered as {}")
		}
		if param.Name == "" {
			labeled = false
		}
		labels = append(labels, param.Name)
		prefixParts = append(prefixParts, r.expr(param.Child))
		requiredCount++
	}
	returnText := "{jsType: 'void'}"
	if node.Return != nil {
		returnText = r.expr(node.Return)
	}
	paramsText := fmt.Sprintf("{type: 'array', prefixItems: [%s]", strings.Join(prefixParts, ", "))
	if requiredCount > 0 {
		paramsText += fmt.Sprintf(", minItems: %d", requiredCount)
	}
	paramsText += ", items: false"
	if labeled {
		quoted := make([]string, 0, len(labels))
		for _, label := range labels {
			quoted = append(quoted, QuoteSingle(label))
		}
		paramsText += fmt.Sprintf(", tsLabels: [%s]", strings.Join(quoted, ", "))
	}
	paramsText += "}"
	return fmt.Sprintf("{tsFunction: {params: %s, return: %s}}", paramsText, returnText)
}

// nativeArguments derefs the KindParameter wrappers a Map/Set node carries in
// its Arguments slot, returning the parameter child types in order.
func (r *docRenderer) nativeArguments(node *reflection.RunType) []*reflection.RunType {
	var out []*reflection.RunType
	for _, argumentRef := range node.Arguments {
		argument := r.resolve(argumentRef)
		if argument == nil {
			return nil
		}
		child := argument.Child
		if child == nil {
			return nil
		}
		out = append(out, child)
	}
	return out
}

// isSymbolKeyedMemberName mirrors convert's isSymbolKeyedName: the resolver
// spells symbol-keyed members as `@@name` or with the internal 0xFE prefix
// (cachegen/runtype/serialize.go stableMemberName).
func isSymbolKeyedMemberName(name string) bool {
	if strings.HasPrefix(name, "@@") {
		return true
	}
	return len(name) >= 2 && name[0] == 0xFE && name[1] == '@'
}
