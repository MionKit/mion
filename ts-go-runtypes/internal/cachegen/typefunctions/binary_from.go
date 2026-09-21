package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// FromBinaryEmitter implements the `fromBinary` rt function: rebuilds a value from the bytes in a
// DataViewDeserializer, paired with ToBinaryEmitter for the round-trip
// `fromBinary(toBinary(v, ser).getBuffer(), des) ⟶ v`.
//
// The first arg `ret` starts `undefined`; the body assigns the decoded value to it and returns it, and by
// the walker's "first arg is the base value accessor" contract it is what every Emit references via
// ctx.Vλl. A compound kind initialises `ret` to a new container before populating children.
type FromBinaryEmitter struct{}

func (FromBinaryEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "ret", Default: ""},
		{Key: "dεs", Name: "Des", Default: ""},
	}
}

func (FromBinaryEmitter) Supports(rt *reflection.RunType) bool {
	return ToBinaryEmitter{}.Supports(rt)
}

func (FromBinaryEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

func (FromBinaryEmitter) ReturnName() string {
	return "ret"
}

// binaryFromOverride returns a format-specific binary-decode EXPRESSION (RHS of `ret = …`) when rt's
// format emitter implements formats.BinaryDecoder, else "" to keep the host's base-kind arm.
// Byte-symmetric counterpart to binaryToOverride.
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
		return RTCode{Code: ret + " = JSON.parse(" + des + ".desString())", Type: CodeS}

	case reflection.KindNull:
		// The encoder wrote a 0 sentinel byte; the comma expression folds consuming it into the
		// assignment RHS, keeping the emit one statement.
		return RTCode{Code: ret + " = (" + des + ".index++, null)", Type: CodeS}

	case reflection.KindBoolean:
		return RTCode{Code: ret + " = !!" + des + ".view.getUint8(" + des + ".index++)", Type: CodeS}

	case reflection.KindNumber:
		// `getFloat64` ignores a 3rd argument at runtime but still evaluates it, so `index += 8` rides
		// there and the read stays one statement. A numberFormat brand may decode 1/2/4 bytes instead,
		// byte-symmetric with its encode.
		expr := des + ".view.getFloat64(" + des + ".index, 1, (" + des + ".index += 8))"
		if override := binaryFromOverride(rt, des, ctx); override != "" {
			expr = override
		}
		return RTCode{Code: ret + " = " + expr, Type: CodeS}

	case reflection.KindString, reflection.KindTemplateLiteral:
		return RTCode{Code: ret + " = " + des + ".desString()", Type: CodeS}

	case reflection.KindBigInt:
		// A bigintFormat brand whose min/max fit 64-bit decodes 8 bytes, byte-symmetric with its encode;
		// an empty override keeps the string base arm.
		if override := binaryFromOverride(rt, des, ctx); override != "" {
			return RTCode{Code: ret + " = " + override, Type: CodeS}
		}
		// Only the exact wire form converts; anything else stays a string for validate to refuse
		// (`BigInt('')` would be `0n`).
		re := bigintWireRegexVar(ctx)
		return RTCode{Code: ret + " = " + des + ".desString();if (" + re + ".test(" + ret + ")) " + ret + " = BigInt(" + ret + ")", Type: CodeS}

	case reflection.KindUndefined, reflection.KindVoid:
		// Same comma expression as KindNull: consume the sentinel byte inside the assignment.
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
			// Byte-symmetric with binary_to: numeric-unpack the fixed-layout types, and
			// Temporal.<T>.from(string) for ZonedDateTime, Duration and PlainMonthDay.
			if unpacked := temporalFromBinary(rt.SubKind, ret, des); unpacked != "" {
				return RTCode{Code: unpacked, Type: CodeS}
			}
			return RTCode{Code: ret + " = " + info.Builtin + ".from(" + des + ".desString())", Type: CodeS}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			// Same as KindNumber: getFloat64's 3rd argument slot carries the `index += 8`.
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

// EmitDependencyCall emits `<accessor> = <hash>.fn(<accessor>, Des)`, so the child's reassignment of
// `ret` propagates back into the parent's frame.
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

// IsNoopType — fromBinary is never a noop: even a literal root ASSIGNS the value and undefined consumes
// its sentinel byte. Deliberately NOT NoopComposeAround either: parents advance positionally through the
// byte stream, so skipping a child decode desynchronizes every later read.
func (FromBinaryEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return false
}

func emitLiteralFromBinary(rt *reflection.RunType, ret, des string) RTCode {
	_ = des
	// The encoder writes no bytes (the surrounding union arm's discriminator is the only signal), so the
	// literal value is restored at the accessor here; the shared RT body has no static copy of it.
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
		// A rebuilt Symbol() is never the symbol the literal type names, so it is refused like the bare kind.
		return RTCode{Code: "", Type: CodeNS}
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
	// desCount refuses a count the remaining bytes cannot back, before anything is allocated (minWireBytes).
	readLen := "const " + lenVar + " = " + des + ".desCount(" + strconv.Itoa(minWireBytes(rt.Child, ctx)) + ")"
	body := readLen + ";" + ret + " = new Array(" + lenVar + ")"
	if childRT.Code != "" {
		body += ";for (let " + iVar + " = 0; " + iVar + " < " + lenVar + "; " + iVar + "++) {" + childRT.Code + "}"
	}
	return RTCode{Code: body, Type: CodeS}
}

// emitIndexSignatureFromBinary decodes the `[uint32 count, (key, value)*]` wire. `resetRet` writes the
// `ret = {}` initialiser; emitObjectFromBinary passes false because it has already populated the named
// props, which the index sig must NOT wipe: it reads only the dynamic keys the encoder wrote.
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
	// Each entry needs at least its key (4 bytes numeric, 1 byte string) plus the value's floor;
	// desCountU32 refuses a count the buffer cannot back.
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
	// The shared partition keeps decode in lockstep with encode: the wire bitmap depends on both sides
	// making the same required/optional split. The index signature is decoded AFTER the named props, which
	// it keeps; an index signature taking over the whole object loses them (F1).
	required, optional, indexSigs := partitionBinaryObjectProps(rt, ctx)

	// The explicit `;` is required: addFullStop in walker.go reads the trailing `}` of `{}` as already
	// terminated and skips the separator, producing `ret = {} return ret`.
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
				// Absorbed unknown kind: keep the optional bit (mirroring encode) but read no value.
				innerRT = RTCode{Code: "", Type: CodeS}
			}
			bitCheck := bitCheckExpr(des, bitmapVar, i)
			// An empty body is safe: the encoder writes only the bit, so neither side moves the byte cursor.
			parts = append(parts, "if ("+bitCheck+") {"+innerRT.Code+"}")
		}
	}

	// The remaining dynamic keys, in the encoder's member order; `ret` already holds the named props, so
	// it must not be re-initialised.
	for _, indexSig := range indexSigs {
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
		// An empty tuple occupies zero bytes but still decodes to a value; leaving the slot untouched
		// hands back `undefined` for every `[]` inside an array or a Set.
		return RTCode{Code: ret + " = [];", Type: CodeS}
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
	// Function-typed slots fall through to CompileChild: CodeNS, and the renderer emits alwaysThrow.
	if isRestTupleMember(rt) {
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
