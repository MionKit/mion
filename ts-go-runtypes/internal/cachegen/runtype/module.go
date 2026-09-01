// Package runtype is the runType cache generator: it serializes resolved
// tsgo types into reflection.RunType records and compiles the per-entry
// virtual-module tuples consumers import (see entries.go and the shared
// assembler in internal/compiler/entrymodules).
package runtype

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// renderFactoryArgs builds the positional-arg slice for one `rt(…)` call.
// Absent slots render as "" (an empty arg) so the comma-join leaves a JS
// array HOLE in the row literal — a hole reads back as undefined under the
// runtime's index-only access, exactly like the old `u` alias did, but
// costs zero bytes. Trailing holes are trimmed off. The first two args
// (`id`, `kind`) are always present.
func renderFactoryArgs(runType *reflection.RunType) []string {
	args := []string{
		quoteJS(runType.ID),             // 0: id
		strconv.Itoa(int(runType.Kind)), // 1: kind
		subKindArg(runType.SubKind),     // 2: subKind
		stringArg(runType.TypeName),     // 3: typeName
		stringArg(runType.Name),         // 4: name
		literalArg(runType),             // 5: literal
		boolArg(runType.Optional),       // 6: optional
		boolArg(runType.Readonly),       // 7: readonly
		boolArg(runType.IsAbstract),     // 8: isAbstract
		boolArg(runType.IsStatic),       // 9: isStatic
		intPtrArg(runType.Visibility),   // 10: visibility
		boolArg(runType.IsSafeName),     // 11: isSafeName
		intPtrArg(runType.Position),     // 12: position
		boolArg(runType.IsCircular),     // 13: isCircular
		flagsArg(runType.Flags),         // 14: flags
		stringArg(runType.Description),  // 15: description
		jsonArg(runType.DefaultVal),     // 16: defaultVal
		enumArg(runType.EnumVal),        // 17: enumVal
		valuesArg(runType.Values),       // 18: values
		boolArg(runType.NotSupported),   // 19: notSupported
		boolArg(runType.NonEnumerable),  // 20: nonEnumerable
	}
	return trimTrailingUndefined(args)
}

// subKindArg renders a SubKind value or a hole ("") when zero. Zero is the
// "not applicable" sentinel — only nodes that need a SubKind get one.
func subKindArg(value reflection.ReflectionSubKind) string {
	if value == reflection.SubKindNone {
		return ""
	}
	return strconv.Itoa(int(value))
}

// stringArg returns the JS source for a string field — a hole ("") when
// empty, otherwise a single-quoted JS string literal (see quoteJS).
func stringArg(value string) string {
	if value == "" {
		return ""
	}
	return quoteJS(value)
}

// boolArg returns `"!0"` (the 2-char form of `true`) when set, otherwise a
// hole (""). False is treated as "absent" to keep the call site compact; the
// own-key still exists on the cache entry because the skeleton's factory
// pre-declares it.
func boolArg(value bool) string {
	if value {
		return "!0"
	}
	return ""
}

// intPtrArg renders a *int as its decimal integer or a hole ("") when nil.
// The pointer indirection matters — `Position == 0` is a meaningful value and
// must round-trip as `"0"`, not a hole.
func intPtrArg(value *int) string {
	if value == nil {
		return ""
	}
	return strconv.Itoa(*value)
}

// literalArg renders the `literal` slot. Footer-special literals (bigint,
// symbol, regexp) are emitted by writeFooter, so the factory arg stays a hole
// ("") for those — the footer assignment then patches the literal in place.
func literalArg(runType *reflection.RunType) string {
	if runType.Literal == nil {
		return ""
	}
	if isFooterLiteral(runType) {
		return ""
	}
	return mustJSLiteral(runType.Literal)
}

// jsonArg returns a hole ("") for nil, otherwise the JS-literal encoding.
func jsonArg(value any) string {
	if value == nil {
		return ""
	}
	return mustJSLiteral(value)
}

// flagsArg renders a []string as a JS array literal or a hole ("") when empty.
func flagsArg(flags []string) string {
	if len(flags) == 0 {
		return ""
	}
	return mustJSLiteral(flags)
}

// enumArg renders an enum map or a hole ("") when empty/nil.
func enumArg(enum map[string]any) string {
	if len(enum) == 0 {
		return ""
	}
	return mustJSLiteral(enum)
}

