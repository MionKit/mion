package typefunctions

import (
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// ToBinaryEmitter implements the `toBinary` rt function — serializes a
// runtime value into a binary byte stream, mutating a DataViewSerializer
// instance passed via the second arg (`sεr`, conventionally `Ser`).
//
// Paired with FromBinaryEmitter — round-trip
// `fromBinary(toBinary(v, ser).getBuffer(), des) ⟶ v` must deep-equal v
// for every valid sample. Tests assert the round-trip; the half can't
// be verified independently.
//
// Mirrors the mega-switch at
// (ref: packages/run-types/src/rtCompilers/binary/toBinary.ts) (no
// per-kind files — single 437-line switch).
//
// Wire encoding (per binarySPEC.md):
//   - null/undefined/void:    uint8 sentinel (0 / 1)
//   - boolean:                uint8 (0 / 1)
//   - number:                 float64 LE
//   - string/templateLiteral: [uint32 length, utf8 bytes] (serString)
//   - bigint:                 serString(v.toString(), true)
//   - any/unknown/object:     serString(JSON.stringify(v))
//   - regexp:                 serString(source); serString(flags)
//   - enum:                   serEnum(v)  [uint32 type, value]
//   - symbol:                 serString(v.description || ”)
//   - array/rest:             [varint length, items...]
//   - indexSignature:         [uint32 count, (key, value)*]
//   - objectLiteral:          required props in order, then optional bitmap + values
//   - class(Date):            float64 of getTime()
//   - class(Map/Set):         [varint size, entries...]
//   - tuple:                  required, optional bitmap, rest
//   - union:                  flat-prop format — see union_flat_binary.go.
//
// Phase 1: every Supports check returns false; the renderer emits no
// entries. Subsequent phases enable kinds one bucket at a time.
type ToBinaryEmitter struct{}

// Args mirrors `rtBinarySerializerArgs = {vλl: 'v', sεr: 'Ser'}`
// (ref: constants.functions.ts:51). Returns the serializer
// (`Ser`) so callers can chain `.getBuffer()`.
func (ToBinaryEmitter) Args() []ArgSpec {
	return []ArgSpec{
		{Key: "vλl", Name: "v", Default: ""},
		{Key: "sεr", Name: "Ser", Default: ""},
	}
}

// EmitCircularGuard renders the inline circular-reference guard for the armed
// toBinary variant: a detected cycle throws a CircularReferenceError (via
// utl.circularError) before any bytes are written, matching JSON.stringify and
// the old encoder guard.
func (ToBinaryEmitter) EmitCircularGuard(fcpAlias, skeletonConst string) string {
	return "const cyR=" + fcpAlias + "(v," + skeletonConst + ");if(cyR)throw utl.circularError(cyR);"
}

// Supports gates the renderer's top-level loop. Phase 1: returns false
// for every kind so no factory is emitted. Phase 2+ flip kinds on
// incrementally — see the matching FromBinaryEmitter for the symmetric
// gate.
func (ToBinaryEmitter) Supports(rt *reflection.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case reflection.KindAny, reflection.KindUnknown,
		reflection.KindNull, reflection.KindUndefined, reflection.KindVoid,
		reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
		reflection.KindBigInt, reflection.KindSymbol,
		reflection.KindObject, reflection.KindRegexp,
		reflection.KindLiteral, reflection.KindEnum,
		reflection.KindTemplateLiteral:
		return true
	case reflection.KindNever:
		return true
	case reflection.KindArray:
		return rt.Child != nil
	case reflection.KindObjectLiteral:
		return true
	case reflection.KindProperty, reflection.KindPropertySignature:
		return true
	case reflection.KindIndexSignature:
		return true
	case reflection.KindTuple:
		return true
	case reflection.KindTupleMember:
		return true
	case reflection.KindUnion:
		return len(rt.Children) > 0
	case reflection.KindIntersection:
		return true
	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		return true
	case reflection.KindClass:
		switch rt.SubKind {
		case reflection.SubKindDate, reflection.SubKindNone,
			reflection.SubKindMap, reflection.SubKindSet,
			reflection.SubKindNonSerializable:
			return true
		}
		return reflection.IsTemporalSubKind(rt.SubKind)
	case reflection.KindPromise:
		return true
	}
	return false
}

// IsRTInlined delegates to DefaultIsRTInlined — same heuristics as
// every other RT family.
func (ToBinaryEmitter) IsRTInlined(ctx *InlineContext) bool {
	return DefaultIsRTInlined(ctx)
}

