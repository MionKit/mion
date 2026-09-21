package typefunctions

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// StringifyJsonEmitter implements the `stringifyJson` rt function: the single-pass JSON serialiser
// that builds the output string straight from the TYPE instead of mutating `v` and delegating to
// JSON.stringify. It walks declared members only, so unknown keys never reach the output.
// Paired with RestoreFromJsonEmitter — the round-trip
// `restoreFromJsonMutate(JSON.parse(stringifyJson(v)))` must deep-equal v. Output is observably
// `JSON.stringify(prepareForJson(v))` but for property order (optional members sort first here) and
// the no-mutation contract on `v`.
type StringifyJsonEmitter struct{}

func (StringifyJsonEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports keeps the function-shaped kinds: at root they emit the unsupported throw, as an object
// property child they are dropped by the parent loop.
func (StringifyJsonEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (StringifyJsonEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — root-only, the arms whose whole body is native JSON.stringify. Deliberately NOT
// NoopComposeAround: an sj parent concatenates the child call's JSON fragment, so composing empty
// code would drop properties from the output.
func (StringifyJsonEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForStringifyJson(rt, ctx)
}

// ReturnName is `v` for parity with the other families, though the body returns a JSON string.
func (StringifyJsonEmitter) ReturnName() string {
	return "v"
}

// Emit dispatches the per-kind switch; every arm returns a CodeE expression evaluating to a
// JSON-encoded string fragment. A root-frame arm produces a complete JSON document, a nested one a
// fragment the parent concatenates with `+`; `IsRoot()` is what tells them apart.
func (StringifyJsonEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	switch rt.Kind {

	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject:
		// The type carries no schema info.
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}

	case reflection.KindString, reflection.KindTemplateLiteral:
		// A template-literal runtime value is a plain string.
		return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}

	case reflection.KindBigInt:
		// Quoted by hand: byte-for-byte `JSON.stringify(v.toString())` minus one call.
		return RTCode{Code: "'\"'+" + v + ".toString()+'\"'", Type: CodeE}

	case reflection.KindBoolean:
		return RTCode{Code: "(" + v + " ? 'true' : 'false')", Type: CodeE}

	case reflection.KindEnum:
		// A number-indexed enum emits the bare value, already a valid JSON number literal at any
		// position; a string enum quotes through JSON.stringify. The serializer populates IndexT
		// for every enum, which is what the branch reads.
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
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindNumber:
		// At root `String(v)` makes the rt fn return a JSON-parseable string. Nested, the bare `v`
		// works: the parent concatenates with `+` and a number coerces correctly under `join(',')`.
		if ctx.IsRoot() {
			return RTCode{Code: "String(" + v + ")", Type: CodeE}
		}
		return RTCode{Code: v, Type: CodeE}

	case reflection.KindNull:
		// Nested, emit the CONSTANT `'null'` rather than the bare value: a bare `null` is fine
		// under `+` concatenation but `join(',')` coerces it to the empty string, so the array /
		// Set path would render `[null,null]` as `[,]` (invalid JSON). The literal is correct in
		// every parent context, since a `null`-typed slot only ever holds null.
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
		// At root the rt fn returns the JS value undefined, top-level undefined not being a valid
		// JSON document; in an array position `'null'` keeps the slot JSON-valid, and inside an
		// object `null` does, the property emit handling the optional case separately.
		if ctx.IsRoot() {
			return RTCode{Code: "undefined", Type: CodeE}
		}
		if parentIsArrayLike(ctx) {
			return RTCode{Code: "'null'", Type: CodeE}
		}
		return RTCode{Code: "null", Type: CodeE}

	case reflection.KindVoid:
		// void normalises to `undefined`, so it takes the SAME three-way branch as KindUndefined:
		// a bare `undefined` under an array / Set parent would coerce to '' in `.join(',')`.
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
			// Quoted by hand to skip one JSON.stringify call.
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
		// JSON for the flat-union wire shape, emitted directly (union_flat.go).
		return emitUnionStringifyJsonFlat(rt, ctx, v)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}
	}
	return RTCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall is a plain `<childHash>.fn(<v>)` call, stringifyJson being a pure read of `v`:
// it returns the child's JSON-string contribution, which the parent embeds in the surrounding
// shape. Self-recursive calls drop the `.fn` indirection.
func (StringifyJsonEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	return ctx.emitDepCall(childID, ctx.Vλl, "")
}

// Finalize collapses an atomic-noop kind to a `JSON.stringify(v)` noop: stringifyJson has no "true
// identity", the input being a value and the output a string, so the family noop runs
// JSON.stringify at call time. A root arm that delegates to JSON.stringify outright arrives here as
// exactly `return JSON.stringify(v)`, byte-for-byte that noop, so it is flagged too. A number /
// null root emits `return String(v)`, NOT the same (String(NaN) is "NaN", JSON.stringify(NaN) is
// "null"), and stays a full body.
func (StringifyJsonEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return JSON.stringify(v)" {
		return "return JSON.stringify(v)", true
	}
	return code, false
}

