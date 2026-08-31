package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// createParseFn — restore a JSON.parse output into the typed shape AND check it
// in ONE walk of the value.
//
// The three-call glue it replaces:
//
//	const restored = restoreFromJson(data);
//	if (!validate(restored)) throw new Error(...getValidationErrors(restored));
//
// which walks the value twice on the happy path (restore, then validate) and
// three times on failure.
//
// # The emitted shape
//
// Every parse body takes `(v, st)` where `st` is a status holder defaulting to
// `{ok: true}`. The body restores `v` in place (or rebuilds it, see the strategy
// note below) and sets `st.ok = false` at the first node whose value does not
// match. Threading a holder rather than returning a boolean is what lets a child
// entry report upward through a plain dependency call — the same trick
// validationErrors uses for its `er` accumulator and hasUnknownKeys for `opts`.
//
// The caller then reads `st.ok`, and only on failure pays for a report:
//
//	const st = {ok: true};
//	const restored = prsFn(value, st);
//	if (!st.ok) throw new RTParseError(getValidationErrors(restored));
//
// So the happy path is one walk, and the cold path adds one more. Building the
// report from the RESTORED value is what makes its entries identical to
// `getValidationErrors(restore(v))` — the contract the spec pins.
//
// # Totality is the hard part
//
// The restore arms in json_restore.go assume well-formed input, because their
// caller has already validated: `v = BigInt(v)` throws a SyntaxError on junk,
// `Temporal.Instant.from(v)` throws, and the RegExp arm indexes the result of
// `.match()` without a null check. Parse is the one family whose whole job is
// facing untrusted input, so each of those gets a shape guard FIRST and records
// a mismatch instead of throwing. That is the bounded set: everything else
// either round-trips raw (string / number / boolean / null / enum) or fails
// harmlessly and is caught by the check that follows (`new Date('junk')` yields
// an Invalid Date, never a throw).
//
// A node NEVER short-circuits on mismatch. The walk always completes so the
// value is fully restored, which is what the cold-path report needs; `st.ok` is
// sticky once cleared.
//
// # Strategies are separate families
//
// Undeclared keys are handled per family rather than per option — see the
// operations registry for why. `parse` (the default) rebuilds each object from
// its declared properties so extras vanish by construction; `parseFail` rejects
// a value carrying extras, reusing the key check the fused validators emit; and
// `parsePreserve` leaves them alone. Only the object arm differs.

// ExtrasPolicy names what a parse family does with properties the type does not
// declare.
type ExtrasPolicy int

const (
	// ExtrasStrip rebuilds each object from its declared properties, so
	// undeclared keys are dropped by construction — the shape-derived trick
	// prepareForJsonSafe uses on the encode side, in one walk instead of the
	// `strip` decoder's ukuw pre-pass plus restore.
	ExtrasStrip ExtrasPolicy = iota
	// ExtrasFail keeps the value in place and records a mismatch when it carries
	// an undeclared key.
	ExtrasFail
	// ExtrasPreserve keeps the value in place, extras and all.
	ExtrasPreserve
)

// ParseEmitter implements the parse families. One value per strategy is bound in
// the family registry; the walker's Emitter identity carries the policy to every
// node, root and children alike, exactly as the fused validators carry their
// unknown-key mode (see validate_strict.go).
type ParseEmitter struct{ Extras ExtrasPolicy }

// statusArgKey / statusArgName name the `{ok: boolean}` holder threaded through
// every parse body and dependency call.
const (
	statusArgKey  = "stαt"
	statusArgName = "st"
)

// Args — `(v, st = {ok: true})`. The default lets a caller invoke `prs(v)`
// without a holder when it only wants the restore.
func (ParseEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: statusArgKey, Name: statusArgName, Default: "{ok:true}"},
	}
}

