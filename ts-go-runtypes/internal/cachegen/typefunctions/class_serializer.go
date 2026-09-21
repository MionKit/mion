package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Custom class-serializer plumbing shared by the JSON + binary emitter families, for a plain user class
// (KindClass + SubKindNone) only: builtins (Date / Map / Set / RegExp / nonSerializable) are dispatched on
// SubKind before the SubKindNone arm. The factory looks the entry up through
// `utl.getClassSerializer(<rt.ID>, <rt.TypeName>)`, exact instantiation id first, class name as fallback;
// generics are erased at runtime, so the name is what lets one registration cover every `RpcError<…>`
// instantiation, and both literals are build-time strings, so the pairing is minification-stable.
//
// Both handler halves are OPTIONAL, which shapes the emitted branches:
//   - Encode routes through `entry.serialize` ONLY when present; a registered class without one encodes
//     structurally, identical to an unregistered one, so decode can recurse that same wire shape.
//   - Decode always rebuilds through `utl.deserializeClass(cs_<id>, data, k_<id>)`, which prefers
//     `entry.deserialize` and otherwise instantiates a zero-arg class and sets the DECLARED properties
//     (`k_<id>`, the hoisted name list the unknown-keys families share), surfacing CLS002 when `new cls()`
//     throws. Driven by the type, never by the wire keys, so an undeclared key (own `__proto__` included)
//     never lands on the instance.
//   - Without a custom `serialize`, decode runs the structural decode first (to recurse nested props) and
//     only then reconstructs; with one, the handler owns the wire shape and decode skips the recurse.
//
// `userClassName(rt)` is the ROUTABILITY GATE, NOT the registry key: an anonymous class (TS names it with
// the 0xFE InternalSymbolName prefix) cannot be passed to registerClassSerializer, so it stays structural.

// userClassName returns rt.TypeName, or "" for an anonymous class; "" tells callers to emit the
// structural shape with no registry branch.
func userClassName(rt *reflection.RunType) string {
	if rt == nil {
		return ""
	}
	name := rt.TypeName
	if name == "" {
		return ""
	}
	// TS synthesises internal symbol names ("\xfeclass", "\xfeobject") for anonymous declarations, all
	// starting with the InternalSymbolName byte 0xFE; no user could pass one to registerClassSerializer.
	if name[0] == 0xFE {
		return ""
	}
	return name
}

// classSerializerLookup returns the local name holding the custom serializer for typeID plus the inline
// refresh statement. Both lookup literals come from the build, never from runtime `cls.name`, so the
// pairing is minification-stable; same-name collisions degrade to exact-id-only in the registry (see
// classSerializerRegistry.ts).
//
// The entry is cached in the CLOSURE and re-looked-up only when the registry epoch moves, so a hot loop
// pays one int compare instead of a Map lookup, yet `registerClassSerializer` / `unregister` / `clear`
// still take effect immediately (they bump `utl.csEpoch()`, so the next guard misses). Shapes:
//
//	closure:  let cs_<id>, cs_<id>_ep = -1
//	per-call: if (cs_<id>_ep !== utl.csEpoch()) { cs_<id> = utl.getClassSerializer('<id>', '<className>'); cs_<id>_ep = utl.csEpoch(); }
func classSerializerLookup(ctx *EmitContext, typeID string, className string) (varName string, decl string) {
	varName = "cs_" + sanitizeIdent(typeID)
	epVar := varName + "_ep"
	ctx.SetContextItem("csvar_"+typeID, "let "+varName+", "+epVar+" = -1")
	decl = "if (" + epVar + " !== utl.csEpoch()) { " + varName + " = utl.getClassSerializer(" + quoteJS(typeID) + ", " + quoteJS(className) + "); " + epVar + " = utl.csEpoch(); }"
	return varName, decl
}

// wrapPrepareWithClassSerializer wraps the structural prepareForJson body (mutate-in-place `pj`) in a
// runtime registry branch:
//
//	if (cs_<id> && cs_<id>.serialize) { v = cs_<id>.serialize(v) } else { <structural> }
//
// Anonymous classes return the structural body unchanged. CodeNS propagates: the registry cannot rescue a
// structurally un-encodable shape, since the fallback IS the structural behaviour.
func wrapPrepareWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	elseBody := structural.Code
	branch := decl + ";if (" + csVar + " && " + csVar + ".serialize) {" + v + " = " + csVar + ".serialize(" + v + ")}"
	if elseBody != "" {
		branch += " else {" + elseBody + "}"
	}
	return RTCode{Code: branch, Type: CodeS}
}

// wrapSafeWithClassSerializer wraps the structural prepareForJsonClone body (the non-mutating `pjs` clone
// family) in a runtime registry branch; the structural emit produces a NEW value (CodeE or CodeRB):
//
//	if (cs_<id> && cs_<id>.serialize) return cs_<id>.serialize(v); <structural-returning-body>
//
// Anonymous classes return the structural body unchanged. CodeNS propagates.
func wrapSafeWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	// Normalise to a self-returning statement so the whole thing is one CodeRB block; an empty clone is
	// the identity, `return v`.
	structuralReturn := structural.Code
	if structural.Type != CodeRB {
		expr := structural.Code
		if expr == "" {
			expr = v
		}
		structuralReturn = "return " + expr
	}
	body := decl + ";if (" + csVar + " && " + csVar + ".serialize) return " + csVar + ".serialize(" + v + "); " + structuralReturn
	return RTCode{Code: body, Type: CodeRB}
}