// IsNoopType — the tb entry writes no bytes exactly for literal-only graphs
// with no optional/rest/index slots and no format annotations (see
// isNoopForToBinary).
func (ToBinaryEmitter) IsNoopType(rt *reflection.RunType, ctx *EmitContext) bool {
	return isNoopForToBinary(rt, ctx)
}

// NoopChildComposesAround — a child that writes no bytes contributes nothing
// to the serializer stream; empty code composes correctly.
func (ToBinaryEmitter) NoopChildComposesAround() {}

// ReturnName is the serializer arg (`Ser`). Per
// `RTFunctions.toBinary.returnName = rtBinarySerializerArgs.sεr`
// (constants.functions.ts:111) — the inner fn returns the serializer
// instance so callers can chain `.getBuffer()`.
func (ToBinaryEmitter) ReturnName() string {
	return "Ser"
}

// binaryToOverride returns a format-specific binary-encode STATEMENT when
// rt carries a FormatAnnotation whose emitter implements
// formats.BinaryEncoder and yields a non-empty body, else "". Empty =
// keep the host's base-kind arm (the `{code: undefined}` → run-types
// default). Mirrors the optional-interface type-assert pattern in
// formattransform.go:nodeFormatTransform.
func binaryToOverride(rt *reflection.RunType, v, ser string, ctx *EmitContext) string {
	if rt == nil || rt.FormatAnnotation == nil {
		return ""
	}
	emitter, ok := formats.LookupForRunType(rt)
	if !ok {
		return ""
	}
	encoder, ok := emitter.(formats.BinaryEncoder)
	if !ok {
		return ""
	}
	return encoder.EmitToBinary(rt.FormatAnnotation, v, ser, ctx)
}

// reserveExpr fuses a capacity reserve into an inline write as a comma-sequence
// expression: `(Ser.ensureCapacity?.(n), <write>)`. In 'dynamic' mode the member
// is the grow function so the buffer grows; in 'precalculate' / 'initial' it is
// undefined so the `?.` short-circuits — neither the call nor `n` runs. This is
// what lets the same emitted body serve all three sizing modes (one cache entry).
func reserveExpr(ser, nBytes, write string) string {
	return "(" + ser + ".ensureCapacity?.(" + nBytes + ")," + write + ")"
}

// reserveInline is reserveExpr for a scalar arm, skipped when the parent already
// reserved the block (a fixed-width array — see emitArrayToBinary), so the loop
// body stays a tight raw write (container-boundary reservation).
func reserveInline(ser, nBytes, write string, ctx *EmitContext) string {
	if ctx.SuppressInlineReserve() {
		return write
	}
	return reserveExpr(ser, nBytes, write)
}

// fixedWidthForKind returns the inline byte width for a scalar kind whose
// toBinary arm writes a fixed number of bytes — so a homogeneous array can
// reserve `length * width` once instead of per element. A packed numberFormat
// (int8/16/32) writes its exact 1/2/4-byte width; an unbranded number is float64
// (8). Matching the per-element width to what's actually written keeps the
// container reserve tight so a cold dynamic buffer doesn't grow on in-bounds data.
func fixedWidthForKind(rt *reflection.RunType) (int, bool) {
	if rt == nil {
		return 0, false
	}
	switch rt.Kind {
	case reflection.KindNumber:
		if packed := formatFixedWidth(rt); packed > 0 {
			return packed, true
		}
		return 8, true
	case reflection.KindBoolean, reflection.KindNull, reflection.KindUndefined, reflection.KindVoid:
		return 1, true
	}
	return 0, false
}