// Supports — the JSON wire kind set, the same one restoreFromJson covers. A kind
// outside it has no wire form to restore FROM, so parse cannot serve it either;
// the renderer emits an alwaysThrow entry rather than silently degrading to
// identity, because a parse that quietly accepts everything is worse than one
// that refuses to compile.
func (ParseEmitter) Supports(rt *reflection.RunType) bool {
	return jsonWireSupports(rt)
}

func (ParseEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// ReturnName — the restored value.
func (ParseEmitter) ReturnName() string {
	return "v"
}

// EmitDependencyCall passes the value and the shared status holder, so a child
// entry's mismatch reaches the root's `st.ok`, and ASSIGNS the result back to
// the accessor.
//
// The assignment is not optional. A parse body REBUILDS rather than mutates —
// `strip` returns a fresh object, and every restoring leaf rebinds (`v =
// BigInt(v)`) — so a call whose result is discarded silently keeps the original.
// That is exactly how nested stripping went missing: a NAMED nested type is
// dependency-called, so its rebuilt object was computed and thrown away while
// an inline one worked. restoreFromJson threads `assignTo` for the same reason.
func (ParseEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	statusArg := ctx.ArgName(statusArgKey)
	return ctx.emitDepCall(childID, ctx.Vλl+","+statusArg, ctx.Vλl)
}

// Finalize — an empty body means every node round-trips raw and nothing can
// mismatch (an `any` / `unknown` root), which IS the identity parse: return the
// value untouched. The runtime registers that as the family noop.
func (ParseEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	trimmed := trimWhitespace(code)
	if trimmed == "" || trimmed == "return v" {
		return "return v", true
	}
	if !strings.HasSuffix(trimmed, "return v") {
		code = code + ";return v"
	}
	return code, false
}

// parseFail emits the statement recording a mismatch. Sticky: once cleared the
// walk still runs to completion so the value ends fully restored, which is what
// the caller's error report is built from.
func parseFail(ctx *EmitContext) string {
	return ctx.ArgName(statusArgKey) + ".ok=false;"
}

// Emit is the per-kind switch. Each arm is "guard the wire shape, restore, then
// record whether it matched" — collapsing to just the check for the kinds whose
// wire form already IS the runtime form.
func (e ParseEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	fail := parseFail(ctx)

	if code, ok := e.delegateToValidate(rt, ctx, v, fail); ok {
		return code
	}

	switch rt.Kind {
	case reflection.KindAny, reflection.KindUnknown:
		// Anything matches and nothing needs rebuilding.
		return RTCode{Code: "", Type: CodeS}

	case reflection.KindNever:
		// Uninhabited: no wire value can match.
		return RTCode{Code: fail, Type: CodeS}

	case reflection.KindNull, reflection.KindString, reflection.KindNumber,
		reflection.KindBoolean, reflection.KindLiteral, reflection.KindEnum,
		reflection.KindObject, reflection.KindTemplateLiteral:
		// Wire form IS the runtime form — no restore, just the check. Borrowed
		// from ValidateEmitter so the two families can never disagree on what a
		// leaf accepts (the same borrow tryInlineLeafValidateCheck does, under
		// the same contract: these arms read ctx.Vλl and mutate nothing).
		return RTCode{Code: parseLeafCheck(rt, ctx, v, fail), Type: CodeS}

	case reflection.KindUndefined, reflection.KindVoid:
		// JSON has no undefined; the wire carries null or the key is absent.
		return RTCode{Code: v + "=undefined;", Type: CodeS}

	case reflection.KindBigInt:
		// GUARDED: `BigInt('nope')` throws a SyntaxError and `BigInt(1.5)` a
		// RangeError. prepareForJson writes a bigint as its decimal string, so
		// that is the wire form; a whole number and an ALREADY-RESTORED bigint are
		// accepted too, because restoreFromJson's bare `BigInt(v)` takes both and
		// parse must accept exactly what that composition accepts.
		return RTCode{
			Code: "if(typeof " + v + "==='bigint'){}else if(typeof " + v + "==='string'&&/^-?\\d+$/.test(" + v + ")){" + v + "=BigInt(" + v + ")}" +
				"else if(typeof " + v + "==='number'&&Number.isInteger(" + v + ")){" + v + "=BigInt(" + v + ")}else{" + fail + "}",
			Type: CodeS,
		}

	case reflection.KindSymbol:
		// Not serialisable — symmetric with restoreFromJson's symbol arm.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// GUARDED: the restore arm indexes `.match()` output with no null check,
		// so a non-string or a non-`/src/flags` string would throw.
		reVar := ctx.NextLocalVar("re")
		return RTCode{
			Code: "if(" + v + " instanceof RegExp){}else if(typeof " + v + "==='string'){const " + reVar + "=" + v + ".match(/^\\/(.*)\\/(.*)$/);" +
				"if(" + reVar + "){" + v + "=new RegExp(" + reVar + "[1]," + reVar + "[2]||'')}else{" + fail + "}}else{" + fail + "}",
			Type: CodeS,
		}

	case reflection.KindClass:
		return e.emitClass(rt, ctx, v, fail)

	case reflection.KindPromise:
		// A promise has no wire form.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindObjectLiteral:
		return e.emitObject(rt, ctx, v, fail)

	case reflection.KindProperty, reflection.KindPropertySignature:
		return e.emitProperty(rt, ctx, v)

	case reflection.KindIndexSignature:
		return e.emitIndexSignature(rt, ctx, v)

	case reflection.KindArray:
		return e.emitArray(rt, ctx, v, fail)

	case reflection.KindTuple:
		return e.emitTuple(rt, ctx, v, fail)

	case reflection.KindTupleMember:
		return e.emitTupleMember(rt, ctx, v)

	case reflection.KindUnion:
		return e.emitUnion(rt, ctx, v, fail)
	}
	return RTCode{Code: "", Type: CodeNS}
}

// delegateToValidate is the whole-subtree shortcut. A subtree with nothing to
// restore leaves parse doing EXACTLY validate's job, and doing it far worse: the
// per-node statement form with its `st.ok=false` writes measured at roughly half
// the throughput of the `&&` expression validate compiles to. So when the
// restore is provably identity over the subtree, call the validate entry for it
// and emit nothing else. That is one call for the whole subtree, and it measured
// as fast as inlining validate's expression outright.
//
// Only under ExtrasPreserve. The other two policies must visit every object
// regardless of restoring: strip rebuilds it to drop undeclared keys, fail scans
// its keys. Neither is something the validate entry does.
func (e ParseEmitter) delegateToValidate(rt *reflection.RunType, ctx *EmitContext, v string, fail string) (RTCode, bool) {
	if e.Extras != ExtrasPreserve || ctx.walker == nil {
		return RTCode{}, false
	}
	resolved := ctx.ResolveRef(rt)
	if resolved == nil || resolved.ID == "" || !isNoopForRestoreJson(resolved, ctx) {
		return RTCode{}, false
	}
	// A leaf already compiles to the same inline expression through
	// parseLeafCheck, which costs no cache entry and no call. Only composites
	// are worth a dependency.
	if !parseWorthDelegating(resolved.Kind) {
		return RTCode{}, false
	}
	validateHash := operations.PlainHash("validate") + "_" + resolved.ID
	ctx.registerRTLookup(validateHash)
	return RTCode{Code: "if(!(" + validateHash + "?.fn(" + v + ")??true)){" + fail + "}", Type: CodeS}, true
}

// parseWorthDelegating — the kinds whose validate is a whole subtree walk rather
// than a single expression. Delegating a scalar would swap an inline `typeof`
// for a cache lookup plus a call, which is strictly worse.
func parseWorthDelegating(kind reflection.ReflectionKind) bool {
	switch kind {
	case reflection.KindObjectLiteral, reflection.KindArray, reflection.KindTuple,
		reflection.KindClass, reflection.KindIntersection:
		return true
	}
	return false
}

// parseLeafCheck renders `if(!(<validate expr>)) st.ok=false;` for a leaf whose
// wire form needs no rebuilding. The expression comes from ValidateEmitter under
// a throwaway context, so a literal / enum / template-literal leaf accepts here
// exactly what createValidateFn accepts.
func parseLeafCheck(rt *reflection.RunType, ctx *EmitContext, v string, fail string) string {
	sub := &EmitContext{Vλl: v, walker: ctx.walker}
	check := ValidateEmitter{}.emitKindDefault(rt, sub, CodeE)
	if check.Type != CodeE || check.Code == "" || check.Code == "true" {
		return ""
	}
	return "if(!(" + check.Code + ")){" + fail + "}"
}

// emitClass covers Date, the Temporal builtins, Map / Set and plain classes.
func (e ParseEmitter) emitClass(rt *reflection.RunType, ctx *EmitContext, v string, fail string) RTCode {
	if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
		// GUARDED: `Temporal.X.from(junk)` throws a RangeError.
		tmpVar := ctx.NextLocalVar("tmp")
		return RTCode{
			Code: "if(typeof " + v + "==='string'){try{const " + tmpVar + "=" + info.Builtin + ".from(" + v + ");" +
				v + "=" + tmpVar + "}catch{" + fail + "}}else{" + fail + "}",
			Type: CodeS,
		}
	}
	switch rt.SubKind {
	case reflection.SubKindDate:
		// `new Date(x)` never throws; an unparseable input yields an Invalid
		// Date, which the NaN check below rejects. An ALREADY-RESTORED Date goes
		// through the same constructor rather than a separate arm, so an Invalid
		// Date instance is rejected like any other unparseable input, and parse
		// accepts what restoreFromJson's bare `new Date(v)` accepts.
		dVar := ctx.NextLocalVar("d")
		return RTCode{
			Code: "if(typeof " + v + "==='string'||typeof " + v + "==='number'||" + v + " instanceof Date){const " + dVar + "=new Date(" + v + ");" +
				"if(isNaN(" + dVar + ".getTime())){" + fail + "}else{" + v + "=" + dVar + "}}else{" + fail + "}",
			Type: CodeS,
		}
	case reflection.SubKindNone:
		return e.emitObject(rt, ctx, v, fail)
	case reflection.SubKindMap, reflection.SubKindSet:
		return e.emitMapSet(rt, ctx, v, fail)
	}
	return RTCode{Code: "", Type: CodeNS}
}

