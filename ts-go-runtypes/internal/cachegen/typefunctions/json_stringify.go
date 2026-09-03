package typefunctions

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// StringifyJsonEmitter implements the `stringifyJson` rt function —
// the single-pass JSON serialiser that builds the output string
// directly from the TYPE rather than mutating `v` in place and
// delegating to JSON.stringify. Extras are stripped by construction:
// the emit walks declared members only, so unknown keys never reach
// the output regardless of what's on `v`.
//
// Paired with RestoreFromJsonEmitter — round-trip
// `restoreFromJson(JSON.parse(stringifyJson(v)))` must deep-equal v
// for every valid sample. Output is observably equivalent to
// `JSON.stringify(prepareForJson(v))` modulo property order (the spec
// sorts optional members first; we keep declaration order) and the
// no-mutation contract on `v`.
//
// Mirrors the per-kind switch in
// (ref: packages/run-types/src/rtCompilers/json/stringifyJson.ts)
// (`createStringifyCompiler`).
type StringifyJsonEmitter struct{}

// Args — same single-arg shape as prepareForJson; the value to
// stringify enters via `v`.
func (StringifyJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports gates the renderer's top-level loop. Mirrors the
// stringifyJson which supports every reflection kind (some via
// emit-time throws — see Emit below). Function-shaped kinds at root
// throw at emit; function-shaped as object-property children get
// dropped at the parent loop.
func (StringifyJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

// IsRTInlined delegates to DefaultIsRTInlined — same heuristics as
// prepareForJson.
func (StringifyJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — root-only: the delegation arms whose whole body is native
// JSON.stringify (see isNoopForStringifyJson). Deliberately NOT
// NoopComposeAround: sj parents concatenate the child call's JSON fragment,
// so the gate's empty-code composition would drop properties from the
// output.
func (StringifyJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForStringifyJson(rt, ctx)
}

// ReturnName is `v` — but the emit body returns a JSON string built
// from `v`, not `v` itself. The arg name is kept for parity with the
// other families.
func (StringifyJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch. Each arm mirrors the body of
// the `createStringifyCompiler` switch
// (rtCompilers/json/stringifyJson.ts:41).
//
// Convention: every arm returns a JS expression (CodeE) that
// evaluates to a JSON-encoded string fragment. Root-frame arms
// produce a complete JSON document; nested arms produce a fragment
// the parent emit concatenates with `+`. `IsRoot()` distinguishes
// the two (mirrors `comp.getNestLevel(runType) === 0`).
func (StringifyJsonEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject:
		// (ref: stringifyJson.ts:44-46, 100-101) — delegate to
		// JSON.stringify when the type carries no schema info.
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}

	case reflection.KindString, reflection.KindTemplateLiteral:
		// (ref: stringifyJson.ts:105-112) — string + template-literal
		// runtime values are plain strings.
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}

	case reflection.KindBigInt:
		// (ref: stringifyJson.ts:47-48) — manually-quoted decimal
		// string; matches `JSON.stringify(v.toString())` byte-for-byte
		// but skips one function call.
		return RTCode{Code: "'\"'+" + v + ".toString()+'\"'", Type: CodeE}

	case reflection.KindBoolean:
		// (ref: stringifyJson.ts:49-50).
		return RTCode{Code: "(" + v + " ? 'true' : 'false')", Type: CodeE}

	case reflection.KindEnum:
		// (ref: stringifyJson.ts:51-53) — number-indexed enums emit the
		// bare value (already a valid JSON number literal at any
		// position); string enums quote via JSON.stringify. The
		// serializer populates RunType.IndexT for every enum so we can
		// branch on the underlying numeric/string kind here.
		if rt.IndexT != nil {
			indexResolved := ctx.ResolveRef(rt.IndexT)
			if indexResolved != nil && indexResolved.Kind == reflection.KindNumber {
				return RTCode{Code: v, Type: CodeE}
			}
		}
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}

	case reflection.KindLiteral:
		return emitLiteralStringifyJson(rt, ctx, v)

	case reflection.KindNever:
		// (ref: stringifyJson.ts:90-91) — `Never type cannot be stringified.`
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindNumber:
		// (ref: stringifyJson.ts:92-99) — at root, `String(v)` wraps
		// the value into a JS string so the RT fn returns a
		// JSON-parseable result. At non-root, the bare `v` works
		// because the parent concatenates with `+` (auto-stringifies)
		// AND a number coerces correctly under `Array.join(',')`.
		if ctx.IsRoot() {
			return RTCode{Code: "String(" + v + ")", Type: CodeE}
		}
		return RTCode{Code: v, Type: CodeE}

	case reflection.KindNull:
		// At root, `String(null)` is the JSON document `"null"`. At
		// non-root, emit the CONSTANT `'null'` string rather than the
		// bare value: a bare `null` is fine under `+` concatenation
		// (object / tuple slots) but `Array.prototype.join(',')` coerces
		// null to the empty string, so the array / set push+join path
		// would render `[null,null]` as `[,]` (invalid JSON). The `'null'`
		// literal is correct in every parent context (a `null`-typed slot
		// only ever holds null).
		if ctx.IsRoot() {
			return RTCode{Code: "String(" + v + ")", Type: CodeE}
		}
		return RTCode{Code: "'null'", Type: CodeE}

	case reflection.KindRegexp:
		// Unsupported — a RegExp is a pattern the receiver would run, not data;
		// it is dropped from the wire like a function (DataOnly strips it).
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindSymbol:
		// Unsupported — symbol identity does not round-trip.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindUndefined:
		// (ref: stringifyJson.ts:113-118) — at root, emit `undefined`
		// so the RT fn returns the JS value undefined (top-level
		// undefined is not a valid JSON document). In an array
		// position, emit `'null'` so the slot is JSON-valid. Inside
		// an object, emit `null` (still JSON-valid; the property
		// emit logic handles the optional case separately).
		if ctx.IsRoot() {
			return RTCode{Code: "undefined", Type: CodeE}
		}
		if parentIsArrayLike(ctx) {
			return RTCode{Code: "'null'", Type: CodeE}
		}
		return RTCode{Code: "null", Type: CodeE}

	case reflection.KindVoid:
		// (ref: stringifyJson.ts:120-121) — void normalises to `undefined`,
		// so it needs the SAME three-way branch as KindUndefined above: at
		// root emit `undefined`; in an array / Set parent emit the constant
		// `'null'` (a bare `undefined` would coerce to '' under `.join(',')`
		// and corrupt the array, e.g. `[,]`); else emit `null`.
		if ctx.IsRoot() {
			return RTCode{Code: "undefined", Type: CodeE}
		}
		if parentIsArrayLike(ctx) {
			return RTCode{Code: "'null'", Type: CodeE}
		}
		return RTCode{Code: "null", Type: CodeE}

	case reflection.KindArray:
		return emitArrayStringifyJson(rt, ctx, v)

	case reflection.KindObjectLiteral, reflection.KindIntersection:
		return emitObjectStringifyJson(rt, ctx, v)

	case reflection.KindClass:
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// Like Date: emit the quoted toJSON() string directly.
			return RTCode{Code: "'\"'+" + v + ".toJSON()+'\"'", Type: CodeE}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			// (ref: stringifyJson.ts:405-406) — manually quoted to skip
			// one JSON.stringify call.
			return RTCode{Code: "'\"'+" + v + ".toJSON()+'\"'", Type: CodeE}
		case reflection.SubKindNone:
			structural := emitObjectStringifyJson(rt, ctx, v)
			return wrapStringifyWithClassSerializer(rt, ctx, v, structural)
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableStringifyJson(rt, ctx, v)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		// (ref: stringifyJson.ts:250-252).
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyStringifyJson(rt, ctx, v)

	case reflection.KindIndexSignature:
		return emitIndexSignatureStringifyJson(rt, ctx, v)

	case reflection.KindTuple:
		return emitTupleStringifyJson(rt, ctx, v)

	case reflection.KindTupleMember:
		return emitTupleMemberStringifyJson(rt, ctx, v)

	case reflection.KindUnion:
		// Emits JSON for the flat-union wire shape directly (see
		// union_flat.go).
		return emitUnionStringifyJsonFlat(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// (ref: stringifyJson.ts:183-187) — function-shaped at root
		// throws; param-shaped is handled by function-param emit
		// (not reachable as a top-level RT fn).
		return RTCode{Code: "", Type: CodeNS}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall mirrors PrepareForJsonEmitter's. stringifyJson
// is a pure read of `v` so the dep-call shape is a plain call —
// `<childHash>.fn(<v>)` returns the child's JSON-string contribution;
// the parent embeds that string into the surrounding JSON shape.
// Self-recursive calls drop the `.fn` indirection.
func (StringifyJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize wraps the emitted body in `return …` for expression
// bodies. CodeRB bodies already contain their own `return` statements
// (multi-line for-loop bodies that build a result via local vars).
//
// Atomic-noop kinds collapse to a JSON.stringify(v) noop — there's
// no "true identity" for stringifyJson because the input is a value
// and the output is a string; the family noop (entryTuple.ts
// noopStringify) runs JSON.stringify at call time. Root arms that
// delegate to JSON.stringify outright (string / template literal /
// any / unknown / object / primitive literals / string enums) arrive
// here as exactly `return JSON.stringify(v)` after the walker's root
// CodeE wrap — byte-for-byte the family noop, so flag them too (the
// same exact-match rule tb/fb apply to `return Ser` / `return ret`).
// Number/null roots emit `return String(v)` — NOT equivalent
// (String(NaN) is "NaN", JSON.stringify(NaN) is "null") — and stay
// full bodies.
func (StringifyJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return JSON.stringify(v)" {
		return "return JSON.stringify(v)", true
	}
	return code, false
}

// emitLiteralStringifyJson — (ref: stringifyJson.ts:56-89) defers
// literal kinds to their underlying primitive emit. We replicate
// the dispatch inline based on the literal's Flags / shape.
func emitLiteralStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: "'\"'+" + v + ".toString()+'\"'", Type: CodeE}
	case litSymbol:
		return RTCode{Code: "JSON.stringify('Symbol:'+(" + v + ".description||''))", Type: CodeE}
	}
	// Primitive literal (number / string / boolean / null) — defer
	// to JSON.stringify, which handles each shape correctly. This
	// matches the `JSON.stringify(${comp.vλl})` default branch.
	return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}
}