// wrapStringifyWithClassSerializer wraps the structural stringifyJson body (`sj`, a JSON string fragment)
// in a runtime registry branch:
//
//	if (cs_<id> && cs_<id>.serialize) return JSON.stringify(cs_<id>.serialize(v)); <structural>
//
// Anonymous classes return the structural body unchanged. CodeNS propagates.
func wrapStringifyWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	structuralReturn := structural.Code
	if structural.Type != CodeRB {
		expr := structural.Code
		if expr == "" {
			// Defensive: an object emit always returns at least `'{}'`.
			expr = "JSON.stringify(" + v + ")"
		}
		structuralReturn = "return " + expr
	}
	body := decl + ";if (" + csVar + " && " + csVar + ".serialize) return JSON.stringify(" + csVar + ".serialize(" + v + ")); " + structuralReturn
	return RTCode{Code: body, Type: CodeRB}
}

// wrapRestoreWithClassSerializer wraps the structural restoreFromJsonMutate body (`rj`, rebinds `v`) in a
// runtime registry branch:
//
//	if (cs_<id> && cs_<id>.serialize) { v = utl.deserializeClass(cs_<id>, v, k_<id>) }
//	else { <structural>; if (cs_<id>) v = utl.deserializeClass(cs_<id>, v, k_<id>) }
//
// A custom `serialize` owns the wire shape (possibly not the declared props), so its decode hands the raw
// value straight to deserialize with no structural recurse. Anonymous classes return the structural body
// unchanged. CodeNS propagates.
func wrapRestoreWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	keys := addObjectPropsToContext(rt, ctx).keysName
	custom := v + " = utl.deserializeClass(" + csVar + ", " + v + ", " + keys + ")"
	structuralThenRebuild := structural.Code
	if structuralThenRebuild != "" {
		structuralThenRebuild += ";"
	}
	structuralThenRebuild += "if (" + csVar + ") " + custom
	branch := decl + ";if (" + csVar + " && " + csVar + ".serialize) {" + custom + "} else {" + structuralThenRebuild + "}"
	return RTCode{Code: branch, Type: CodeS}
}

// wrapToBinaryWithClassSerializer wraps the structural toBinary body (`tb`, writes bytes to `ser`) in a
// runtime registry branch:
//
//	if (cs_<id> && cs_<id>.serialize) { Ser.serString(JSON.stringify(cs_<id>.serialize(v))) }
//	else { <structural> }
//
// That string wire shape (length prefix + utf8 bytes) is exactly what the `fb` side decodes. Anonymous
// classes return structural unchanged. CodeNS propagates.
func wrapToBinaryWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v, ser string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	registered := ser + ".serString(JSON.stringify(" + csVar + ".serialize(" + v + ")))"
	branch := decl + ";if (" + csVar + " && " + csVar + ".serialize) {" + registered + "}"
	if structural.Code != "" {
		branch += " else {" + structural.Code + "}"
	}
	return RTCode{Code: branch, Type: CodeS}
}

// wrapFromBinaryWithClassSerializer wraps the structural fromBinary body (`fb`, assigns to `ret`) in a
// runtime registry branch, byte-symmetric with wrapToBinaryWithClassSerializer:
//
//	if (cs_<id> && cs_<id>.serialize) { ret = utl.deserializeClass(cs_<id>, JSON.parse(Des.desString()), k_<id>) }
//	else { <structural>; if (cs_<id>) ret = utl.deserializeClass(cs_<id>, ret, k_<id>) }
//
// Anonymous classes return structural unchanged. CodeNS propagates.
func wrapFromBinaryWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, ret, des string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	keys := addObjectPropsToContext(rt, ctx).keysName
	custom := ret + " = utl.deserializeClass(" + csVar + ", JSON.parse(" + des + ".desString()), " + keys + ")"
	structuralThenRebuild := structural.Code
	if structuralThenRebuild != "" {
		structuralThenRebuild += ";"
	}
	structuralThenRebuild += "if (" + csVar + ") " + ret + " = utl.deserializeClass(" + csVar + ", " + ret + ", " + keys + ")"
	branch := decl + ";if (" + csVar + " && " + csVar + ".serialize) {" + custom + "} else {" + structuralThenRebuild + "}"
	return RTCode{Code: branch, Type: CodeS}
}

// sanitizeIdent maps an arbitrary name to a JS-identifier-safe token for a generated local variable,
// collapsing non-identifier characters to "_" so an odd class name cannot produce invalid JS.
func sanitizeIdent(name string) string {
	out := make([]byte, 0, len(name))
	for i := 0; i < len(name); i++ {
		c := name[i]
		isAlpha := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '$'
		isDigit := c >= '0' && c <= '9'
		if isAlpha || (isDigit && i > 0) {
			out = append(out, c)
		} else {
			out = append(out, '_')
		}
	}
	if len(out) == 0 {
		return "_"
	}
	return string(out)
}