// valuesArg renders a []any or a hole ("") when empty.
func valuesArg(values []any) string {
	if len(values) == 0 {
		return ""
	}
	return mustJSLiteral(values)
}

// trimTrailingUndefined drops trailing hole entries ("") from the arg slice
// so `rt(…)` calls stay compact. The first two slots (id, kind) are always
// emitted; the minimum slice length is therefore 2.
func trimTrailingUndefined(args []string) []string {
	end := len(args)
	for end > 2 && args[end-1] == "" {
		end--
	}
	return args[:end]
}

// cacheRef turns a hash id into the function-call expression the
// generated code uses to look up a cached RunType, e.g. `c('Lrjx')`.
// `c` is a short alias for `rtUtils.useRunType` declared inside the
// skeleton's `initCache(rtUtils)` body — both the `rt(...)` factory
// and the footer ref-assignment lines close over it.
func cacheRef(id string) string {
	return "c(" + quoteJS(id) + ")"
}

// isFooterLiteral reports whether runType.Literal needs special construction
// in the footer (bigint / symbol) rather than inline JSON.
func isFooterLiteral(runType *reflection.RunType) bool {
	if runType.Literal == nil {
		return false
	}
	for _, flag := range runType.Flags {
		if flag == "bigint" || flag == "symbol" {
			return true
		}
	}
	return false
}

// writeFooter fills runType's reference-bearing fields and runtime-special
// values into the module-local `cache` table via `c('<id>')` registry lookups.
// Used ONLY by the allModules per-node layout (CollectEntriesPerNode) — the
// default data bundle carries ref relations as row INDICES in its parallel
// `rels` array (renderRelations) and keeps just the expression-specials in a
// residual footer (writeBundleSpecials).
func writeFooter(buffer *strings.Builder, runType *reflection.RunType) {
	name := cacheRef(runType.ID)
	if runType.Child != nil {
		buffer.WriteString(fmt.Sprintf("%s.child = %s;\n", name, derefExpr(runType.Child)))
	}
	if runType.Index != nil {
		buffer.WriteString(fmt.Sprintf("%s.index = %s;\n", name, derefExpr(runType.Index)))
	}
	if runType.Return != nil {
		buffer.WriteString(fmt.Sprintf("%s.return = %s;\n", name, derefExpr(runType.Return)))
	}
	if runType.IndexT != nil {
		buffer.WriteString(fmt.Sprintf("%s.indexType = %s;\n", name, derefExpr(runType.IndexT)))
	}
	if len(runType.Parameters) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.parameters = [%s];\n", name, joinRefs(runType.Parameters)))
	}
	if len(runType.Children) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.children = [%s];\n", name, joinRefs(runType.Children)))
	}
	// safeUnionChildren — same ref objects as Children, reordered so
	// superset shapes precede their subset equivalents.
	if len(runType.SafeUnionChildren) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.safeUnionChildren = [%s];\n", name, joinRefs(runType.SafeUnionChildren)))
	}
	// unionDiscriminators — parallel to safeUnionChildren; entry i is a
	// ref to the discriminator property within safeUnionChildren[i].
	if len(runType.UnionDiscriminators) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.unionDiscriminators = [%s];\n", name, joinRefs(runType.UnionDiscriminators)))
	}
	// decorators — surviving object-literal types from a collapsed
	// `primitive & {brand}` intersection.
	if len(runType.TypeMeta) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.typeMeta = [%s];\n", name, joinRefs(runType.TypeMeta)))
	}
	if runType.FormatAnnotation != nil {
		writeFormatAnnotation(buffer, name, runType)
	}
	if len(runType.Contains) > 0 {
		writeContains(buffer, name, runType)
	}
	if len(runType.PatternProps) > 0 {
		writePatternProps(buffer, name, runType)
	}
	if len(runType.PropNames) > 0 {
		writePropNames(buffer, name, runType)
	}
	if len(runType.TypeArguments) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.typeArguments = [%s];\n", name, joinRefs(runType.TypeArguments)))
	}
	if len(runType.Arguments) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.arguments = [%s];\n", name, joinRefs(runType.Arguments)))
	}
	if len(runType.ExtendsArguments) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.extendsArguments = [%s];\n", name, joinRefs(runType.ExtendsArguments)))
	}
	if len(runType.Implements) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.implements = [%s];\n", name, joinRefs(runType.Implements)))
	}
	if len(runType.Extends) > 0 {
		buffer.WriteString(fmt.Sprintf("%s.extends = [%s];\n", name, joinRefs(runType.Extends)))
	}
	// Only the narrow half — this footer already wrote the slot specials
	// (formatAnnotation / contains / patternProps / propNames) above;
	// the historical full writeBundleSpecials call emitted them twice.
	writeExpressionSpecials(buffer, name, runType)
}

