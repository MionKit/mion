package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Custom class-serializer plumbing shared by the JSON + binary emitter
// families. A plain user class (KindClass + SubKindNone) may have a
// serializer registered at runtime via `registerClassSerializer(cls,
// handler?)`; the emitted factory looks the entry up through
// `utl.getClassSerializer(<rt.ID>, <rt.TypeName>)` — exact instantiation id
// first, class name as the fallback key — and, when present, rebuilds a real
// instance on decode (and optionally re-shapes the encode), falling back to
// the structural object emit otherwise. Generics are erased at runtime (one
// class object serves every instantiation), so the name fallback is what lets
// a single registration cover every `RpcError<…>` the program uses; both
// literals are build-time strings, so the pairing is minification-stable.
//
// Both handler halves are OPTIONAL, which shapes the emitted branches:
//   - Encode routes through `entry.serialize` ONLY when it is present
//     (`if (cs_<name> && cs_<name>.serialize)`); a registered class with no
//     custom `serialize` encodes structurally, identical to an unregistered
//     one — so the encode wire shape is the same and decode can recurse it.
//   - Decode always rebuilds through `utl.deserializeClass(cs_<name>, data,
//     k_<id>)`, which prefers `entry.deserialize` and otherwise auto-instantiates
//     a zero-arg class and sets the DECLARED properties (`k_<id>`, the hoisted
//     name list the unknown-keys families share) from the decoded data,
//     surfacing CLS002 when the bare `new cls()` throws. The rebuild is driven
//     by the type, never by the keys on the wire, so an undeclared key (an own
//     `__proto__` included) never lands on the instance.
//   - A registered class WITHOUT a custom `serialize` still runs the
//     structural decode first (to recurse into nested props) and only then
//     reconstructs the instance; a registered class WITH a custom `serialize`
//     owns its wire shape, so decode hands the raw decoded value straight to
//     `deserializeClass` with no structural recurse.
//
// `userClassName(rt)` (= `rt.TypeName`, empty for anonymous classes) is used
// only as the ROUTABILITY GATE and the CLS001 warning text, NOT as the registry
// key. Anonymous classes (TS gives them an internal symbol name beginning with
// the 0xFE InternalSymbolName prefix, e.g. "\xfeclass") carry no stable
// user-facing name, can't be passed to registerClassSerializer, and so are never
// routed through the registry and never warned about — structural-only.
//
// Builtins (Date / Map / Set / RegExp / nonSerializable) are NOT handled
// here: each emitter dispatches those on SubKind before reaching the
// SubKindNone arm, so this helper only ever sees plain user classes.
//
// See the T7 design notes for the locked contract.

// userClassName returns the user-facing class name for a plain user class
// RunType, or "" when the class is anonymous (no stable name to key the
// registry on). The empty-string result signals callers to emit the
// structural shape with no registry branch and no warning.
func userClassName(rt *reflection.RunType) string {
	if rt == nil {
		return ""
	}
	name := rt.TypeName
	if name == "" {
		return ""
	}
	// TS synthesises internal symbol names (e.g. "\xfeclass",
	// "\xfeobject") for anonymous declarations; they all start with the
	// InternalSymbolName prefix byte 0xFE. Such a name isn't something a
	// user could pass to registerClassSerializer, so treat it as
	// anonymous.
	if name[0] == 0xFE {
		return ""
	}
	return name
}

// classSerializerLookup returns the local name holding the custom serializer for
// the class with structural id typeID PLUS the inline refresh statement that
// keeps it current. The lookup carries TWO build-time literals: the TYPE ID (the
// exact instantiation — matches a registration keyed by the same id) and the
// CLASS NAME (`rt.TypeName`), the runtime's fallback key. Generics are erased at
// runtime — every instantiation of `RpcError<…>` is the SAME class object — so
// one `registerClassSerializer(RpcError, …)` must cover every instantiation the
// program uses; the name is what all those per-instantiation ids share. Both
// literals come from the build (never from runtime `cls.name`), so the pairing
// is minification-stable; same-name collisions degrade to exact-id-only in the
// registry (see classSerializerRegistry.ts).
//
// The entry is cached in the CLOSURE (a `let cs_<id>, cs_<id>_ep` context item)
// and re-looked-up only when the registry epoch moves — so a hot (de)serialize
// loop pays one int compare per call instead of a Map lookup, yet
// `registerClassSerializer` / `unregister` / `clear` still take effect
// immediately (they bump `utl.csEpoch()`, so the next call's guard misses and
// re-reads). Shapes:
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

// emitClassSerializerWarning surfaces the build-time CLS001 Warning telling
// the user the named class is serialized structurally and that they can
// register a custom serializer. Deduped by code per walk (one warning per
// compilation). No-op for anonymous classes (className == "").
func emitClassSerializerWarning(className string, ctx *EmitContext) {
	if className == "" {
		return
	}
	ctx.walker.EmitDiagnostic(diagnostics.CodeCLSStructuralFallback, className)
}

// wrapPrepareWithClassSerializer wraps the structural prepareForJson body
// (the mutate-in-place `pj` family) of a plain user class in a runtime
// registry branch:
//
//	if (cs_<name>) { v = cs_<name>.serialize(v) } else { <structural> }
//
// Anonymous classes (className == "") skip the registry entirely and return
// the structural body unchanged with no warning. Named classes emit the
// CLS001 advisory. Propagates CodeNS unchanged (an unsupported descendant
// short-circuits the whole entry — the registry can't rescue a structurally
// un-encodable shape, matching the locked contract that the fallback is the
// *existing* structural behaviour).
func wrapPrepareWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	elseBody := structural.Code
	branch := decl + ";if (" + csVar + " && " + csVar + ".serialize) {" + v + " = " + csVar + ".serialize(" + v + ")}"
	if elseBody != "" {
		branch += " else {" + elseBody + "}"
	}
	return RTCode{Code: branch, Type: CodeS}
}