// Emit dispatches the per-kind switch. Each arm mirrors the
// emitToBinary switch (binary/toBinary.ts:35-405).
//
// Phase 1: every arm returns CodeNS so no entries get emitted. The
// renderer skips every supported kind silently — `Supports` was set
// to widen during early development; the actual emit lights up
// kind-by-kind in subsequent phases.
func (ToBinaryEmitter) Emit(rt *reflection.RunType, ctx *EmitContext, _ CodeType) RTCode {
	if rt == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	v := ctx.Vλl
	ser := ctx.ArgName("sεr")
	switch rt.Kind {

	// ###################### ATOMIC TYPES ######################
	case reflection.KindAny, reflection.KindUnknown, reflection.KindObject:
		// ref:binary/toBinary.ts:47-49,73-75 —
		// `serString(JSON.stringify(v))`. Serialized as JSON string.
		return RTCode{Code: ser + ".serString(JSON.stringify(" + v + "))", Type: CodeS}

	case reflection.KindNull:
		// ref:binary/toBinary.ts:52 — `view.setUint8(index++, 0)`.
		return RTCode{Code: reserveInline(ser, "1", ser+".view.setUint8("+ser+".index++, 0)", ctx), Type: CodeS}

	case reflection.KindBoolean:
		// ref:binary/toBinary.ts:54 — `view.setUint8(index++, !!v)`.
		return RTCode{Code: reserveInline(ser, "1", ser+".view.setUint8("+ser+".index++, !!"+v+")", ctx), Type: CodeS}

	case reflection.KindNumber:
		// ref:binary/toBinary.ts:56 —
		// `view.setFloat64(index, v, 1, (index += 8))`. A numberFormat
		// brand may pack the value into 1/2/4 bytes (int8/16/32) — see
		// formats/numeric. Empty override = keep the float64 base arm.
		code := ser + ".view.setFloat64(" + ser + ".index, " + v + ", 1, (" + ser + ".index += 8))"
		width := 8 // float64 base arm
		if override := binaryToOverride(rt, v, ser, ctx); override != "" {
			code = override
			// A packed numberFormat writes exactly BinarySize().Fixed bytes
			// (1/2/4) — reserve that, not the float64 worst case, so a cold
			// dynamic buffer seeded at the estimate (which uses the SAME width)
			// doesn't grow on an in-bounds packed value.
			if packed := formatFixedWidth(rt); packed > 0 {
				width = packed
			}
		}
		return RTCode{Code: reserveInline(ser, strconv.Itoa(width), code, ctx), Type: CodeS}

	case reflection.KindString, reflection.KindTemplateLiteral:
		// ref:binary/toBinary.ts:59,85 — `serString(v)`.
		return RTCode{Code: ser + ".serString(" + v + ")", Type: CodeS}

	case reflection.KindBigInt:
		// ref:binary/toBinary.ts:62 — `serString(v.toString(), true)`.
		// `true` flag bypasses the string cache (bigints rarely repeat).
		// A bigintFormat brand whose min/max fit signed/unsigned 64-bit
		// packs into 8 bytes via setBigInt64/setBigUint64 — see
		// formats/numeric. Empty override = keep the string base arm.
		code := ser + ".serString(" + v + ".toString(), true)"
		if override := binaryToOverride(rt, v, ser, ctx); override != "" {
			// The pack writes 8 bytes inline; the base arm is serString, which
			// reserves itself. Only the inline pack needs a reserve.
			code = reserveInline(ser, "8", override, ctx)
		}
		return RTCode{Code: code, Type: CodeS}

	case reflection.KindUndefined, reflection.KindVoid:
		// ref:binary/toBinary.ts:66 — `view.setUint8(index++, 1)`.
		return RTCode{Code: reserveInline(ser, "1", ser+".view.setUint8("+ser+".index++, 1)", ctx), Type: CodeS}

	case reflection.KindSymbol:
		// Unsupported — symbol identity does not round-trip through serialisation.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindRegexp:
		// Unsupported — a RegExp is a pattern the receiver would run, not data;
		// it is dropped from the wire like a function (DataOnly strips it).
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindEnum:
		// ref:binary/toBinary.ts:77 — `serEnum(v)`.
		return RTCode{Code: ser + ".serEnum(" + v + ")", Type: CodeS}

	case reflection.KindNever:
		// ref:binary/toBinary.ts:82 — throws "Never type cannot be
		// serialized to Binary".
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindPromise:
		// ref:binary/toBinary.ts:218 — throws
		// "RT compilation disabled for Non Serializable types.".
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindLiteral:
		// ref:binary/toBinary.ts:86-106 — when opts.noLiterals, dispatch
		// to the underlying primitive's emit. Otherwise the literal is
		// restored from the RunType at decode time (no bytes written /
		// read), so emit is a noop.
		return emitLiteralToBinary(rt, v, ser)

	// ###################### MEMBER TYPES ######################
	case reflection.KindArray:
		return emitArrayToBinary(rt, ctx, v, ser)

	case reflection.KindIndexSignature:
		return emitIndexSignatureToBinary(rt, ctx, v, ser)

	case reflection.KindFunction, reflection.KindMethod,
		reflection.KindMethodSignature, reflection.KindCallSignature:
		// ref:binary/toBinary.ts:156-164 — top-level function types are
		// not directly serializable; the reference exposes compileParams /
		// compileReturn for that. The Go side has no params subkind
		// (see protocol/subkind.go) so we always throw at top-level
		// function types.
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindProperty, reflection.KindPropertySignature:
		return emitPropertyToBinary(rt, ctx, v, ser)

	case reflection.KindTupleMember:
		return emitTupleMemberToBinary(rt, ctx, v, ser)

	// ###################### COLLECTION TYPES ######################
	case reflection.KindObjectLiteral, reflection.KindIntersection:
		return emitObjectToBinary(rt, ctx, v, ser)

	case reflection.KindClass:
		if reflection.IsTemporalSubKind(rt.SubKind) {
			// Numeric-pack the types with a fixed, ISO-representable layout
			// (Instant, PlainDate/Time/DateTime, PlainYearMonth) — see
			// temporal_binary.go. ZonedDateTime, Duration and PlainMonthDay
			// have no compact numeric form and keep the canonical toJSON()
			// string (temporalToBinary returns "" for them). Both forms are
			// byte-symmetric with the fromBinary arm.
			if packed := temporalToBinary(rt.SubKind, v, ser); packed != "" {
				return RTCode{Code: packed, Type: CodeS}
			}
			return RTCode{Code: ser + ".serString(" + v + ".toJSON())", Type: CodeS}
		}
		switch rt.SubKind {
		case reflection.SubKindDate:
			// ref:binary/toBinary.ts:265 —
			// `view.setFloat64(index, v.getTime(), 1, (index += 8))`.
			return RTCode{Code: reserveInline(ser, "8", ser+".view.setFloat64("+ser+".index, "+v+".getTime(), 1, ("+ser+".index += 8))", ctx), Type: CodeS}
		case reflection.SubKindMap, reflection.SubKindSet:
			return emitNativeIterableToBinary(rt, ctx, v, ser)
		case reflection.SubKindNonSerializable:
			return RTCode{Code: "", Type: CodeNS}
		case reflection.SubKindNone:
			structural := emitObjectToBinary(rt, ctx, v, ser)
			return wrapToBinaryWithClassSerializer(rt, ctx, v, ser, structural)
		}
		return RTCode{Code: "", Type: CodeNS}

	case reflection.KindTuple:
		return emitTupleToBinary(rt, ctx, v, ser)

	case reflection.KindUnion:
		return emitUnionToBinaryFlat(rt, ctx, v, ser)
	}
	return RTCode{Code: "", Type: CodeNS}
}