// relationSlots is the wire order of the ref-bearing RunType fields inside a
// bundle `rels` row. MUST stay in lockstep with RUN_TYPE_REL_KEYS /
// RUN_TYPE_REL_ARRAY in packages/run-types/src/runtypes/entryTuple.ts.
// child/children lead because they are by far the most common (every property,
// array, object, tuple, union), keeping the common relRow one or two slots
// long. Single-ref slots (child/index/return/indexType) hold one target; array
// slots hold a JS array of targets — the runtime mirror carries the same split.

// renderRelations builds the index-based relation row for one bundle node:
// every ref target renders as its ROW INDEX (a bare integer), an inline JS
// literal for a non-ref child, or the quoted id for a ref absent from the
// bundle (runtime falls back to a registry lookup). Trailing holes are trimmed;
// returns "" for a leaf with no relations so the caller emits a bundle-level
// hole. classType / formatAnnotation / footer literals are NOT here — they are
// JS expressions handled by the residual footer (writeBundleSpecials).
func renderRelations(runType *reflection.RunType, indexOf map[string]int) string {
	slots := []string{
		relRef(runType.Child, indexOf),                // 0 child
		relRefs(runType.Children, indexOf),            // 1 children
		relRef(runType.Index, indexOf),                // 2 index
		relRef(runType.Return, indexOf),               // 3 return
		relRef(runType.IndexT, indexOf),               // 4 indexType
		relRefs(runType.Parameters, indexOf),          // 5 parameters
		relRefs(runType.SafeUnionChildren, indexOf),   // 6 safeUnionChildren
		relRefs(runType.UnionDiscriminators, indexOf), // 7 unionDiscriminators
		relRefs(runType.TypeMeta, indexOf),            // 8 typeMeta
		relRefs(runType.TypeArguments, indexOf),       // 9 typeArguments
		relRefs(runType.Arguments, indexOf),           // 10 arguments
		relRefs(runType.ExtendsArguments, indexOf),    // 11 extendsArguments
		relRefs(runType.Implements, indexOf),          // 12 implements
		relRefs(runType.Extends, indexOf),             // 13 extends
	}
	slots = trimTrailingHoles(slots)
	if len(slots) == 0 {
		return ""
	}
	return "[" + strings.Join(slots, ",") + "]"
}

// relRef renders a single relation target: the row index of a ref target (a
// bare integer), the quoted id for a ref whose target is NOT a bundle row (the
// runtime resolves it via useRunType, matching the old footer's `c('<id>')`
// miss behavior), an inline JS literal for a non-ref child, or "" (a hole) when
// nil. The inline case round-trips the RunType through JSON exactly as the old
// derefExpr did.
func relRef(child *reflection.RunType, indexOf map[string]int) string {
	if child == nil {
		return ""
	}
	if child.Kind == reflection.KindRef {
		if index, ok := indexOf[child.ID]; ok {
			return strconv.Itoa(index)
		}
		return quoteJS(child.ID)
	}
	encoded, err := json.Marshal(child)
	if err != nil {
		return "undefined"
	}
	var generic any
	if err := json.Unmarshal(encoded, &generic); err != nil {
		return "undefined"
	}
	return mustJSLiteral(generic)
}