// emitArrayStringifyJson — (ref: stringifyJson.ts:125-144). Builds
// the JSON array by mapping each element through the child emit and
// joining with ','.
func emitArrayStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "'[]'", Type: CodeE}
	}
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}
	}
	jsonItems := ctx.NextLocalVar("ls")
	resultVal := ctx.NextLocalVar("res")
	body := "const " + jsonItems + " = []; for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" +
		"const " + resultVal + " = " + childRT.Code + "; " + jsonItems + ".push(" + resultVal + ");}" +
		" return '[' + " + jsonItems + ".join(',') + ']'"
	return RTCode{Code: body, Type: CodeRB}
}

// emitObjectStringifyJson — (ref: stringifyJson.ts:367-401)
// (compileStringifyInterface / compileInterfaceIntoArray /
// compileStringifyClass). Two paths matching the perf split:
//
//  1. **At least one required child** — static `+` concat with
//     the optional-first sort + `skipCommas=true` on the last
//     iteration. Fast — pure string concatenation, no array
//     allocation, no runtime filtering. The optional-first sort
//     guarantees the last child is required (always emits a
//     non-empty fragment), so the trailing-comma logic stays
//     static.
//
//  2. **All children optional** — fallback array-join path mirroring
//     `compileInterfaceIntoArray`. Each prop's emit
//     conditionally contributes (empty string when undefined); the
//     parent runs `[...emits].filter(Boolean).join(',')` to drop
//     gaps and rejoin. Slower (extra array + filter), but correct
//     when every child could be absent at runtime.
//
// Property declaration order within each "optional" group is
// preserved (stable sort).
func emitObjectStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// A callable interface is function-like (DataOnly = never); treat it like a
	// bare function (alwaysThrow at root, dropped at a property), not an object.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	// Publish the named-property set so the index signature's for-in loop skips
	// declared keys (each named prop is emitted with its own type), instead of
	// stringifying them again under the index value's transform (G1).
	publishSiblingNamedKeysForIndexSig(rt, ctx)
	type pendingChild struct {
		ref      *reflection.RunType
		optional bool
	}
	var pending []pendingChild
	allOptional := true
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			ctx.EmitDiagnosticSlot(SlotStaticDropped, memberLabel(resolved))
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			ctx.EmitDiagnosticSlot(SlotMethodDropped, memberLabel(resolved))
			continue
		}
		opt := resolved.Optional
		// Index signatures emit a for-in loop that may produce an
		// empty fragment when the object has no own keys. Treat them
		// as "optional-equivalent" for both the sort and the
		// all-optional check — getJsonStringifySortedChildren
		// + compileInterfaceIntoArray do the same.
		if resolved.Kind == reflection.KindIndexSignature {
			opt = true
		}
		pending = append(pending, pendingChild{ref: child, optional: opt})
		if !opt {
			allOptional = false
		}
	}
	if len(pending) == 0 {
		return RTCode{Code: "'{}'", Type: CodeE}
	}
	// Stable sort, optional-first. Preserves declaration order
	// within each group. For the "at least one required" path the
	// sort guarantees the last iteration lands on a required
	// child — required children always emit a non-empty fragment,
	// so the `skipCommas=true` set on the final iteration cleanly
	// strips the trailing comma. For the "all optional" path the
	// sort has no effect (every child is optional) — the
	// filter-and-join wrap handles correctness regardless of order.
	for i := 1; i < len(pending); i++ {
		for j := i; j > 0; j-- {
			if pending[j-1].optional || !pending[j].optional {
				break
			}
			pending[j-1], pending[j] = pending[j], pending[j-1]
		}
	}

	if allOptional {
		// Array-join fallback — compileInterfaceIntoArray. We
		// run each prop emit with skipCommas=true (no per-prop
		// trailing comma) so the prop returns a bare value fragment
		// or empty string. The outer wrap filters the empties out
		// and rejoins with `,`.
		parts := make([]string, 0, len(pending))
		for _, p := range pending {
			// Re-establish skipCommas INSIDE the loop, per iteration: a
			// nested-object value child runs its own prop loop and clears
			// sjSkipCommas at its end, so a single set-before-loop would let
			// a later sibling capture the stale `false` and bake a trailing
			// comma into its fragment (invalid JSON after filter+join).
			// Mirrors the per-iteration set in the at-least-one-required
			// path below.
			setSkipCommas(ctx, true)
			childRT := ctx.CompileChild(p.ref, CodeE)
			if childRT.Type == CodeNS {
				clearSkipCommas(ctx)
				return RTCode{Code: "", Type: CodeNS}
			}
			if childRT.Code == "" {
				continue
			}
			parts = append(parts, childRT.Code)
		}
		clearSkipCommas(ctx)
		if len(parts) == 0 {
			return RTCode{Code: "'{}'", Type: CodeE}
		}
		// `[a, b, ...].filter(Boolean).join(',')` — Boolean coerces
		// '' to false and any non-empty string to true, so empty
		// entries drop out. Equivalent to the `ns.push` + final
		// `ns.join(',')` shape (one allocation + one walk), inlined
		// without the IIFE so the caller still sees a CodeE result.
		return RTCode{Code: "'{'+[" + strings.Join(parts, ",") + "].filter(Boolean).join(',')+'}'", Type: CodeE}
	}

	// At-least-one-required path: static `+` concat. skipCommas set
	// on the last iteration so the trailing required prop omits the
	// comma; preceding props (required and optional alike) include
	// it.
	parts := make([]string, 0, len(pending))
	for i, p := range pending {
		isLast := i == len(pending)-1
		setSkipCommas(ctx, isLast)
		childRT := ctx.CompileChild(p.ref, CodeE)
		if childRT.Type == CodeNS {
			clearSkipCommas(ctx)
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		parts = append(parts, childRT.Code)
	}
	clearSkipCommas(ctx)
	if len(parts) == 0 {
		return RTCode{Code: "'{}'", Type: CodeE}
	}
	return RTCode{Code: "'{'+" + strings.Join(parts, "+") + "+'}'", Type: CodeE}
}