// EmitDependencyCall mirrors PrepareForJsonEmitter's pattern — pass the
// runtime value AND the serializer through the call. The inner function
// returns `Ser` so dependency-call sites that need to chain wouldn't
// need the return, but we keep the assignment shape symmetric with the
// other emitters.
//
// Shape: `<hash>.fn(v, Ser)` for cross-fn, `<hash>(v, Ser)` for self.
func (ToBinaryEmitter) EmitDependencyCall(rt *reflection.RunType, childID string, ctx *EmitContext) string {
	ser := ctx.ArgName("sεr")
	return ctx.emitDepCall(childID, ctx.Vλl+", "+ser, "")
}

// Finalize — empty bodies collapse to `return Ser` + noop flag. The
// renderer still emits the factory so dep-call chains resolve.
func (ToBinaryEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "return Ser" {
		return "return Ser", true
	}
	return code, false
}

// emitLiteralToBinary mirrors the literal.ts emitToBinary —
// dispatches to the underlying primitive's emit when noLiterals is set.
// Without noLiterals the literal value is restored from the RunType
// definition at decode time, so no bytes are written.
//
// v1: we don't carry noLiterals on the protocol RunType yet, so always
// fall through to the "skip" branch. Future: surface the option via
// RunType.Flags.
func emitLiteralToBinary(rt *reflection.RunType, v string, ser string) RTCode {
	_ = rt
	_ = v
	_ = ser
	return RTCode{Code: "", Type: CodeS}
}

