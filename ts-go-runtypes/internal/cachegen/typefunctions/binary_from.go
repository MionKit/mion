package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// FromBinaryEmitter implements the `fromBinary` rt function —
// reconstructs a runtime value from bytes in a DataViewDeserializer
// instance. Paired with ToBinaryEmitter for the round-trip
// `fromBinary(toBinary(v, ser).getBuffer(), des) ⟶ v`.
//
// Mirrors the mega-switch at
// (ref: packages/run-types/src/rtCompilers/binary/fromBinary.ts).
//
// Args mirror `rtBinaryDeserializerArgs = {vλl: 'ret', dεs:
// 'Des'}` (constants.functions.ts:54). The first arg `ret` starts
// `undefined` at call time — the body assigns the decoded value to it
// and returns it. The second arg `Des` is the deserializer instance.
//
// The walker's "first arg is the base value accessor" contract means
// `ret` is what every Emit's body references via ctx.Vλl. For compound
// kinds we initialize `ret` to a new container (e.g. `ret = {}`) before
// populating children.
type FromBinaryEmitter struct{}

func (FromBinaryEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "ret", Default: ""},
		{Key: "dεs", Name: "Des", Default: ""},
	}
}

func (FromBinaryEmitter) Supports(rt *reflection.RunType) bool {
	// Mirror ToBinaryEmitter.Supports — every kind the encode side
	// handles has a decode arm.
	return ToBinaryEmitter{}.Supports(rt)
}