// emitPropertyStringifyJson — (ref: stringifyJson.ts:199-216).
// Renders one property as `'"name":' + childCode + ','` (or without
// the trailing comma when the parent flagged skipCommas).
//
// Optional properties: when `v.name` is undefined, the entire
// fragment collapses to the empty string so the JSON object doesn't
// carry a `"name":undefined` slot (invalid JSON) or a dangling
// comma.
func emitPropertyStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value — drop the property.
		return RTCode{Code: "", Type: CodeE}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	// Capture the parent's skipCommas BEFORE compiling the value child: an
	// INLINED nested object inside that compile runs its own prop loop and
	// sets/clears the walker-level flag, so a post-compile read would see
	// the nested loop's leftovers (trailing-comma corruption — invalid
	// JSON). The flag is an argument from the immediate parent to THIS
	// emit; nothing inside the child can legitimately change it.
	skipCommas := getSkipCommas(ctx)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// Stripped leaf in a propagating slot (symbol[], …) fails the object;
		// any other unsupported kind is absorbed (F3). See propertyChildFailed.
		if propertyChildFailed(ctx) {
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeE}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	// `"name":` prefix as a JS string literal — double-quoted so the
	// emitted JSON output uses double quotes around the property
	// name (the JSON spec requires them).
	propPrefix := "'" + jsonPropPrefix(rt.Name, rt.IsSafeName) + "'"
	sepCode := "','"
	if skipCommas {
		sepCode = "''"
	}
	if isEnumerabilityGuarded(rt) {
		// A guarded (lib-global-inherited / `@nonEnumerable`) property is
		// written only when it is an OWN-ENUMERABLE property of v —
		// `JSON.stringify` semantics — so a value carrying it non-enumerably
		// (a vanilla error's name/message/stack) omits the key.
		return RTCode{Code: "(!" + propertyIsEnumerableGuard(v, rt.Name) + " ? '' : " + propPrefix + "+" + childRT.Code + "+" + sepCode + ")", Type: CodeE}
	}
	if rt.Optional {
		// `accessor === undefined ? '' : propPrefix + childCode + sep`
		return RTCode{Code: "(" + accessor + " === undefined ? '' : " + propPrefix + "+" + childRT.Code + "+" + sepCode + ")", Type: CodeE}
	}
	return RTCode{Code: propPrefix + "+" + childRT.Code + "+" + sepCode, Type: CodeE}
}