// emitArrayToBinary mirrors binary/toBinary.ts:110-126.
//
// Wire shape: `[varint length, items...]`. The length prefix is written
// before the loop body so the decoder can preallocate. serLength reserves
// the worst-case varint width, so the inline length write can't overflow.
func emitArrayToBinary(rt *reflection.RunType, ctx *EmitContext, v string, ser string) RTCode {
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	iVar := ctx.NextLocalVar("i")
	// Container-boundary reservation: for a homogeneous fixed-width element type
	// (number, boolean, …) reserve the whole element block ONCE before the loop and
	// emit the body as a raw write (SuppressInlineReserve), instead of a reserve
	// per element. Other element types reserve themselves (serString, nested scalars).
	width, fixedWidth := fixedWidthForKind(ctx.ResolveRef(rt.Child))
	prevSuppress := ctx.SuppressInlineReserve()
	ctx.SetChildAccessor(v + "[" + iVar + "]")
	if fixedWidth {
		ctx.SetSuppressInlineReserve(true)
	}
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetSuppressInlineReserve(prevSuppress)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	if childRT.Code == "" {
		// All-noop child — still need to emit the length so the decoder
		// knows the array's size.
		body := ser + ".serLength(" + v + ".length)"
		return RTCode{Code: body, Type: CodeS}
	}
	// serLength reserves its own varint prefix; reserve the element block here so
	// the raw loop body never overflows.
	elemReserve := ""
	if fixedWidth {
		elemReserve = ser + ".ensureCapacity?.(" + v + ".length * " + strconv.Itoa(width) + ");"
	}
	body := ser + ".serLength(" + v + ".length);" + elemReserve +
		"for (let " + iVar + " = 0; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
	return RTCode{Code: body, Type: CodeS}
}

// emitIndexSignatureToBinary mirrors binary/toBinary.ts:127-154.
//
// Wire shape: `[uint32 count, (keyOrUint32, value)*]`. Count is
// back-patched after the loop so dynamic keysets are supported.
func emitIndexSignatureToBinary(rt *reflection.RunType, ctx *EmitContext, v string, ser string) RTCode {
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
	ctx.SetChildAccessor(v + "[" + keyVar + "]")
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}

	lenVar := ctx.NextLocalVar("cnt")
	idxVar := ctx.NextLocalVar("piI")
	// Determine key serialization: numeric index sig writes uint32,
	// string writes serString.
	numericKey := false
	if rt.Index != nil {
		idxResolved := ctx.ResolveRef(rt.Index)
		if idxResolved != nil && idxResolved.Kind == reflection.KindNumber {
			numericKey = true
		}
	}
	var keyCode string
	if numericKey {
		keyCode = ser + ".ensureCapacity?.(4);" + ser + ".view.setUint32(" + ser + ".index, Number(" + keyVar + "), 1);" + ser + ".index += 4"
	} else {
		keyCode = ser + ".serString(" + keyVar + ")"
	}
	// Skip keys that name a declared property — those are encoded positionally by
	// emitObjectToBinary; the index signature covers only the remaining dynamic
	// keys. `siblingNamedSkipCode` is "" when the object has no named props (a
	// bare Record), so this is a no-op there. The count is a 4-byte slot reserved
	// up front and back-patched after the loop (the back-patch writes within the
	// reserved slot, so it needs no reserve of its own).
	skip := siblingNamedSkipCode(rt, ctx, keyVar)
	// A key-filtered sweep (template-literal key, patternProperties entry)
	// writes only the keys it owns; the decoder reads the count back, so it
	// needs no filter of its own.
	if keyRegexVar := indexSignatureKeyRegexVar(rt, ctx); keyRegexVar != "" {
		skip += "if (!" + keyRegexVar + ".test(" + keyVar + ")) continue;"
	}
	body := "let " + lenVar + " = 0; const " + idxVar + " = " + ser + ".index; " + ser + ".ensureCapacity?.(4);" + ser + ".index += 4;" +
		"for (const " + keyVar + " in " + v + ") {" + skip + keyCode + ";" + childRT.Code + ";" + lenVar + "++;}" +
		ser + ".view.setUint32(" + idxVar + ", " + lenVar + ", 1)"
	return RTCode{Code: body, Type: CodeS}
}