// emitObject restores each declared property and applies the family's extras
// policy. The guard comes first: every property read below depends on it, and
// without it a null or primitive input would throw.
func (e ParseEmitter) emitObject(rt *reflection.RunType, ctx *EmitContext, v string, fail string) RTCode {
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	publishSiblingNamedKeysForIndexSig(rt, ctx)

	var body strings.Builder
	var kept []keptProp
	hasIndexSig := objectHasIndexSignatureChild(rt, ctx)

	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil || resolved.IsStatic || isFunctionLikeKind(resolved.Kind) {
			continue
		}
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			if propertyChildFailed(ctx) {
				return RTCode{Code: "", Type: CodeNS}
			}
			continue
		}
		if childRT.Code != "" {
			body.WriteString(childRT.Code)
			if !strings.HasSuffix(childRT.Code, "}") && !strings.HasSuffix(childRT.Code, ";") {
				body.WriteString(";")
			}
		}
		if resolved.Kind == reflection.KindProperty || resolved.Kind == reflection.KindPropertySignature {
			kept = append(kept, keptProp{name: resolved.Name, isSafeName: resolved.IsSafeName, optional: resolved.Optional})
		}
	}

	// Extras policy. Strip rebuilds from the declared props (so undeclared keys
	// never survive); fail records a mismatch; preserve does nothing. An
	// index-signature shape declares every matching key, so strip and fail both
	// have nothing to do there.
	switch {
	case e.Extras == ExtrasStrip && !hasIndexSig && len(kept) > 0:
		rVar := ctx.NextLocalVar("r")
		body.WriteString("const " + rVar + "={};")
		for _, prop := range kept {
			source := propertyAccessor(v, prop.name, prop.isSafeName)
			target := propertyAccessor(rVar, prop.name, prop.isSafeName)
			if prop.optional {
				body.WriteString("if(" + source + "!==undefined){" + target + "=" + source + "}")
			} else {
				body.WriteString(target + "=" + source + ";")
			}
		}
		body.WriteString(v + "=" + rVar + ";")
	case e.Extras == ExtrasFail && !hasIndexSig:
		if keyCheck := parseExtrasAssertion(rt, ctx); keyCheck != "" {
			body.WriteString("if(!(" + keyCheck + ")){" + fail + "}")
		}
	}

	guard := "typeof " + v + "==='object'&&" + v + "!==null&&!Array.isArray(" + v + ")"
	return RTCode{Code: "if(" + guard + "){" + body.String() + "}else{" + fail + "}", Type: CodeS}
}