// emitLiteralStringifyJson defers a literal to its underlying primitive emit.
func emitLiteralStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	switch literalFlavour(rt) {
	case litBigInt:
		return RTCode{Code: "'\"'+" + v + ".toString()+'\"'", Type: CodeE}
	case litSymbol:
		// Unsupported — symmetric with emitLiteralPrepareForJson's symbol arm.
		return RTCode{Code: "", Type: CodeNS}
	}
	// A primitive literal (number / string / boolean / null) defers to JSON.stringify.
	return RTCode{Code: "JSON.stringify(" + v + ")", Type: CodeE}
}

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

// emitObjectStringifyJson has two paths, split on cost.
// At least one required child: static `+` concat, no array and no runtime filtering. The
// optional-first sort makes the last child a required one, which always emits a non-empty
// fragment, so `skipCommas` on the last iteration keeps the trailing-comma logic static.
// All children optional: an array-join fallback, since every fragment can be empty at runtime;
// `[…].filter(Boolean).join(',')` drops the gaps, at the cost of an extra array and filter.
// The sort is stable, so declaration order holds within each group.
func emitObjectStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	// A callable interface is function-like (DataOnly = never); treat it like a
	// bare function (alwaysThrow at root, dropped at a property), not an object.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	// Publish the named-property set so the index signature's for-in loop skips declared keys,
	// which are emitted with their own type rather than the index value's (G1).
	publishSiblingNamedKeysForIndexSig(rt, ctx)
	// sigs is one pending slot for ALL the live index signatures, in the first
	// one's position: the object runs ONE key sweep (emitIndexSignaturesStringifyJson).
	type pendingChild struct {
		ref      *reflection.RunType
		sigs     []*reflection.RunType
		optional bool
	}
	var pending []pendingChild
	allOptional := true
	sigs := liveIndexSignatures(rt, ctx)
	for _, child := range objectMembers(rt) {
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
		// The key sweep produces an empty fragment when the object has no own keys, so it counts
		// as optional for both the sort and the all-optional check.
		// Matched by id, not pointer: a patternProperties entry is a synthetic member built
		// afresh by every objectMembers call.
		if resolved.Kind == reflection.KindIndexSignature {
			if len(sigs) > 0 && resolved.ID == sigs[0].ID {
				pending = append(pending, pendingChild{sigs: sigs, optional: true})
			}
			continue
		}
		pending = append(pending, pendingChild{ref: child, optional: resolved.Optional})
		if !resolved.Optional {
			allOptional = false
		}
	}
	compile := func(p pendingChild) RTCode {
		if len(p.sigs) > 0 {
			return ctx.AsExpression(emitIndexSignaturesStringifyJson(p.sigs, ctx, v))
		}
		return ctx.CompileChild(p.ref, CodeE)
	}
	if len(pending) == 0 {
		return RTCode{Code: "'{}'", Type: CodeE}
	}
	// Stable optional-first sort, so the last iteration lands on a required child, whose fragment
	// is never empty and can carry `skipCommas`. With every child optional the sort does nothing;
	// the filter-and-join wrap is correct whatever the order.
	for i := 1; i < len(pending); i++ {
		for j := i; j > 0; j-- {
			if pending[j-1].optional || !pending[j].optional {
				break
			}
			pending[j-1], pending[j] = pending[j], pending[j-1]
		}
	}

	if allOptional {
		// Array-join fallback: each prop emits with skipCommas, so it returns a bare fragment or
		// the empty string, and the outer wrap filters the empties out and rejoins with `,`.
		parts := make([]string, 0, len(pending))
		for _, p := range pending {
			// Re-set skipCommas per iteration: a nested-object value child runs its own prop loop
			// and clears sjSkipCommas at its end, so a single set-before-loop would let a later
			// sibling capture the stale `false` and bake in a trailing comma (invalid JSON after
			// filter + join).
			setSkipCommas(ctx, true)
			childRT := compile(p)
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
		// `filter(Boolean)` drops the empty fragments; inlined without an IIFE so the caller still
		// sees a CodeE result.
		return RTCode{Code: "'{'+[" + strings.Join(parts, ",") + "].filter(Boolean).join(',')+'}'", Type: CodeE}
	}

	// At-least-one-required path: skipCommas on the last iteration, so the trailing required prop
	// omits the comma every preceding prop carries.
	parts := make([]string, 0, len(pending))
	for i, p := range pending {
		isLast := i == len(pending)-1
		setSkipCommas(ctx, isLast)
		childRT := compile(p)
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

// emitPropertyStringifyJson renders one property as `'"name":' + childCode + ','`, dropping the
// comma when the parent flagged skipCommas. An undefined optional collapses the whole fragment to
// the empty string, so the object carries neither a `"name":undefined` slot nor a dangling comma.
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
	// Capture the parent's skipCommas BEFORE compiling the value child: an INLINED nested object
	// runs its own prop loop and sets / clears the walker-level flag, so a post-compile read would
	// see the nested loop's leftovers and corrupt the trailing comma. The flag is an argument from
	// the immediate parent to THIS emit; nothing inside the child may change it.
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
	// Double-quoted inside the JS literal, as JSON requires around a property name.
	propPrefix := "'" + jsonPropPrefix(rt.Name, rt.IsSafeName) + "'"
	sepCode := "','"
	if skipCommas {
		sepCode = "''"
	}
	if isEnumerabilityGuarded(rt) {
		// A guarded (lib-global-inherited / `@nonEnumerable`) property is written only when it is
		// OWN-ENUMERABLE on v, as `JSON.stringify` does, so a value carrying it non-enumerably
		// (a vanilla error's name / message / stack) omits the key.
		return RTCode{Code: "(!" + propertyIsEnumerableGuard(v, rt.Name) + " ? '' : " + propPrefix + "+" + childRT.Code + "+" + sepCode + ")", Type: CodeE}
	}
	if rt.Optional {
		return RTCode{Code: "(" + accessor + " === undefined ? '' : " + propPrefix + "+" + childRT.Code + "+" + sepCode + ")", Type: CodeE}
	}
	return RTCode{Code: propPrefix + "+" + childRT.Code + "+" + sepCode, Type: CodeE}
}

// jsonPropPrefix renders the JS string literal contents (the caller wraps the single quotes) for
// one property's `"name":` prefix. The prefix must survive TWO levels of interpretation, JS parsing
// of the source literal and the eventual JSON.parse over the output: a name holding a literal
// newline has to reach the output as the escape `\n`, which JSON.parse rejects as a raw control
// char. Hence JSON-marshal the name first, then JS-escape that result for a single-quoted literal.
func jsonPropPrefix(name string, isSafeName bool) string {
	if isSafeName {
		// A safe name holds only ASCII identifier chars, so it needs no escaping.
		return `"` + name + `":`
	}
	// The encoded bytes look like `"weird name \n?"`, backslash and `n` SEPARATE in the stream.
	jsonEncoded, err := json.Marshal(name)
	if err != nil {
		// json.Marshal on a string cannot fail normally; fall back to the unsafe-escape path.
		jsonEncoded = []byte(`"` + name + `"`)
	}
	// Escaped so JS evaluates the literal back to the JSON-encoded bytes verbatim.
	return jsEscapeForSingleQuote(string(jsonEncoded)) + ":"
}

// jsEscapeForSingleQuote escapes only the two characters JS's single-quoted-string parser
// interprets, backslash and single quote, so evaluating the literal recovers the original bytes.
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

// emitIndexSignatureStringifyJson is the bare index signature at the root; an
// object runs emitIndexSignaturesStringifyJson over all of its signatures.
func emitIndexSignatureStringifyJson(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeE}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeE}
	}
	return emitIndexSignaturesStringifyJson([]*reflection.RunType{rt}, ctx, v)
}