// emitPropertyToBinary mirrors binary/toBinary.ts:181-195.
//
// Required properties: just emit child code (no header — order is
// determined by declaration). Optional properties: emit child code
// inside an `if (accessor !== undefined)` guard PLUS set the optional
// bitmap bit. The bitmap variable is set by the parent's
// emitObjectToBinary via context items.
func emitPropertyToBinary(rt *reflection.RunType, ctx *EmitContext, v string, ser string) RTCode {
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
	accessor := propertyAccessor(v, rt.Name, rt.IsSafeName)
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
	if rt.Optional {
		// The parent (emitObjectToBinary) wraps optional props with their
		// own bitmap handling — at the property level we just emit the
		// guarded code; the bitmap-set is appended by the parent.
		if childRT.Code == "" {
			return RTCode{Code: "if (" + accessor + " !== undefined) {}", Type: CodeS}
		}
		return RTCode{Code: "if (" + accessor + " !== undefined) {" + childRT.Code + "}", Type: CodeS}
	}
	if childRT.Code == "" {
		return RTCode{Code: "", Type: CodeS}
	}
	return childRT
}

// emitObjectToBinary mirrors binary/toBinary.ts:222-261.
//
// Wire shape:
//   - required props in declaration order (no header)
//   - optional bitmap: ceil(N/8) bytes, 1 bit per optional prop
//   - optional props in order — only emitted when their bit is set
//
// Skips static / function-typed children. When the object carries an
// index signature, the index signature's emit handles the whole loop.
func emitObjectToBinary(rt *reflection.RunType, ctx *EmitContext, v string, ser string) RTCode {
	// A callable interface is function-like (DataOnly = never); treat it like a
	// bare function (alwaysThrow at root, dropped at a property), not an object.
	if objectHasCallSignature(rt, ctx) {
		return RTCode{Code: "", Type: CodeNS}
	}
	// The index signature is emitted AFTER the named properties — an object
	// mixing named props with an index signature encodes each named prop with
	// its OWN type, then the index sig covers only the REMAINING dynamic keys
	// (skipped via the sibling-named set published below). Before, an index
	// signature short-circuited the whole object and mis-applied the index
	// value encoder to the named props too (F1).
	publishSiblingNamedKeysForIndexSig(rt, ctx)
	required, optional, indexSigs := partitionBinaryObjectProps(rt, ctx)

	var parts []string
	// Required props — straight concat in declared order.
	for _, child := range required {
		childRT := ctx.CompileChild(child, CodeS)
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			continue
		}
		parts = append(parts, childRT.Code)
	}

	if len(optional) > 0 {
		bitmapInit, bitmapVar := emitOptionalBitmapInit(ctx, ser, len(optional), false)
		// Emit each optional prop with a bit-set when its accessor is
		// defined. We pre-record the bitmap var so the property emit can
		// reach it via context items.
		var optParts []string
		for i, child := range optional {
			resolved := ctx.ResolveRef(child)
			if resolved == nil {
				continue
			}
			accessor := propertyAccessor(v, resolved.Name, resolved.IsSafeName)
			ctx.SetChildAccessor(accessor)
			innerRT := ctx.CompileChild(resolved.Child, CodeS)
			ctx.SetChildAccessor("")
			if innerRT.Type == CodeNS {
				if propertyChildFailed(ctx) {
					return RTCode{Code: "", Type: CodeNS}
				}
				// Absorbed unknown kind — keep the optional bit (both wire sides
				// reserve it) but write no value, so the property drops from the
				// decoded object while the bitmap stays in sync.
				innerRT = RTCode{Code: "", Type: CodeS}
			}
			bitIdx := strconv.Itoa(i & 7)
			setMask := ser + ".setBitMask(" + bitmapVar + ", " + bitIdx + ")"
			body := setMask
			if innerRT.Code != "" {
				body = innerRT.Code + ";" + setMask
			}
			// Presence test that drives the bit: a non-enumerable-guarded
			// member (lib-global-inherited / `@nonEnumerable`) sets its bit only
			// when the value carries it as an OWN-ENUMERABLE property
			// (`JSON.stringify` semantics); an ordinary optional member sets it
			// when defined. The decoder (fb) reads the same bit, so this is the
			// only side that needs to change.
			presentCond := accessor + " !== undefined"
			if isEnumerabilityGuarded(resolved) {
				presentCond = propertyIsEnumerableGuard(v, resolved.Name)
			}
			stmt := "if (" + presentCond + ") {" + body + "}"
			// Every 8 optional props we bump the bitmap byte index so
			// the next 8 bits land in a fresh byte.
			modIndex := i + 1
			if modIndex%8 == 0 && modIndex < len(optional) {
				stmt += ";" + bitmapVar + "++"
			}
			optParts = append(optParts, stmt)
		}
		parts = append(parts, bitmapInit)
		parts = append(parts, optParts...)
	}

	// Index signatures for the remaining (dynamic) keys, after the named
	// props, one count-prefixed block each in member order (the decoder reads
	// them back in the same order).
	for _, indexSig := range indexSigs {
		idxRT := emitIndexSignatureToBinary(indexSig, ctx, v, ser)
		if idxRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if idxRT.Code != "" {
			parts = append(parts, idxRT.Code)
		}
	}

	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitOptionalBitmapInit allocates a bitmap byte sequence at the