// wrapSafeWithClassSerializer wraps the structural prepareForJsonSafe
// body (the non-mutating `pjs` clone family) of a plain user class in a
// runtime registry branch. The
// structural emit produces a NEW value (CodeE expression or CodeRB
// self-returning block); the registry branch replaces the cloned value
// with `cs_<name>.serialize(v)`:
//
//	if (cs_<name>) return cs_<name>.serialize(v); <structural-returning-body>
//
// Anonymous classes return the structural body unchanged (no branch, no
// warning). CodeNS propagates unchanged.
func wrapSafeWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	// Normalise the structural value to a self-returning statement so the
	// whole thing is one CodeRB block. CodeRB already returns; CodeE /
	// empty become `return <expr>` (empty clone == identity == `return v`).
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

// wrapStringifyWithClassSerializer wraps the structural stringifyJson body
// (`sj` family — produces a JSON string fragment) of a plain user class in
// a runtime registry branch. Registered → the fragment is
// `JSON.stringify(cs_<name>.serialize(v))`; else the existing structural
// stringify:
//
//	if (cs_<name>) return JSON.stringify(cs_<name>.serialize(v)); <structural>
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
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	structuralReturn := structural.Code
	if structural.Type != CodeRB {
		expr := structural.Code
		if expr == "" {
			// Empty structural fragment never happens for an object emit
			// (it always returns at least `'{}'`), but stay defensive.
			expr = "JSON.stringify(" + v + ")"
		}
		structuralReturn = "return " + expr
	}
	body := decl + ";if (" + csVar + " && " + csVar + ".serialize) return JSON.stringify(" + csVar + ".serialize(" + v + ")); " + structuralReturn
	return RTCode{Code: body, Type: CodeRB}
}

// wrapRestoreWithClassSerializer wraps the structural restoreFromJson body
// (`rj` family — mutates / rebinds `v` to the reconstructed value) of a
// plain user class in a runtime registry branch. Decode always rebuilds a
// real instance through `utl.deserializeClass`; whether it recurses the
// structural body first depends on whether encode used a custom `serialize`:
//
//	if (cs_<name> && cs_<name>.serialize) { v = utl.deserializeClass(cs_<name>, v, k_<id>) }
//	else { <structural>; if (cs_<name>) v = utl.deserializeClass(cs_<name>, v, k_<id>) }
//
// A custom `serialize` owns the wire shape (possibly not the declared props),
// so its decode hands the raw value straight to deserialize with no structural
// recurse. The default structural path decodes the declared props first, then
// reconstructs the instance. Anonymous classes return the structural body
// unchanged. CodeNS propagates.
func wrapRestoreWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
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

// wrapToBinaryWithClassSerializer wraps the structural toBinary body (`tb`
// family — writes bytes to the serializer `ser`) of a plain user class in a
// runtime registry branch. Registered → JSON-stringify the custom
// serialize() result and write it via the existing string binary-encoder
// (`ser.serString`); else the existing structural binary encode:
//
//	if (cs_<name>) { Ser.serString(JSON.stringify(cs_<name>.serialize(v))) }
//	else { <structural> }
//
// The string wire shape (uint32 length + utf8 bytes) is exactly what the
// `fb` side decodes. Anonymous classes return structural unchanged. CodeNS
// propagates.
func wrapToBinaryWithClassSerializer(rt *reflection.RunType, ctx *EmitContext, v, ser string, structural RTCode) RTCode {
	if structural.Type == CodeNS {
		return structural
	}
	className := userClassName(rt)
	if className == "" {
		return structural
	}
	emitClassSerializerWarning(className, ctx)
	csVar, decl := classSerializerLookup(ctx, rt.ID, className)
	registered := ser + ".serString(JSON.stringify(" + csVar + ".serialize(" + v + ")))"
	branch := decl + ";if (" + csVar + " && " + csVar + ".serialize) {" + registered + "}"
	if structural.Code != "" {
		branch += " else {" + structural.Code + "}"
	}
	return RTCode{Code: branch, Type: CodeS}
}

// wrapFromBinaryWithClassSerializer wraps the structural fromBinary body
// (`fb` family — assigns the decoded value to `ret`) of a plain user class
// in a runtime registry branch. Byte-symmetric with
// wrapToBinaryWithClassSerializer: a custom `serialize` wrote a JSON string
// frame, so decode reads it back and rebuilds; the default structural path
// wrote structural bytes, so decode reads those first and then reconstructs
// the instance:
//
//	if (cs_<name> && cs_<name>.serialize) { ret = utl.deserializeClass(cs_<name>, JSON.parse(Des.desString()), k_<id>) }
//	else { <structural>; if (cs_<name>) ret = utl.deserializeClass(cs_<name>, ret, k_<id>) }
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
	emitClassSerializerWarning(className, ctx)
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

// sanitizeIdent maps an arbitrary class name to a JS-identifier-safe token
// for use in a generated local variable name. Non-identifier characters
// collapse to "_". Class names are almost always plain identifiers, but a
// declaration-merged / weird-cased name shouldn't produce invalid JS.
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