// emitIndexSignaturesStringifyJson is the ONE key sweep an object runs for all its index
// signatures: a key is written once, by the first signature whose pattern matches it (an
// unpatterned signature matches every key), or the way native JSON writes it when no pattern does,
// an index signature being open and a non-matching key validation's to refuse. One sweep PER
// signature wrote a key once per signature admitting it: twice for the string and number halves of
// a split key, and twice for every key under a plain signature beside a pattern one. A signature
// whose value writes nothing (an `undefined` value) omits the keys it matches.
func emitIndexSignaturesStringifyJson(sigs []*reflection.RunType, ctx *EmitContext, v string) RTCode {
	keyVar := ctx.NextLocalVar("k")
	// Same capture-on-entry rule as emitPropertyStringifyJson, see there.
	skipCommas := getSkipCommas(ctx)
	accessor := v + "[" + keyVar + "]"
	arr := ""
	var arms strings.Builder
	open := true
	for _, sig := range sigs {
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(sig.Child, CodeE)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		keyRegexVar := ""
		if childRT.Code != "" || arr != "" {
			if arr == "" {
				arr = ctx.NextLocalVar("ls")
			}
			keyRegexVar = indexSignatureKeyRegexVar(sig, ctx)
		}
		push := ""
		if childRT.Code != "" {
			push = "if (" + accessor + " !== undefined) " + arr + ".push(JSON.stringify(" + keyVar + ") + ':' + " + childRT.Code + ");"
		}
		if keyRegexVar == "" {
			// An unpatterned signature admits every key, so nothing after its arm can run.
			if push == "" {
				return RTCode{Code: "", Type: CodeE}
			}
			arms.WriteString(push)
			open = false
			break
		}
		arms.WriteString("if (" + keyRegexVar + ".test(" + keyVar + ")) {" + push + " continue;}")
	}
	if open {
		text := ctx.NextLocalVar("s")
		arms.WriteString("const " + text + " = JSON.stringify(" + accessor + "); if (" + text + " !== undefined) " + arr + ".push(JSON.stringify(" + keyVar + ") + ':' + " + text + ");")
	}
	// The trailing `,` follows the parent's skipCommas flag, as in emitPropertyStringifyJson.
	trailingSep := "+','"
	if skipCommas {
		trailingSep = ""
	}
	body := "const " + arr + " = []; for (const " + keyVar + " in " + v + ") {" +
		// Skip declared sibling keys, emitted with their own type above (G1).
		siblingNamedSkipCode(sigs[0], ctx, keyVar) + arms.String() +
		"} if (!" + arr + ".length) return ''; return " + arr + ".join(',')" + trailingSep
	return RTCode{Code: body, Type: CodeRB}
}

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