// jsonPropPrefix renders the JS string literal contents (without the
// outer single quotes — the caller wraps them) for one property's
// `"name":` prefix.
//
// Critical detail: the prefix needs to survive TWO levels of
// interpretation — JS parsing of the source literal AND the eventual
// JSON.parse over the emitted output. A property name like
// `weird name \n?` (with a literal newline char) must end up in the
// JSON output as `"weird name \n?"` (with the JSON escape sequence,
// NOT a literal newline — JSON.parse rejects literal control chars
// inside string literals).
//
// Approach:
//  1. JSON-marshal the name to get a valid JSON string literal —
//     `json.Marshal("weird name \n?")` → `"weird name \n?"` (with
//     backslash + n as text).
//  2. JS-escape the result for embedding in a single-quoted JS
//     literal — backslashes and single quotes get escaped.
//  3. Append the `:` separator inside the same JS literal.
//
// When JS evaluates the emitted literal, the result is the
// JSON-encoded property prefix (`"weird name \n?":` as a text
// string). Concatenated into the JSON output, it produces valid
// JSON; JSON.parse then interprets `\n` as a newline char in the
// returned object's key.
func jsonPropPrefix(name string, isSafeName bool) string {
	if isSafeName {
		// Identifier-safe name: emit `"<name>":` directly. No
		// escaping needed — safe names contain only ASCII identifier
		// chars.
		return `"` + name + `":`
	}
	// JSON-encode the name first to produce a valid JSON string
	// literal. Result is bytes like `"weird name \n?"` where the
	// backslash and `n` are SEPARATE characters in the byte stream.
	jsonEncoded, err := json.Marshal(name)
	if err != nil {
		// json.Marshal on a string can't fail under normal
		// circumstances; fall back to the unsafe-escape path on
		// error.
		jsonEncoded = []byte(`"` + name + `"`)
	}
	// Embed inside a single-quoted JS literal — escape backslashes
	// and single quotes so JS evaluates the literal to the original
	// JSON-encoded bytes verbatim.
	return jsEscapeForSingleQuote(string(jsonEncoded)) + ":"
}