// relRefs renders an array relation slot as `[<ref0>,<ref1>,…]`, or "" (a hole)
// when empty. Each element uses relRef, so a row index, inline literal, or
// quoted id can mix in the same array.
func relRefs(children []*reflection.RunType, indexOf map[string]int) string {
	if len(children) == 0 {
		return ""
	}
	parts := make([]string, len(children))
	for i, child := range children {
		parts[i] = relRef(child, indexOf)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// trimTrailingHoles drops the trailing run of hole entries ("") from a slice.
func trimTrailingHoles(slots []string) []string {
	end := len(slots)
	for end > 0 && slots[end-1] == "" {
		end--
	}
	return slots[:end]
}

// hasBundleSpecials reports whether a node needs any residual footer line — a
// runtime-special value that is a JS EXPRESSION rather than index-able data.
func hasBundleSpecials(runType *reflection.RunType) bool {
	return runType.FormatAnnotation != nil ||
		(runType.ClassRef != nil && runType.ClassRef.Builtin != "") ||
		isFooterLiteral(runType) ||
		len(runType.Contains) > 0 ||
		len(runType.PatternProps) > 0 ||
		len(runType.PropNames) > 0
}

// writeBundleSpecials writes the residual footer lines for the runtime-special
// fields that can't ride the index-based `rels` array because they are JS
// EXPRESSIONS, not data: the builtin classType (globalThis.<Builtin>, possibly
// namespace-qualified like Temporal.PlainDate), the footer-only bigint/symbol
// literal, and the formatAnnotation object. Emitted through `c('<id>')` (a self
// lookup only — no cross-row refs), so the bundle's residual ini carries only
// these rare lines and is a hole for the common object/array/union node.
func writeBundleSpecials(buffer *strings.Builder, runType *reflection.RunType) {
	name := cacheRef(runType.ID)
	if runType.FormatAnnotation != nil {
		writeFormatAnnotation(buffer, name, runType)
	}
	// contains / patternProps / propNames — structured entries, not bare
	// refs, so they ride the residual footer in the bundle layout too. The
	// child derefs go through the registry (`c('<id>')`), which resolves
	// bundle rows as well — rows register before the residual footer runs.
	if len(runType.Contains) > 0 {
		writeContains(buffer, name, runType)
	}
	if len(runType.PatternProps) > 0 {
		writePatternProps(buffer, name, runType)
	}
	if len(runType.PropNames) > 0 {
		writePropNames(buffer, name, runType)
	}
	writeExpressionSpecials(buffer, name, runType)
}

// writeExpressionSpecials writes the residual lines BOTH layouts need exactly
// once: the builtin classType and the footer-only bigint/symbol literal.
// writeFooter (per-node layout) emits the slot
// specials itself and calls only this narrow half.
func writeExpressionSpecials(buffer *strings.Builder, name string, runType *reflection.RunType) {
	// classType — built-in constructors looked up on globalThis so the
	// generated module needs zero runtime imports.
	if runType.ClassRef != nil && runType.ClassRef.Builtin != "" {
		buffer.WriteString(fmt.Sprintf("%s.classType = globalThis.%s;\n", name, runType.ClassRef.Builtin))
	}
	// Footer-only literals (bigint / symbol).
	if isFooterLiteral(runType) {
		buffer.WriteString(fmt.Sprintf("%s.literal = %s;\n", name, footerLiteralExpr(runType)))
	}
}

// joinQuoted renders a string slice as the inside of a JS array literal.
func joinQuoted(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, quoteJS(value))
	}
	return strings.Join(quoted, ", ")
}

// writeContains emits the `<ref>.contains = [{child, min, max}, …];` line.
// Runtime consumers: the mock walker's contains construction and the
// negation matcher's occurrence counting.
func writeContains(buffer *strings.Builder, name string, runType *reflection.RunType) {
	entries := make([]string, 0, len(runType.Contains))
	for _, containsCheck := range runType.Contains {
		entries = append(entries, fmt.Sprintf("{child: %s, min: %s, max: %s}",
			derefExpr(containsCheck.Child),
			strconv.FormatFloat(containsCheck.Min, 'g', -1, 64),
			strconv.FormatFloat(containsCheck.Max, 'g', -1, 64)))
	}
	buffer.WriteString(fmt.Sprintf("%s.contains = [%s];\n", name, strings.Join(entries, ", ")))
}

// writePatternProps / writePropNames — the patternProperties / propertyNames
// runtime mirrors (key mocking + negation matching).
func writePatternProps(buffer *strings.Builder, name string, runType *reflection.RunType) {
	entries := make([]string, 0, len(runType.PatternProps))
	for _, patternProp := range runType.PatternProps {
		entries = append(entries, fmt.Sprintf("{source: %s, key: %s, value: %s}",
			quoteJS(patternProp.Source), derefExpr(patternProp.Key), derefExpr(patternProp.Value)))
	}
	buffer.WriteString(fmt.Sprintf("%s.patternProps = [%s];\n", name, strings.Join(entries, ", ")))
}

func writePropNames(buffer *strings.Builder, name string, runType *reflection.RunType) {
	entries := make([]string, 0, len(runType.PropNames))
	for _, propNames := range runType.PropNames {
		entries = append(entries, derefExpr(propNames))
	}
	buffer.WriteString(fmt.Sprintf("%s.propNames = [%s];\n", name, strings.Join(entries, ", ")))
}