// emitTupleMemberStringifyJson prefixes each non-rest slot with a `,` separator unless it sits at
// index 0, and emits `'null'` for an undefined optional slot.
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
	// Function-typed tuple slots fall through to CompileChild and latch as unsupported: a bare
	// `'null'` would produce a lossy stringifier.
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

// emitTupleRestStringifyJson walks v from the trailing `...rest: T[]` slot's start index, joining
// the per-item fragments with `,` and returning the empty string when there is no trailing item.
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
	// A function-typed rest element falls through to CompileChild and latches as unsupported.
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

// emitNativeIterableStringifyJson builds per-entry fragments for a Map / Set, joined as a JSON
// array.
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
		// Same `[[k,v],…]` / `[item,…]` shape, for when every element is a JSON-noop type.
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

// parentIsArrayLike reports whether the closest frame above is an array / tuple / Map / Set. The
// undefined and void emits use it to pick `'null'`, the JSON literal that survives the
// `[…].join(',')` those wires use (a bare null / undefined coerces to the empty string there),
// over `null`, which the object and Map-entry wires concatenate with `+` correctly.
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

// skipCommas is set on the parent frame for the child property emit to consume. It lives as a
// plain walker bit, NOT in ContextItems, whose values are emitted verbatim as prologue lines and
// leaked stray `;` statements into every sj factory that also had real context items.
func setSkipCommas(ctx *EmitContext, value bool) {
	ctx.walker.sjSkipCommas = value
}

func clearSkipCommas(ctx *EmitContext) {
	ctx.walker.sjSkipCommas = false
}

func getSkipCommas(ctx *EmitContext) bool {
	return ctx.walker.sjSkipCommas
}

// positionInt is the integer view of TupleMember.Position, 0 when nil (defensive: the serializer
// gives every tuple member a position).
func positionInt(rt *reflection.RunType) int {
	if rt == nil || rt.Position == nil {
		return 0
	}
	return *rt.Position
}