// keptProp records a declared property the strip rebuild copies across.
type keptProp struct {
	name       string
	isSafeName bool
	optional   bool
}

// parseExtrasAssertion is the `parseFail` family's undeclared-key test, taken
// from the same helper the fused validators use so the two agree on what counts
// as an extra. The object guard already ran, hence keepObjectCheck=false.
func parseExtrasAssertion(rt *reflection.RunType, ctx *EmitContext) string {
	check := callCheckUnknownPropertiesForHas(rt, ctx, false, false)
	if check == "" {
		return ""
	}
	return "!(" + check + ")"
}

// emitProperty descends into one declared property. An absent optional is fine;
// a missing required property is a mismatch the child never sees, so it is
// recorded here.
func (e ParseEmitter) emitProperty(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		if propertyChildFailed(ctx) {
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeS}
	}
	fail := parseFail(ctx)
	if rt.Optional {
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		return RTCode{Code: "if(" + accessor + "!==undefined){" + childRT.Code + "}", Type: CodeS}
	}
	// Required: the key must be present. `undefined` is indistinguishable from
	// absent on a JSON.parse output, and neither matches a required member.
	present := "if(" + accessor + "===undefined){" + fail + "}"
	if childRT.Code == "" {
		return RTCode{Code: present, Type: CodeS}
	}
	return RTCode{Code: present + "else{" + childRT.Code + "}", Type: CodeS}
}