// jsEscapeForSingleQuote escapes only the two characters that JS's
// single-quoted-string parser would interpret: backslash and
// single-quote. Mirrors the canonical approach for embedding
// JSON-encoded text inside a JS source literal — JS evaluates the
// literal to recover the original byte sequence, which is then a
// valid JSON fragment ready for concatenation into a larger JSON
// output.
func jsEscapeForSingleQuote(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 4)
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '\'':
			b.WriteString(`\'`)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// emitIndexSignatureStringifyJson — (ref: stringifyJson.ts:145-170).
// for-in over the value's own keys, building `"key":value` pairs.
// Symbol-keyed sigs are skipped per the shared isSymbolKeyedIndexSig
// helper (the skipRT contract).
func emitIndexSignatureStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeE}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeE}
	}
	if isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeE}
	}
	keyVar := ctx.NextLocalVar("k")
	// Same capture-on-entry rule as emitPropertyStringifyJson — see there.
	skipCommas := getSkipCommas(ctx)
	ctx.SetChildAccessor(v + "[" + keyVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeE}
	}
	arr := ctx.NextLocalVar("ls")
	// Separator suffix matches the `+","` when not skipping commas
	// after the last property. Index sig results don't know whether
	// they're "last" — the heuristic is: when the parent has other
	// children (named props), the index loop's output trails with
	// `,`; when it's the only producer, trailing comma is omitted by
	// the outer wrap. Use the parent's skipCommas flag (same as
	// emitPropertyStringifyJson).
	trailingSep := "+','"
	if skipCommas {
		trailingSep = ""
	}
	body := "const " + arr + " = []; for (const " + keyVar + " in " + v + ") {" +
		// Skip declared sibling keys — emitted with their own type above (G1).
		siblingNamedSkipCode(rt, ctx, keyVar) +
		"if (" + v + "[" + keyVar + "] !== undefined) " + arr + ".push(JSON.stringify(" + keyVar + ") + ':' + " + childRT.Code + ");" +
		"} if (!" + arr + ".length) return ''; return " + arr + ".join(',')" + trailingSep
	return RTCode{Code: body, Type: CodeRB}
}

