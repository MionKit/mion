package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// minWireBytes is the LOWER BOUND on the bytes one value of rt occupies on the
// binary wire. The decoder uses it to bound a count before it allocates or
// loops: an array of N items needs at least N × min bytes behind the count,
// so a count that claims more items than the remaining bytes can hold is a
// malformed wire and is refused before `new Array(N)` runs (the five-byte body
// that used to exhaust the heap).
//
// Only ever an UNDER-estimate: a wrong low answer costs a weaker bound, a wrong
// high answer would refuse valid wires. Anything unsure (a recursive ref, a
// class with a registered serializer that writes a string instead of the
// structural layout, an unsupported kind) reports 0, which the reader turns
// into its fixed ceiling for zero-byte items.
func minWireBytes(rt *reflection.RunType, ctx *EmitContext) int {
	return minWireBytesSeen(rt, ctx, map[string]bool{})
}

func minWireBytesSeen(rt *reflection.RunType, ctx *EmitContext, seen map[string]bool) int {
	resolved := ctx.ResolveRef(rt)
	if resolved == nil {
		return 0
	}
	rt = resolved
	if rt.ID != "" {
		if seen[rt.ID] {
			return 0
		}
		seen[rt.ID] = true
		defer delete(seen, rt.ID)
	}
	switch rt.Kind {
	case reflection.KindNull, reflection.KindUndefined, reflection.KindVoid, reflection.KindBoolean:
		return 1
	case reflection.KindNumber:
		return fixedFormatWidth(rt, 8)
	case reflection.KindBigInt:
		// A fixed-width bigint format packs 8 bytes; the base arm writes a
		// decimal string (a varint length, at least one byte).
		return fixedFormatWidth(rt, 1)
	case reflection.KindString, reflection.KindTemplateLiteral,
		reflection.KindAny, reflection.KindUnknown, reflection.KindObject:
		// A length-prefixed string: the varint length is at least one byte.
		return 1
	case reflection.KindRegexp:
		// Never on the wire (not data), so nothing to bound.
		return 0
	case reflection.KindEnum:
		// A uint32 type tag, then a uint32 or a string.
		return 5
	case reflection.KindLiteral:
		// Literals write nothing: the surrounding arm restores the value.
		return 0
	case reflection.KindUnion:
		// At least the discriminator byte.
		return 1
	case reflection.KindArray:
		// The varint count.
		return 1
	case reflection.KindIndexSignature:
		// The uint32 count.
		return 4
	case reflection.KindTuple:
		return minTupleBytes(rt, ctx, seen)
	case reflection.KindTupleMember:
		if isRestTupleMember(rt) {
			return 1
		}
		if rt.Child == nil {
			return 0
		}
		return minWireBytesSeen(rt.Child, ctx, seen)
	case reflection.KindRest:
		return 1
	case reflection.KindProperty, reflection.KindPropertySignature:
		if rt.Child == nil {
			return 0
		}
		child := ctx.ResolveRef(rt.Child)
		if child == nil || isFunctionLikeKind(child.Kind) {
			return 0
		}
		return minWireBytesSeen(rt.Child, ctx, seen)
	case reflection.KindObjectLiteral, reflection.KindIntersection:
		return minObjectBytes(rt, ctx, seen)
	case reflection.KindClass:
		return minClassBytes(rt, ctx, seen)
	}
	// Functions, methods, symbols, promises, never, type parameters: not on the
	// wire, or unsupported.
	return 0
}

// fixedFormatWidth is the packed width a numeric format reports, else base.
func fixedFormatWidth(rt *reflection.RunType, base int) int {
	if rt.FormatAnnotation == nil {
		return base
	}
	emitter, ok := formats.LookupForRunType(rt)
	if !ok {
		return base
	}
	sizer, ok := emitter.(formats.BinarySizer)
	if !ok {
		return base
	}
	if hint := sizer.BinarySize(rt.FormatAnnotation); hint.Fixed > 0 {
		return hint.Fixed
	}
	return base
}

func minObjectBytes(rt *reflection.RunType, ctx *EmitContext, seen map[string]bool) int {
	if objectHasCallSignature(rt, ctx) {
		return 0
	}
	required, optional, indexSig := partitionBinaryObjectProps(rt, ctx)
	total := 0
	for _, child := range required {
		total += minWireBytesSeen(child, ctx, seen)
	}
	// The optional-presence bitmap: one bit per optional prop, packed in bytes.
	total += (len(optional) + 7) / 8
	if indexSig != nil {
		total += 4
	}
	return total
}

func minTupleBytes(rt *reflection.RunType, ctx *EmitContext, seen map[string]bool) int {
	total := 0
	optional := 0
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if isRestTupleMember(resolved) {
			total++
		} else if resolved.Optional {
			optional++
		} else {
			total += minWireBytesSeen(child, ctx, seen)
		}
	}
	return total + (optional+7)/8
}

func minClassBytes(rt *reflection.RunType, ctx *EmitContext, seen map[string]bool) int {
	if _, ok := reflection.TemporalInfoBySubKind(rt.SubKind); ok {
		switch rt.SubKind {
		case reflection.SubKindTemporalInstant:
			return 12
		case reflection.SubKindTemporalPlainTime:
			return 9
		}
		// A calendar discriminator byte, then the packed layout or a string.
		return 1
	}
	switch rt.SubKind {
	case reflection.SubKindDate:
		return 8
	case reflection.SubKindMap, reflection.SubKindSet:
		return 1
	case reflection.SubKindNone:
		// A registered class serializer swaps the structural layout for one
		// JSON string at runtime, so the structural sum is not a safe bound.
		return 1
	}
	return 0
}
