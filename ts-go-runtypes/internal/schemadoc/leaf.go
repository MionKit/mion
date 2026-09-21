// Package schemadoc is the shared leaf for RunTypes' JSON-Schema spellings: the format-family roster
// and the pure keyword-rendering helpers both the convert printer (internal/convert, `--to json-schema`)
// and the runtime document renderer (render.go, the `jsc` cache family) read, so the mapping can never
// drift between them. Rendering emits JS object-literal source with single-quoted strings (the authoring
// form's spelling, byte-compatible with oxfmt), which both consumers embed verbatim.
package schemadoc

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// FormatFamily describes one format family: the reflected annotation name, its `TF` value-first builder
// and type-first brand alias.
type FormatFamily struct {
	BuilderFn string
	TypeAlias string
	// BigintParams marks a family whose param VALUES are bigints: they print as `485n` literals and can
	// never ride `rtFormat` (JSON cannot carry a bigint), so the schema target embeds the brand instead.
	BigintParams bool
	// Exact marks a preset family whose builder/alias merge NON-EMPTY defaults: the pretty spelling cannot
	// be proven identical to the annotation, so type/builder targets use the exact TypeFormat constructor.
	Exact bool
	// Base is the exact constructor's base-type spelling.
	Base string
	// Temporal marks the FormatTemporalX families: they live on the `@mionjs/run-types/formats/temporal`
	// subpath (`TFT`), and the schema target embeds the brand (the door keeps Temporal out of rtFormat).
	Temporal bool
}

// FormatFamilies is the full leaf-family roster (typeFormats.generated.ts is the pinned name source).
// Named presets over-specify on purpose: the call carries the annotation's FULL params, which merge onto
// the preset's defaults to the identical brand, so there is no defaults table to drift.
var FormatFamilies = map[string]FormatFamily{
	"stringFormat": {BuilderFn: "string", TypeAlias: "String", Base: "string"},
	"numberFormat": {BuilderFn: "number", TypeAlias: "Number", Base: "number"},
	"bigintFormat": {BuilderFn: "bigInt", TypeAlias: "BigInt", BigintParams: true, Base: "bigint"},
	"email":        {Exact: true, Base: "string"},
	"ip":           {Exact: true, Base: "string"},
	"creditCard":   {Exact: true, Base: "string"},
	"domain":       {Exact: true, Base: "string"},
	"url":          {Exact: true, Base: "string"},
	"date":         {Exact: true, Base: "string"},
	"time":         {Exact: true, Base: "string"},
	"dateTime":     {Exact: true, Base: "string"},
	"nativeDate":   {BuilderFn: "date", TypeAlias: "Date", Base: "Date"},
	// The orderable Temporal families (registry: internal/reflection/temporal.go);
	// PlainMonthDay / Duration carry no brand (no-params only).
	"temporalInstant":        {BuilderFn: "instant", TypeAlias: "Instant", Temporal: true},
	"temporalZonedDateTime":  {BuilderFn: "zonedDateTime", TypeAlias: "ZonedDateTime", Temporal: true},
	"temporalPlainDate":      {BuilderFn: "plainDate", TypeAlias: "PlainDate", Temporal: true},
	"temporalPlainTime":      {BuilderFn: "plainTime", TypeAlias: "PlainTime", Temporal: true},
	"temporalPlainDateTime":  {BuilderFn: "plainDateTime", TypeAlias: "PlainDateTime", Temporal: true},
	"temporalPlainYearMonth": {BuilderFn: "plainYearMonth", TypeAlias: "PlainYearMonth", Temporal: true},
}

// UUIDSpellings maps the uuid version param onto its preset builders / aliases; the family has no generic type.
var UUIDSpellings = map[string]FormatFamily{
	"any": {BuilderFn: "uuid", TypeAlias: "UUID"},
	"4":   {BuilderFn: "uuidv4", TypeAlias: "UUIDv4"},
	"7":   {BuilderFn: "uuidv7", TypeAlias: "UUIDv7"},
}