// emitTupleStringifyJson — (ref: stringifyJson.ts:269-279).
// `'[' + slotEmits.join('+') + ']'`. Empty tuple → `'[]'`.
func emitTupleStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "'[]'", Type: CodeE}
	}
	parts := make([]string, 0, len(rt.Children))
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeE)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}
	if len(parts) == 0 {
		return RTCode{Code: "'[]'", Type: CodeE}
	}
	return RTCode{Code: "'['+" + strings.Join(parts, "+") + "+']'", Type: CodeE}
}

// emitTupleMemberStringifyJson — (ref: stringifyJson.ts:239-249) for
// non-rest slots, (ref: stringifyJson.ts:217-238) (the KindRest case)
// for rest slots. Each non-rest slot emits its child code prefixed by
// a separator (`,` unless the slot is at index 0). Optional slots
// emit `'null'` when undefined. Rest slots emit a for-loop that
// builds a `,`-joined string of the trailing items, prefixed by the
// separator and an early-return for the empty-trailing case.
func emitTupleMemberStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if isRestTupleMember(rt) {
		return emitTupleRestStringifyJson(rt, ctx, v)
	}
	if rt.Child == nil {
		// Non-serializable / function-shaped slot — emit `'null'`.
		isFirst := positionInt(rt) == 0
		sep := "','+"
		if isFirst {
			sep = ""
		}
		return RTCode{Code: sep + "'null'", Type: CodeE}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		isFirst := positionInt(rt) == 0
		sep := "','+"
		if isFirst {
			sep = ""
		}
		return RTCode{Code: sep + "'null'", Type: CodeE}
	}
	// Function-typed tuple slots fall through to CompileChild — the
	// function arm returns CodeNS and the renderer surfaces an
	// alwaysThrow. Emitting bare `'null'` (the previous silent path)
	// produced a lossy stringifier.
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	childCode := childRT.Code
	if childCode == "" {
		childCode = "'null'"
	}
	isFirst := positionInt(rt) == 0
	sep := "','+"
	if isFirst {
		sep = ""
	}
	if rt.Optional {
		return RTCode{Code: "(" + accessor + " === undefined ? " + sep + "'null' : " + sep + childCode + ")", Type: CodeE}
	}
	return RTCode{Code: sep + childCode, Type: CodeE}
}

// emitTupleRestStringifyJson handles the trailing `...rest: T[]` slot
// of a tuple — (ref: stringifyJson.ts:217-238) (the KindRest case).
// Emits a for-loop that walks v from the rest's start index, builds
// per-item JSON fragments, and joins with `,`. Early-returns the
// empty string when there are no trailing items. Prefixed with `,`
// when the rest slot is not at position 0.
func emitTupleRestStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	startPos := positionStr(rt)
	isFirst := positionInt(rt) == 0
	sep := "','+"
	if isFirst {
		sep = ""
	}
	if rt.Child == nil {
		// No element type — emit the empty tail.
		return RTCode{Code: sep + "''", Type: CodeE}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: sep + "''", Type: CodeE}
	}
	// Function-typed rest element falls through to CompileChild — the
	// function arm returns CodeNS and the renderer emits alwaysThrow.
	iVar := ctx.NextLocalVar("i")
	arrName := ctx.NextLocalVar("res")
	itemName := ctx.NextLocalVar("its")
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeE)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	itemCodeStr := childRT.Code
	if itemCodeStr == "" {
		itemCodeStr = "JSON.stringify(" + v + "[" + iVar + "])"
	}
	body := "const " + arrName + " = []; for (let " + iVar + " = " + startPos + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" +
		"const " + itemName + " = " + itemCodeStr + "; if (" + itemName + ") " + arrName + ".push(" + itemName + ");" +
		"} if (!" + arrName + ".length) {return '';} else {return " + sep + arrName + ".join(',');}"
	return RTCode{Code: body, Type: CodeRB}
}