// current serializer index, zeroes the bytes, and returns the init
// code + the JS variable holding the bitmap's start index.
//
// `isTuple` flag exists for naming parity with the reference (`tbmI` for
// tuple, `bmI` for object) so debug names are recognisable in stack traces.
func emitOptionalBitmapInit(ctx *EmitContext, ser string, optionalLength int, isTuple bool) (string, string) {
	prefix := ""
	if isTuple {
		prefix = "t"
	}
	bitmapVar := ctx.NextLocalVar(prefix + "bmI")
	bitmapLength := (optionalLength + 7) / 8
	var zeroLoop string
	if bitmapLength > 1 {
		zeroVar := ctx.NextLocalVar(prefix + "iBl")
		zeroLoop = "for (let " + zeroVar + " = 0; " + zeroVar + " < " + strconv.Itoa(bitmapLength) + "; " + zeroVar + "++) {" + ser + ".view.setUint8(" + ser + ".index++, 0)}"
	} else {
		zeroLoop = ser + ".view.setUint8(" + ser + ".index++, 0)"
	}
	decl := "const"
	if bitmapLength > 1 {
		decl = "let"
	}
	// Reserve the whole bitmap before the zero-loop writes it; later setBitMask
	// calls flip bits within this already-reserved region (no further reserve).
	init := decl + " " + bitmapVar + " = " + ser + ".index;" + ser + ".ensureCapacity?.(" + strconv.Itoa(bitmapLength) + ");" + zeroLoop
	return init, bitmapVar
}

// readOptionalBitmapInit is the decode-side mirror of emitOptionalBitmapInit:
// it reserves the optional-presence bitmap bytes at the current deserializer
// index and returns the init code + the JS var holding the bitmap's start
// index. isTuple selects the `tbmI`/`bmI` name prefix for parity with the
// encode side.
func readOptionalBitmapInit(ctx *EmitContext, des string, optionalLength int, isTuple bool) (string, string) {
	prefix := ""
	if isTuple {
		prefix = "t"
	}
	bitmapLength := (optionalLength + 7) / 8
	bitmapVar := ctx.NextLocalVar(prefix + "bmI")
	var bitmapInit string
	if bitmapLength > 1 {
		bitmapInit = "const " + bitmapVar + " = " + des + ".index;" + des + ".index += " + strconv.Itoa(bitmapLength)
	} else {
		bitmapInit = "const " + bitmapVar + " = " + des + ".index++"
	}
	return bitmapInit, bitmapVar
}

// bitCheckExpr returns the JS expression testing whether optional slot i's
// presence bit is set in the decode-side bitmap rooted at bitmapVar.
func bitCheckExpr(des, bitmapVar string, i int) string {
	byteOffset := i / 8
	bitIdx := i & 7
	return "(" + des + ".view.getUint8(" + bitmapVar + " + " + strconv.Itoa(byteOffset) + ") & " + strconv.Itoa(1<<bitIdx) + ")"
}