// GenericParamKeys lists each generic family's PUBLIC params surface (StringParamsValueFirst /
// NumberParams / BigIntParams). An annotation carrying any OTHER key, a preset-internal engine flag like
// the regex family's `isRegex`, cannot be spelled through the generic builder or alias: `TF.string({isRegex:
// …})` is an ExactParams type error resolving a DIFFERENT brand, so those take the exact
// TypeFormat-constructor escape. A key added without a row here only DEMOTES to that exact spelling.
var GenericParamKeys = map[string]map[string]bool{
	"stringFormat": setOf("maxLength", "minLength", "length", "pattern", "allowedChars", "disallowedChars",
		"allowedValues", "disallowedValues", "mockSamples", "contentEncoding", "contentMediaType",
		"transform"),
	"numberFormat": setOf("integer", "float", "min", "max", "lt", "gt", "multipleOf",
		"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "isCurrency"),
	"bigintFormat": setOf("min", "max", "lt", "gt", "multipleOf",
		"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"),
}

func setOf(keys ...string) map[string]bool {
	out := make(map[string]bool, len(keys))
	for _, key := range keys {
		out[key] = true
	}
	return out
}

// LeafFormat resolves a node's annotation to a printable leaf family; false when the annotation is
// structural (handled at the kind branches) or unknown. uuid resolves through its version param, which
// the preset alias already carries, so the printed params drop the key. A generic family whose params
// include a key outside its public surface resolves as `Exact` (see GenericParamKeys).
func LeafFormat(annotation *reflection.FormatAnnotation) (FormatFamily, map[string]any, bool) {
	if annotation.Name == "uuid" {
		version, _ := annotation.Params["version"].(string)
		family, known := UUIDSpellings[version]
		if !known {
			return FormatFamily{}, nil, false
		}
		return family, map[string]any{}, true
	}
	family, known := FormatFamilies[annotation.Name]
	if !known {
		return FormatFamily{}, nil, false
	}
	if spellable := GenericParamKeys[annotation.Name]; spellable != nil {
		for key := range annotation.Params {
			if !spellable[key] {
				return FormatFamily{Exact: true, Base: family.Base, BigintParams: family.BigintParams}, annotation.Params, true
			}
		}
	}
	return family, annotation.Params, true
}

// StructuralAnnotationParams returns a node's structural-brand params, empty without one.
func StructuralAnnotationParams(node *reflection.RunType) map[string]any {
	if node.FormatAnnotation != nil && IsStructuralAnnotation(node.FormatAnnotation) {
		return node.FormatAnnotation.Params
	}
	return map[string]any{}
}

// HasStructuralPayload reports whether the node carries anything the structural helpers must print.
func HasStructuralPayload(node *reflection.RunType) bool {
	if node.FormatAnnotation != nil && IsStructuralAnnotation(node.FormatAnnotation) {
		return true
	}
	return len(node.Contains) > 0 || len(node.PatternProps) > 0 || len(node.PropNames) > 0
}

// IsStructuralAnnotation tells the structural brands from the leaf families: they are handled at their kind branches.
func IsStructuralAnnotation(annotation *reflection.FormatAnnotation) bool {
	switch annotation.Name {
	case "formattedArray", "formattedObject", "formattedMap", "formattedSet":
		return true
	}
	return false
}

// PrintFormatParams renders a params map as TS source, keys sorted for determinism; false for a value
// the printers cannot render.
func PrintFormatParams(params map[string]any, bigintValues bool) (string, bool) {
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var parts []string
	for _, key := range keys {
		valueText, ok := ParamValueText(params[key], bigintValues)
		if !ok {
			return "", false
		}
		parts = append(parts, fmt.Sprintf("%s: %s", key, valueText))
	}
	return "{" + strings.Join(parts, ", ") + "}", true
}

// ParamValueText renders one params value as TS source; false for a shape the printers cannot render.
func ParamValueText(value any, bigintValues bool) (string, bool) {
	switch typed := value.(type) {
	case string:
		// A bigint-family param arrives as its `485n` literal string and prints back verbatim as the
		// literal the authoring surface requires; the suffix is appended only if absent.
		if bigintValues {
			if strings.HasSuffix(typed, "n") {
				return typed, true
			}
			return typed + "n", true
		}
		return QuoteSingle(typed), true
	case float64:
		return strconv.FormatFloat(typed, 'g', -1, 64), true
	case int:
		return strconv.Itoa(typed), true
	case bool:
		return strconv.FormatBool(typed), true
	case nil:
		return "null", true
	case map[string]any:
		return PrintFormatParams(typed, bigintValues)
	case []any:
		var parts []string
		for _, element := range typed {
			elementText, ok := ParamValueText(element, bigintValues)
			if !ok {
				return "", false
			}
			parts = append(parts, elementText)
		}
		return "[" + strings.Join(parts, ", ") + "]", true
	}
	return "", false
}

// SortArms sorts a union's RENDERED arm texts into a path-independent order: the checker's union member
// order follows the source FORM, so printing Children order verbatim made `t0 | t1` flip to `t1 | t0`
// across conversion chains. Rendered text is a pure function of the node, and unlike an id sort it reads
// naturally (`'draft' | 'live'`).
func SortArms(arms []string) []string {
	sort.Strings(arms)
	return arms
}

// IsRegExpNode reports a RegExp node in either encoding: the dedicated kind or the builtin class reference.
func IsRegExpNode(node *reflection.RunType) bool {
	if node.Kind == reflection.KindRegexp {
		return true
	}
	return node.Kind == reflection.KindClass && node.ClassRef != nil && node.ClassRef.Builtin == "RegExp"
}

// LiteralValueText renders a literal node's VALUE as TS source; false for a payload the printers do
// not print (regexp / symbol literals).
func LiteralValueText(node *reflection.RunType) (string, bool) {
	if IsBigIntLiteral(node) {
		digits, ok := node.Literal.(string)
		return strings.TrimSuffix(digits, "n") + "n", ok
	}
	switch value := node.Literal.(type) {
	case string:
		return QuoteSingle(value), true
	case float64:
		return FormatNumberLiteral(value)
	case float32:
		return FormatNumberLiteral(float64(value))
	case int:
		return strconv.Itoa(value), true
	case int32:
		return strconv.FormatInt(int64(value), 10), true
	case int64:
		return strconv.FormatInt(value, 10), true
	case bool:
		return strconv.FormatBool(value), true
	case nil:
		return "null", true
	}
	return "", false
}

// FormatNumberLiteral renders a numeric literal as TS source. Infinity has no keyword spelling, but any
// overflowing literal (1e999) IS it, so that round-trips exactly; NaN has no spelling at all and refuses.
func FormatNumberLiteral(value float64) (string, bool) {
	switch {
	case math.IsNaN(value):
		return "", false
	case math.IsInf(value, 1):
		return "1e999", true
	case math.IsInf(value, -1):
		return "-1e999", true
	}
	return strconv.FormatFloat(value, 'g', -1, 64), true
}

// IsBigIntLiteral reports the bigint literal encoding: a string payload tagged with the "bigint" flag.
func IsBigIntLiteral(node *reflection.RunType) bool {
	return nodeHasFlag(node, "bigint")
}

func nodeHasFlag(node *reflection.RunType, flag string) bool {
	for _, candidate := range node.Flags {
		if candidate == flag {
			return true
		}
	}
	return false
}

// QuoteSingle quotes through the one helper, so a name never ends a line inside its own literal (U+2028
// and U+2029 are line terminators to a JS parser) and no control byte lands raw in a generated document.
func QuoteSingle(value string) string { return jsquote.Single(value) }

// KindLabel names a reflection kind for messages.
func KindLabel(kind reflection.ReflectionKind) string {
	labels := map[reflection.ReflectionKind]string{
		reflection.KindNever: "never", reflection.KindAny: "any", reflection.KindUnknown: "unknown",
		reflection.KindVoid: "void", reflection.KindObject: "object", reflection.KindString: "string",
		reflection.KindNumber: "number", reflection.KindBoolean: "boolean", reflection.KindSymbol: "symbol",
		reflection.KindBigInt: "bigint", reflection.KindNull: "null", reflection.KindUndefined: "undefined",
		reflection.KindRegexp: "regexp", reflection.KindLiteral: "a literal", reflection.KindTemplateLiteral: "a template literal",
		reflection.KindPromise: "Promise", reflection.KindClass: "a class", reflection.KindEnum: "an enum",
		reflection.KindUnion: "a union", reflection.KindIntersection: "an intersection", reflection.KindArray: "an array",
		reflection.KindTuple: "a tuple", reflection.KindObjectLiteral: "an object shape", reflection.KindFunction: "a function",
		reflection.KindRef: "a reference",
	}
	if label, ok := labels[kind]; ok {
		return label
	}
	return fmt.Sprintf("kind %d", kind)
}

// SpanKind reads a template-literal placeholder's reflection kind off its wire payload (a JSON number).
func SpanKind(raw any) (reflection.ReflectionKind, bool) {
	switch value := raw.(type) {
	case int:
		return reflection.ReflectionKind(value), true
	case float64:
		return reflection.ReflectionKind(value), true
	}
	return 0, false
}