// writeFormatAnnotation emits the `<ref>.formatAnnotation = {…};` line. The
// annotation is a name + params for a TypeFormat brand, emitted as a JSON
// object literal (valid JS); the runtime reads it for mock generation
// (mockSamples) and format-formatter lookup. Params is already
// JSON-serialisable (strings / numbers / bools / nested maps / arrays /
// RegexpParam → {source,flags}).
func writeFormatAnnotation(buffer *strings.Builder, name string, runType *reflection.RunType) {
	if encoded, err := json.Marshal(runType.FormatAnnotation); err == nil {
		buffer.WriteString(fmt.Sprintf("%s.formatAnnotation = %s;\n", name, string(encoded)))
	}
}

// footerLiteralExpr renders a runtime-special literal as a JS expression.
func footerLiteralExpr(runType *reflection.RunType) string {
	for _, flag := range runType.Flags {
		if flag == "bigint" {
			literalString, _ := runType.Literal.(string)
			return "BigInt(" + quoteJS(literalString) + ")"
		}
		if flag == "symbol" {
			if literalMap, ok := runType.Literal.(map[string]any); ok {
				if name, ok := literalMap["symbol"].(string); ok {
					return "Symbol(" + quoteJS(name) + ")"
				}
			}
			return "Symbol()"
		}
	}
	return mustJSLiteral(runType.Literal)
}

// derefExpr renders a single child slot for the allModules per-node footer.
// Refs become `c('<id>')` cache lookups; inline (non-ref) Types are
// round-tripped through JSON to land in the any-tree shape mustJSLiteral
// understands. (The data bundle uses renderRelations / relRef instead.)
func derefExpr(runType *reflection.RunType) string {
	if runType == nil {
		return "undefined"
	}
	if runType.Kind == reflection.KindRef {
		return cacheRef(runType.ID)
	}
	encoded, err := json.Marshal(runType)
	if err != nil {
		return fmt.Sprintf("/* json err: %v */ undefined", err)
	}
	var generic any
	if err := json.Unmarshal(encoded, &generic); err != nil {
		return fmt.Sprintf("/* json err: %v */ undefined", err)
	}
	return mustJSLiteral(generic)
}

func joinRefs(runTypes []*reflection.RunType) string {
	parts := make([]string, len(runTypes))
	for i, runType := range runTypes {
		parts[i] = derefExpr(runType)
	}
	return strings.Join(parts, ", ")
}

// quoteJS renders a Go string as a JS source-level **single-quoted** string
// literal. See the original docstring on the legacy emitter for the
// wire-size rationale (resolver protocol JSON-encodes the body, so every
// `"` costs an extra byte).
func quoteJS(value string) string {
	quoted := strconv.Quote(value)
	inner := quoted[1 : len(quoted)-1]
	inner = strings.ReplaceAll(inner, `\"`, `"`)
	inner = strings.ReplaceAll(inner, `'`, `\'`)
	return "'" + inner + "'"
}

// mustJSLiteral renders an arbitrary value as a JS source-level literal.
// Same wire-efficiency motivation as `quoteJS`.
func mustJSLiteral(value any) string {
	var builder strings.Builder
	writeJSLiteral(&builder, value)
	return builder.String()
}

func writeJSLiteral(builder *strings.Builder, value any) {
	switch typed := value.(type) {
	case nil:
		builder.WriteString("null")
	case bool:
		if typed {
			builder.WriteString("!0")
		} else {
			builder.WriteString("!1")
		}
	case string:
		builder.WriteString(quoteJS(typed))
	case []any:
		builder.WriteByte('[')
		for i, item := range typed {
			if i > 0 {
				builder.WriteByte(',')
			}
			writeJSLiteral(builder, item)
		}
		builder.WriteByte(']')
	case []string:
		builder.WriteByte('[')
		for i, item := range typed {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(quoteJS(item))
		}
		builder.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		builder.WriteByte('{')
		for i, key := range keys {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(quoteJS(key))
			builder.WriteByte(':')
			writeJSLiteral(builder, typed[key])
		}
		builder.WriteByte('}')
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			fmt.Fprintf(builder, "/* json err: %v */ undefined", err)
			return
		}
		builder.Write(encoded)
	}
}