func (FromBinaryEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// ReturnName is `ret` — the decoded value.
func (FromBinaryEmitter) ReturnName() string {
	return "ret"
}

// binaryFromOverride returns a format-specific binary-decode EXPRESSION
// (RHS of `ret = …`) when rt carries a FormatAnnotation whose emitter
// implements formats.BinaryDecoder and yields a non-empty body, else "".
// Empty = keep the host's base-kind arm. Byte-symmetric counterpart to
// binaryToOverride.
func binaryFromOverride(rt *reflection.RunType, des string, ctx *EmitContext) string {
	if rt == nil || rt.FormatAnnotation == nil {
		return ""
	}
	emitter, ok := formats.LookupForRunType(rt)
	if !ok {
		return ""
	}
	decoder, ok := emitter.(formats.BinaryDecoder)
	if !ok {
		return ""
	}
	return decoder.EmitFromBinary(rt.FormatAnnotation, des, ctx)
}

func (FromBinaryEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	ret := ctx.Vλl
	des := ctx.ArgName("dεs")
	switch rt.Kind {

	// ###################### ATOMIC TYPES ######################
	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject:
		// ref:binary/fromBinary.ts — `ret = JSON.parse(desString())`.
		return RTCode{Code: ret + " = JSON.parse(" + des + ".desString())", Type: CodeS}

	case reflection.KindNull:
		// Encoder wrote a 0 byte sentinel; decoder consumes it and
		// returns null. Comma-expression folds the `index++` advance
		// into the assignment RHS — the reference uses the same trick
		// (ref: binary/fromBinary.ts:55) to keep the emit as a single
		// expression-shaped statement instead of two consecutive
		// statements.
		return RTCode{Code: ret + " = (" + des + ".index++, null)", Type: CodeS}

	case reflection.KindBoolean:
		return RTCode{Code: ret + " = !!" + des + ".view.getUint8(" + des + ".index++)", Type: CodeS}

	case reflection.KindNumber:
		// Comma-expression trick — `getFloat64` is variadic-tolerant; the
		// 3rd positional slot is ignored at runtime but its side-effect
		// (`index += 8`) still runs as part of the call's argument
		// evaluation. Mirrors the binary/fromBinary.ts:59 emit.
		// Equivalent to `ret = getFloat64(des.index, 1); des.index += 8`
		// but one statement instead of two. A numberFormat brand may
		// decode 1/2/4 bytes instead — byte-symmetric with its encode.
		expr := des + ".view.getFloat64(" + des + ".index, 1, (" + des + ".index += 8))"
		if override := binaryFromOverride(rt, des, ctx); override != "" {
			expr = override
		}
		return RTCode{Code: ret + " = " + expr, Type: CodeS}

	case reflection.KindString, reflection.KindTemplateLiteral:
		return RTCode{Code: ret + " = " + des + ".desString()", Type: CodeS}

	case reflection.KindBigInt:
		// A bigintFormat brand whose min/max fit 64-bit decodes 8 bytes
		// via getBigInt64/getBigUint64 — byte-symmetric with its encode.
		// Empty override = keep the string base arm.
		expr := "BigInt(" + des + ".desString())"
		if override := binaryFromOverride(rt, des, ctx); override != "" {
			expr = override
		}
		return RTCode{Code: ret + " = " + expr, Type: CodeS}

	case reflection.KindUndefined, reflection.KindVoid:
		// Same comma-expression pattern as KindNull —
		// binary/fromBinary.ts:69.
		return RTCode{Code: ret + " = (" + des + ".index++, undefined)", Type: CodeS}

	case reflection.KindSymbol:
		// Unsupported — symbol identity does not round-trip.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// Unsupported — a RegExp is a pattern the receiver would run, not data;
		// it is dropped from the wire like a function (DataOnly strips it).
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindEnum:
		return RTCode{Code: ret + " = " + des + ".desEnum()", Type: CodeS}

	case reflection.KindNever:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindLiteral:
		return emitLiteralFromBinary(rt, ret, des)

	// ###################### MEMBER TYPES ######################
	case reflection.KindArray:
		return emitArrayFromBinary(rt, ctx, ret, des)

	case reflection.KindIndexSignature:
		return emitIndexSignatureFromBinary(rt, ctx, ret, des, true)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyFromBinary(rt, ctx, ret, des)

	case reflection.KindTupleMember:
		return emitTupleMemberFromBinary(rt, ctx, ret, des)

	// ###################### COLLECTION TYPES ######################
	case reflection.KindObjectLiteral, reflection.KindIntersection:
		return emitObjectFromBinary(rt, ctx, ret, des)

	case reflection.KindClass:
		if info, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
			// Byte-symmetric with binary_to: numeric-unpack the fixed-layout
			// types, fall back to Temporal.<T>.from(string) for the rest
			// (temporalFromBinary returns "" for ZonedDateTime, Duration,
			// PlainMonthDay).
			if unpacked := temporalFromBinary(rt.SubKind, ret, des); unpacked != "" {
				return RTCode{Code: unpacked, Type: CodeS}
			}
			return RTCode{Code: ret + " = " + info.Builtin + ".from(" + des + ".desString())", Type: CodeS}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			// Same comma-expression trick as KindNumber: the 3rd arg slot
			// of getFloat64 carries the `index += 8` side-effect while
			// the read result is wrapped in `new Date(…)`.
			return RTCode{Code: ret + " = new Date(" + des + ".view.getFloat64(" + des + ".index, 1, (" + des + ".index += 8)))", Type: CodeS}
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableFromBinary(rt, ctx, ret, des)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		case reflection.SubKindNone:
			structural := emitObjectFromBinary(rt, ctx, ret, des)
			return wrapFromBinaryWithClassSerializer(rt, ctx, ret, des, structural)
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindTuple:
		return emitTupleFromBinary(rt, ctx, ret, des)

	case reflection.KindUnion:
		return emitUnionFromBinaryFlat(rt, ctx, ret, des)
	}
	return RTCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall passes the value slot + deserializer through. The
// inner function returns the decoded value; the caller assigns it back
// onto its accessor.
//
// Shape: `<accessor> = <hash>.fn(<accessor>, Des)` so the child's
// reassignment of `ret` propagates back to the parent's frame.
func (FromBinaryEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	des := ctx.ArgName("dεs")
	return ctx.emitDepCall(childID, ctx.Vλl+", "+des, ctx.Vλl)
}

// Finalize — empty bodies collapse to `return ret` + noop flag.
func (FromBinaryEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return ret" {
		return "return ret", true
	}
	return code, false
}

// IsNoopType — fromBinary is never the family identity for a real node:
// even literal roots ASSIGN the value (`ret = <literal>`), undefined consumes
// its sentinel byte, and every atom reads bytes. Also deliberately NOT
// NoopComposeAround — parents advance positionally through the byte stream,
// so skipping a child decode would desynchronize every later read.
func (FromBinaryEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return false
}

func emitLiteralFromBinary(rt *reflection.RunType, ret, des string) RTCode {
	_ = des
	// The reference binary/fromBinary.ts treats literals as compile-time noops
	// because the RT body that REFERENCES the literal already has the
	// value statically. For us, the RT body is shared across consumers
	// and the decoded value must be a usable object — so we restore the
	// literal value at the accessor. Encoder writes no bytes (the
	// discriminator from the surrounding union arm is the only signal);
	// decoder assigns the literal value.
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	literal := rt.Literal
	if flagSet["bigint"] {
		decimal, ok := literal.(string)
		if !ok {
			return RTCode{Code: "", Type: CodeS}
		}
		return RTCode{Code: ret + " = " + decimal + "n", Type: CodeS}
	}
	if flagSet["symbol"] {
		entry, ok := literal.(map[string]any)
		if !ok {
			return RTCode{Code: "", Type: CodeS}
		}
		name, _ := entry["symbol"].(string)
		return RTCode{Code: ret + " = Symbol(" + quoteJS(name) + ")", Type: CodeS}
	}
	lit, err := jsLiteralFromAny(literal)
	if err != nil {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: ret + " = " + lit, Type: CodeS}
}

func emitArrayFromBinary(rt *reflection.RunType, ctx *EmitContext, ret, des string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	lenVar := ctx.NextLocalVar("alen")
	iVar := ctx.NextLocalVar("i")
	ctx.SetChildAccessor(ret + "[" + iVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	// The count is bounded by the bytes left before anything is allocated:
	// desCount refuses a count the buffer cannot back (see minWireBytes).
	readLen := "const " + lenVar + " = " + des + ".desCount(" + strconv.Itoa(minWireBytes(rt.Child, ctx)) + ")"
	body := readLen + ";" + ret + " = new Array(" + lenVar + ")"
	if childRT.Code != "" {
		body += ";for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" + childRT.Code + "}"
	}
	return RTCode{Code: body, Type: CodeS}
}

// emitIndexSignatureFromBinary decodes the `[uint32 count, (key, value)*]` wire.
// `resetRet` writes the `ret = {}` initialiser; emitObjectFromBinary passes false
// because it has already initialised `ret` and populated the named props (so the
// index sig must NOT wipe them — it reads only the dynamic keys the encoder wrote).
func emitIndexSignatureFromBinary(rt *reflection.RunType, ctx *EmitContext, ret, des string, resetRet bool) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if isSymbolKeyedIndexSig(rt, ctx) {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil || isFunctionLikeKind(resolved.Kind) {
		return RTCode{Code: "", Type: CodeS}
	}
	keyVar := ctx.NextLocalVar("k")
	ctx.SetChildAccessor(ret + "[" + keyVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	lenVar := ctx.NextLocalVar("cnt")
	iVar := ctx.NextLocalVar("i")

	numericKey := false
	if rt.Index != nil {
		idxResolved := ctx.ResolveRef(rt.Index)
		if idxResolved != nil && idxResolved.Kind == reflection.KindNumber {
			numericKey = true
		}
	}
	var keyRead string
	if numericKey {
		keyRead = "const " + keyVar + " = " + des + ".view.getUint32(" + des + ".index, 1); " + des + ".index += 4"
	} else {
		keyRead = "const " + keyVar + " = " + des + ".desSafePropName()"
	}
	prefix := ""
	if resetRet {
		prefix = ret + " = {};"
	}
	// Each entry needs at least its key (4 bytes numeric, 1 byte string) plus
	// the value's floor; desCountU32 refuses a count the buffer cannot back.
	minEntry := 1 + minWireBytes(rt.Child, ctx)
	if numericKey {
		minEntry = 4 + minWireBytes(rt.Child, ctx)
	}
	body := prefix + "const " + lenVar + " = " + des + ".desCountU32(" + strconv.Itoa(minEntry) + ");" +
		"for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" + keyRead + ";" + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

func emitPropertyFromBinary(rt *reflection.RunType, ctx *EmitContext, ret, des string) RTCode {
	_ = des
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	resolved := ctx.ResolveRef(rt.Child)
	if resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if strippedPropertyDrop(resolved, rt.Name, ctx) {
		// Directly DataOnly-stripped value — drop the property.
		return RTCode{Code: "", Type: CodeS}
	}
	accessor := propertyAccessor(ret, rt.Name, rt.IsSafeName)
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		// Stripped leaf in a propagating slot (symbol[], …) fails the object;
		// any other unsupported kind is absorbed (F3). See propertyChildFailed.
		if propertyChildFailed(ctx) {
			return RTCode{Code: "", Type: CodeNS}
		}
		return RTCode{Code: "", Type: CodeS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return childRT
}

func emitObjectFromBinary(rt *reflection.RunType, ctx *EmitContext, ret, des string) RTCode {
	// A callable interface is function-like (DataOnly = never); treat it like a
	// bare function (alwaysThrow at root, dropped at a property), not an object.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	// The shared partition keeps decode in lockstep with encode (the wire
	// bitmap depends on the same required/optional split on both sides).
	// The index signature is decoded AFTER the named props (it reads only
	// the dynamic keys the encoder wrote, keeping `ret`). Before, an index
	// signature took over the whole object and lost the named props (F1).
	required, optional, indexSig := partitionBinaryObjectProps(rt, ctx)

	// `ret = {};` — explicit `;` because addFullStop in walker.go would
	// treat the trailing `}` of `{}` as already-terminated and skip the
	// separator, producing `ret = {} return ret` (syntax error).
	parts := []string{ret + " = {};"}

	for _, child := range required {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}

	if len(optional) > 0 {
		bitmapInit, bitmapVar := readOptionalBitmapInit(ctx, des, len(optional), false)
		parts = append(parts, bitmapInit)
		for i, child := range optional {
			resolved := ctx.ResolveRef(child)
			if resolved == nil {
				continue
			}
			accessor := propertyAccessor(ret, resolved.Name, resolved.IsSafeName)
			ctx.SetChildAccessor(accessor)
			childGrand := resolved.Child
			innerRT := RTCode{Code: "", Type: CodeS}
			if childGrand != nil {
				innerRT = ctx.CompileChild(childGrand, CodeS)
			}
			ctx.SetChildAccessor("")
			if innerRT.Type == CodeNS {
				if propertyChildFailed(ctx) {
					return RTCode{Code: "", Type: CodeNS}
				}
				// Absorbed unknown kind — keep the optional bit (mirrors the
				// encode side) but read no value, dropping the property.
				innerRT = RTCode{Code: "", Type: CodeS}
			}
			bitCheck := bitCheckExpr(des, bitmapVar, i)
			body := innerRT.Code
			if body == "" {
				body = ""
			}
			parts = append(parts, "if ("+bitCheck+") {"+body+"}")
		}
	}

	// Index signature for the remaining (dynamic) keys. `ret` already holds the
	// named props, so don't re-initialise it (resetRet=false).
	if indexSig != nil {
		idxRT := emitIndexSignatureFromBinary(indexSig, ctx, ret, des, false)
		if idxRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if idxRT.Code != "" {
			parts = append(parts, idxRT.Code)
		}
	}

	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

func emitTupleFromBinary(rt *reflection.RunType, ctx *EmitContext, ret, des string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	var required, optional, rest []*reflection.RunType
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if isRestTupleMember(resolved) {
			rest = append(rest, child)
		} else if resolved.Optional {
			optional = append(optional, child)
		} else {
			required = append(required, child)
		}
	}

	parts := []string{ret + " = [];"}
	for _, child := range required {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}

	if len(optional) > 0 {
		bitmapInit, bitmapVar := readOptionalBitmapInit(ctx, des, len(optional), true)
		parts = append(parts, bitmapInit)
		for i, child := range optional {
			resolved := ctx.ResolveRef(child)
			if resolved == nil {
				continue
			}
			pos := positionStr(resolved)
			accessor := ret + "[" + pos + "]"
			ctx.SetChildAccessor(accessor)
			childGrand := resolved.Child
			innerRT := RTCode{Code: "", Type: CodeS}
			if childGrand != nil {
				innerRT = ctx.CompileChild(childGrand, CodeS)
			}
			ctx.SetChildAccessor("")
			if innerRT.Type == CodeNS {
				return RTCode{Code: "", Type: CodeNS}
			}
			bitCheck := bitCheckExpr(des, bitmapVar, i)
			parts = append(parts, "if ("+bitCheck+") {"+innerRT.Code+"}")
		}
	}

	for _, child := range rest {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			parts = append(parts, childRT.Code)
		}
	}

	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

func emitTupleMemberFromBinary(rt *reflection.RunType, ctx *EmitContext, ret, des string) RTCode {
	_ = des
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// Function-typed tuple slots fall through to CompileChild — the
	// function arm returns CodeNS and the renderer emits alwaysThrow.
	if isRestTupleMember(rt) {
		// Rest tuple member: read varint length, then loop.
		lenVar := ctx.NextLocalVar("rln")
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(ret + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		body := "const " + lenVar + " = " + des + ".desCount(" + strconv.Itoa(minWireBytes(rt.Child, ctx)) + ");" +
			"for (let " + iVar + " = " + positionStr(rt) + "; " + iVar + " < " + positionStr(rt) + " + " + lenVar + "; " + iVar + "++) {" + childRT.Code + "}"
		return RTCode{Code: body, Type: CodeS}
	}
	idxLit := positionStr(rt)
	accessor := ret + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	return childRT
}

func emitNativeIterableFromBinary(rt *reflection.RunType, ctx *EmitContext, ret, des string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	ctorName := "Map"
	if !isMap {
		ctorName = "Set"
	}

	innerTypes := iterableInnerTypes(rt, ctx)

	lenVar := ctx.NextLocalVar("mlen")
	iVar := ctx.NextLocalVar("i")

	if isMap {
		// Read each pair as [key, value] into a temp array then construct
		// the Map from the array.
		arrVar := ctx.NextLocalVar("mar")
		keyTmp := ctx.NextLocalVar("mk")
		valTmp := ctx.NextLocalVar("mv")

		ctx.SetChildAccessor(keyTmp)
		keyRT := RTCode{Code: "", Type: CodeS}
		if innerTypes[0] != nil {
			keyRT = ctx.CompileChild(innerTypes[0], CodeS)
		}
		ctx.SetChildAccessor("")
		ctx.SetChildAccessor(valTmp)
		valRT := RTCode{Code: "", Type: CodeS}
		if len(innerTypes) > 1 && innerTypes[1] != nil {
			valRT = ctx.CompileChild(innerTypes[1], CodeS)
		}
		ctx.SetChildAccessor("")
		if keyRT.Type == CodeNS || valRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}

		minEntry := minWireBytes(innerTypes[0], ctx) + minWireBytes(innerTypes[1], ctx)
		body := "const " + lenVar + " = " + des + ".desCount(" + strconv.Itoa(minEntry) + ");" +
			"const " + arrVar + " = [];" +
			"for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" +
			"let " + keyTmp + ", " + valTmp + ";" + keyRT.Code + ";" + valRT.Code + ";" +
			arrVar + ".push([" + keyTmp + ", " + valTmp + "]);}" +
			ret + " = new Map(" + arrVar + ")"
		return RTCode{Code: body, Type: CodeS}
	}

	// Set
	arrVar := ctx.NextLocalVar("sar")
	itemTmp := ctx.NextLocalVar("si")
	ctx.SetChildAccessor(itemTmp)
	itemRT := RTCode{Code: "", Type: CodeS}
	if len(innerTypes) > 0 && innerTypes[0] != nil {
		itemRT = ctx.CompileChild(innerTypes[0], CodeS)
	}
	ctx.SetChildAccessor("")
	if itemRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	minItem := 0
	if len(innerTypes) > 0 && innerTypes[0] != nil {
		minItem = minWireBytes(innerTypes[0], ctx)
	}
	body := "const " + lenVar + " = " + des + ".desCount(" + strconv.Itoa(minItem) + ");" +
		"const " + arrVar + " = [];" +
		"for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" +
		"let " + itemTmp + ";" + itemRT.Code + ";" + arrVar + ".push(" + itemTmp + ");}" +
		ret + " = new " + ctorName + "(" + arrVar + ")"
	return RTCode{Code: body, Type: CodeS}
}