// emitIndexSignature restores every own key's value through the signature's
// value type.
func (e ParseEmitter) emitIndexSignature(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil || isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	key := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(v + "[" + key + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	// Declared siblings are restored by their own property arm; skip them here so
	// a named prop is not run through the index value's transform (the G1 case
	// the prepare/restore walks guard the same way).
	skip := siblingNamedSkipCode(rt, ctx, key)
	return RTCode{Code: "for(const " + key + " in " + v + "){" + skip + childRT.Code + "}", Type: CodeS}
}

// emitArray restores every element.
func (e ParseEmitter) emitArray(rt *reflection.RunType, ctx *EmitContext, v string, fail string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	index := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(v + "[" + index + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	loop := ""
	if childRT.Code != "" {
		loop = "for(let " + index + "=0;" + index + "<" + v + ".length;" + index + "++){" + childRT.Code + "}"
	}
	return RTCode{Code: "if(Array.isArray(" + v + ")){" + loop + "}else{" + fail + "}", Type: CodeS}
}

// emitTuple checks the arity, then restores each member.
func (e ParseEmitter) emitTuple(rt *reflection.RunType, ctx *EmitContext, v string, fail string) RTCode {
	var body strings.Builder
	for _, child := range rt.Children {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			body.WriteString(childRT.Code)
		}
	}
	return RTCode{Code: "if(Array.isArray(" + v + ")){" + body.String() + "}else{" + fail + "}", Type: CodeS}
}

// emitTupleMember restores one positional member (or every member from the rest
// position onward).
func (e ParseEmitter) emitTupleMember(rt *reflection.RunType, ctx *EmitContext, v string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isRestTupleMember(rt) {
		index := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + index + "]")
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		return RTCode{
			Code: "for(let " + index + "=" + positionStr(rt) + ";" + index + "<" + v + ".length;" + index + "++){" + childRT.Code + "}",
			Type: CodeS,
		}
	}
	accessor := v + "[" + positionStr(rt) + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	if rt.Optional {
		return RTCode{Code: "if(" + accessor + "!==undefined){" + childRT.Code + "}", Type: CodeS}
	}
	return childRT
}