// emitTupleToBinary mirrors binary/toBinary.ts:306-349.
//
// Wire shape: required, optional bitmap + values, rest. Function-param
// subkind: every non-rest param is treated as optional (binary protocol
// allows trailing params to be elided).
func emitTupleToBinary(rt *reflection.RunType, ctx *EmitContext, v string, ser string) RTCode {
	if len(rt.Children) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	// Function params are treated as a plain tuple: a member is optional
	// iff its own `optional` flag is set, exactly like every other tuple.
	// There is no SubKindParams on the protocol — the router-only
	// all-optional / paramsSlice conveniences are intentionally not ported.
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

	var parts []string
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
		bitmapInit, bitmapVar := emitOptionalBitmapInit(ctx, ser, len(optional), true)
		parts = append(parts, bitmapInit)
		for i, child := range optional {
			resolved := ctx.ResolveRef(child)
			if resolved == nil {
				continue
			}
			pos := positionStr(resolved)
			accessor := v + "[" + pos + "]"
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
			bitIdx := strconv.Itoa(i & 7)
			setMask := ser + ".setBitMask(" + bitmapVar + ", " + bitIdx + ")"
			body := setMask
			if innerRT.Code != "" {
				body = innerRT.Code + ";" + setMask
			}
			guarded := "if (" + accessor + " !== undefined) {" + body + "}"
			modIndex := i + 1
			if modIndex%8 == 0 && modIndex < len(optional) {
				guarded += ";" + bitmapVar + "++"
			}
			parts = append(parts, guarded)
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

	if len(parts) == 0 {
		return RTCode{Code: "", Type: CodeS}
	}
	return RTCode{Code: strings.Join(parts, ";"), Type: CodeS}
}

// emitTupleMemberToBinary handles a single tuple element. Required
// non-rest: emit child code at v[pos]. Rest: loop from pos to length
// emitting child code. Optional handling lives at the tuple level (the
// bitmap is per-tuple, not per-member), so optional tupleMember just
// emits the value code without the guard — the parent wraps it.
func emitTupleMemberToBinary(rt *reflection.RunType, ctx *EmitContext, v string, ser string) RTCode {
	_ = ser
	if rt.Child == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	if resolved := ctx.ResolveRef(rt.Child); resolved == nil {
		return RTCode{Code: "", Type: CodeS}
	}
	// Function-typed tuple slots fall through to CompileChild — the
	// function arm returns CodeNS, the walker latches the leaf, and the
	// renderer surfaces an alwaysThrow.
	if isRestTupleMember(rt) {
		iVar := ctx.NextLocalVar("i")
		ctx.SetChildAccessor(v + "[" + iVar + "]")
		childRT := ctx.CompileChild(rt.Child, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code == "" {
			return RTCode{Code: "", Type: CodeS}
		}
		// Write the rest count (= v.length - position) as a varint
		// before the items. Decoder reads this and loops
		// `i = position; i < position + count`. Without the length
		// prefix the decoder misaligns and reads garbage.
		pos := positionStr(rt)
		restCount := v + ".length - " + pos
		body := ser + ".serLength(" + restCount + ");" +
			"for (let " + iVar + " = " + pos + "; " + iVar + " < " + v + ".length; " + iVar + "++) {" + childRT.Code + "}"
		return RTCode{Code: body, Type: CodeS}
	}
	idxLit := positionStr(rt)
	accessor := v + "[" + idxLit + "]"
	ctx.SetChildAccessor(accessor)
	childRT := ctx.CompileChild(rt.Child, CodeS)
	ctx.SetChildAccessor("")
	if childRT.Type == CodeNS {
		return RTCode{Code: "", Type: CodeNS}
	}
	return childRT
}

// emitNativeIterableToBinary handles Map / Set — mirrors
// binary/toBinary.ts:269-285.
//
// Wire shape: `[varint size, entries...]`. Each entry is the wrapped
// child types' bytes (Map: key + value; Set: item).
func emitNativeIterableToBinary(rt *reflection.RunType, ctx *EmitContext, v string, ser string) RTCode {
	isMap := rt.SubKind == reflection.SubKindMap
	innerTypes := iterableInnerTypes(rt, ctx)

	entryVar := ctx.NextLocalVar("e")
	var childCodes []string
	for i, innerType := range innerTypes {
		if innerType == nil {
			continue
		}
		accessor := entryVar
		if isMap {
			accessor = entryVar + "[" + strconv.Itoa(i) + "]"
		}
		ctx.SetChildAccessor(accessor)
		childRT := ctx.CompileChild(innerType, CodeS)
		ctx.SetChildAccessor("")
		if childRT.Type == CodeNS {
			return RTCode{Code: "", Type: CodeNS}
		}
		if childRT.Code != "" {
			childCodes = append(childCodes, childRT.Code)
		}
	}

	setLen := ser + ".serLength(" + v + ".size)"
	if len(childCodes) == 0 {
		// No transforms — write just the size; decoder reconstructs
		// empty.
		return RTCode{Code: setLen, Type: CodeS}
	}
	body := setLen + ";for (const " + entryVar + " of " + v + ") {" + strings.Join(childCodes, ";") + "}"
	return RTCode{Code: body, Type: CodeS}
}