// emitNativeIterableStringifyJson handles Map / Set —
// (ref: stringifyJson.ts:407-414) + createStringifyIterable lines 446-473.
// Both iterate `for (const entry of v)`, building per-entry fragments
// joined as a JSON array.
func emitNativeIterableStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	innerTypes := iterableInnerTypes(rt, ctx)
	entryVar := ctx.NextLocalVar("e")
	var childParts []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(innerType, CodeE)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			childParts = append(childParts, childRT.Code)
		}
	}
	if len(childParts) == 0 {
		// Fall back to JSON.stringify(Array.from(v)) — gives the
		// same `[[k,v],…]` / `[item,…]` shape produced when
		// every element is a JSON-noop type.
		return RTCode{Code: "JSON.stringify(Array.from(" + v + "))", Type: CodeE}
	}
	jsonItems := ctx.NextLocalVar("ls")
	resultVal := ctx.NextLocalVar("res")
	var childrenResult string
	if len(childParts) > 1 {
		// Map: emit `[key, value]` array per entry.
		childrenResult = "'['+" + strings.Join(childParts, "+','+") + "+']'"
	} else {
		// Set: emit the element directly per entry.
		childrenResult = childParts[0]
	}
	body := "const " + jsonItems + " = []; for (const " + entryVar + " of " + v + ") {" +
		"const " + resultVal + " = " + childrenResult + "; " + jsonItems + ".push(" + resultVal + ");}" +
		" return '[' + " + jsonItems + ".join(',') + ']'"
	return RTCode{Code: body, Type: CodeRB}
}

// --- Helpers ----------------------------------------------------------

// parentIsArrayLike — true when the closest stack frame above us is an
// array / tuple / native iterable (Map / Set). Used by the undefined +
// void emit to choose between `'null'` (a JSON literal that survives the
// `[...].join(',')` the array + Set wires use — a bare `null`/`undefined`
// would coerce to ” there and corrupt the array) and `null` (object
// property — the property emit's optional-guard handles wrapping, and
// object / Map-entry wires concatenate with `+`, which stringifies null
// correctly). Map / Set parents are KindClass with the Map/Set subkind.
func parentIsArrayLike(ctx *EmitContext) bool {
	if ctx.walker == nil || len(ctx.walker.Stack) < 2 {
		return false
	}
	parent := ctx.walker.Stack[len(ctx.walker.Stack)-2].RT
	if parent == nil {
		return false
	}
	switch parent.Kind {
	case reflection.KindArray, reflection.KindTuple, reflection.KindTupleMember:
		return true
	case reflection.KindClass:
		return parent.SubKind == reflection.SubKindMap || parent.SubKind == reflection.SubKindSet
	}
	return false
}

// skipCommas flag plumbing — set on the parent frame so the child
// property emit can consume it before the parent's loop body
// continues. Lives as a plain walker bit (sjSkipCommas): it used to be
// stashed in ContextItems, whose values are emitted verbatim as
// prologue lines — the stored ""/"1" leaked stray `;` statements into
// every sj factory that also had real context items.
func setSkipCommas(ctx *EmitContext, value bool) {
	ctx.walker.sjSkipCommas = value
}

func clearSkipCommas(ctx *EmitContext) {
	ctx.walker.sjSkipCommas = false
}

func getSkipCommas(ctx *EmitContext) bool {
	return ctx.walker.sjSkipCommas
}

// positionInt — typed integer view of TupleMember.Position. Returns 0
// when Position is nil (defensive — every tuple member should carry
// a position from the serializer).
func positionInt(rt *reflection.RunType) int {
	if rt == nil || rt.Position == nil {
		return 0
	}
	return *rt.Position
}