// emitMapSet rebuilds a Map / Set from the entry array prepareForJson wrote.
func (e ParseEmitter) emitMapSet(rt *reflection.RunType, ctx *EmitContext, v string, fail string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	ctor := "Set"
	if isMap {
		ctor = "Map"
	}
	index := ctx.NextLocalVar("i")
	var inner strings.Builder
	if isMap {
		keyType, valueType := mapKeyValueTypes(rt, ctx)
		for slot, innerType := range []*reflection.RunType{keyType, valueType} {
			if innerType == nil {
				continue
			}
			ctx.SetChildAccessor(v + "[" + index + "][" + strconv.Itoa(slot) + "]")
			childRT := ctx.CompileChild(innerType, CodeS)
			ctx.SetChildAccessor("")
			if childRT.Type == CodeNS {
				return RTCode{Code: "", Type: CodeNS}
			}
			inner.WriteString(childRT.Code)
		}
	} else if itemType := setItemType(rt, ctx); itemType != nil {
		ctx.SetChildAccessor(v + "[" + index + "]")
		childRT := ctx.CompileChild(itemType, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		inner.WriteString(childRT.Code)
	}
	loop := "for(let " + index + "=0;" + index + "<" + v + ".length;" + index + "++){" + inner.String() + "}"
	return RTCode{
		Code: "if(Array.isArray(" + v + ")){" + loop + v + "=new " + ctor + "(" + v + ")}else{" + fail + "}",
		Type: CodeS,
	}
}

// emitUnion is the ONE node kind parse does not fuse. It delegates to the
// shipped restoreFromJson and validate entries for the same type, back to back.
//
// Why: the union wire shape is not one shape. `buildFlatLayout` decides per type
// whether the members round-trip RAW (every member JSON-compatible, so nothing
// is enveloped and restore is identity) or need the flat tuple envelope, whose
// object branch is keyed `-1` and whose atomic arms are indexed per member —
// with a merged-property layout on the object side that both the encoder and
// decoder derive from the same computation. Re-deriving that here would mean a
// second implementation of the trickiest wire format in the codebase, kept in
// lockstep by hand.
//
// A union subtree therefore costs two passes rather than one. That is the whole
// price, it is local to unions, and it buys correctness by construction: the
// restore is the same one the JSON decoder uses and the check is the same one
// createValidateFn compiles. Fusing unions properly is worth doing later, and is
// worth doing against the layout builder rather than around it.
//
// Both references are SOFT (`?.fn(…) ?? …`), matching how the union dispatch in
// json_prepare.go and emitUnionValidationErrors reach across families: the
// resolver's cross-family fixpoint renders the foreign entries these name.
func (e ParseEmitter) emitUnion(rt *reflection.RunType, ctx *EmitContext, v string, fail string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	restoreHash := operations.PlainHash("restoreFromJson") + "_" + rt.ID
	validateHash := operations.PlainHash("validate") + "_" + rt.ID
	ctx.registerRTLookup(restoreHash)
	ctx.registerRTLookup(validateHash)
	return RTCode{
		Code: v + "=" + restoreHash + "?.fn(" + v + ")??" + v + ";" +
			"if(!(" + validateHash + "?.fn(" + v + ")??true)){" + fail + "}",
		Type: CodeS,
	}
}
