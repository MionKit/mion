package typefunctions

import (
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// leafKindToRootCode maps an unsupported root leaf kind to a per-family
// root-error code via the supplied family-specific map. Returns "" for
// kinds not in the map — the renderer falls back to silent skip (no
// alwaysThrow factory) so unknown future kinds don't surface diagnostics
// without a registered code.
type rootCodeMap struct {
	never           string // KindNever
	nonSerializable string // KindPromise + KindClass.SubKindNonSerializable
	function        string // KindFunction / KindMethod / KindMethodSignature / KindCallSignature
	symbol          string // KindSymbol — see docs FAQ for why this is unsupported
}

func (m rootCodeMap) codeFor(leaf *protocol.RunType) string {
	if leaf == nil {
		return ""
	}
	switch leaf.Kind {
	case protocol.KindNever:
		return m.never
	case protocol.KindPromise:
		return m.nonSerializable
	case protocol.KindFunction,
		protocol.KindMethod,
		protocol.KindMethodSignature,
		protocol.KindCallSignature:
		return m.function
	case protocol.KindSymbol:
		return m.symbol
	case protocol.KindLiteral:
		// A symbol-flavored literal under the `noLiterals` ValidateOptions
		// variant degrades to the bare-symbol validator — same misleading
		// shape as plain `createValidateFn<symbol>()`, so we route to the
		// symbol root code and let the alwaysThrow path emit the same
		// diagnostic. See istype.go's emitLiteralBaseKind symbol arm.
		for _, flag := range leaf.Flags {
			if flag == "symbol" {
				return m.symbol
			}
		}
	case protocol.KindClass:
		if leaf.SubKind == protocol.SubKindNonSerializable {
			return m.nonSerializable
		}
	}
	return ""
}

// Per-emitter DiagCodeFor implementations. Each emitter declares a flat
// map from slot to its family's diag code; the shared dispatch helper on
// EmitContext looks the active emitter up via type assertion at throw /
// silent-skip sites. Concentrated in one file so adding a new family
// (or a new slot) is one edit per emitter, not a hunt-and-peck across
// the emit files.

var prepareForJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodePJNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodePJNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodePJFunctionRoot,
	SlotArrayElement:               diagnostics.CodePJArrayElement,
	SlotFunctionPropDropped:        diagnostics.CodePJFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodePJMethodDropped,
	SlotStaticDropped:              diagnostics.CodePJStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodePJSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodePJUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodePJNonSerializablePropDrop,
}

func (PrepareForJsonEmitter) DiagCodeFor(slot DiagSlot) string { return prepareForJsonCodes[slot] }

var prepareForJsonRootCodes = rootCodeMap{
	never:           diagnostics.CodePJNeverRoot,
	nonSerializable: diagnostics.CodePJNonSerializableRoot,
	function:        diagnostics.CodePJFunctionRoot,
	symbol:          diagnostics.CodePJSymbolRoot,
}

func (PrepareForJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return prepareForJsonRootCodes.codeFor(leaf)
}

var prepareForJsonSafeCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodePJSNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodePJSNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodePJSFunctionRoot,
	SlotArrayElement:               diagnostics.CodePJSArrayElement,
	SlotFunctionPropDropped:        diagnostics.CodePJSFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodePJSMethodDropped,
	SlotStaticDropped:              diagnostics.CodePJSStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodePJSSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodePJSUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodePJSNonSerializablePropDrop,
}

func (PrepareForJsonSafeEmitter) DiagCodeFor(slot DiagSlot) string {
	return prepareForJsonSafeCodes[slot]
}

var prepareForJsonSafeRootCodes = rootCodeMap{
	never:           diagnostics.CodePJSNeverRoot,
	nonSerializable: diagnostics.CodePJSNonSerializableRoot,
	function:        diagnostics.CodePJSFunctionRoot,
	symbol:          diagnostics.CodePJSSymbolRoot,
}

func (PrepareForJsonSafeEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return prepareForJsonSafeRootCodes.codeFor(leaf)
}

var restoreFromJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeRJNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeRJNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeRJFunctionRoot,
	SlotArrayElement:               diagnostics.CodeRJArrayElement,
	SlotFunctionPropDropped:        diagnostics.CodeRJFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeRJMethodDropped,
	SlotStaticDropped:              diagnostics.CodeRJStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeRJSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeRJUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeRJNonSerializablePropDrop,
}

func (RestoreFromJsonEmitter) DiagCodeFor(slot DiagSlot) string { return restoreFromJsonCodes[slot] }

var restoreFromJsonRootCodes = rootCodeMap{
	never:           diagnostics.CodeRJNeverRoot,
	nonSerializable: diagnostics.CodeRJNonSerializableRoot,
	function:        diagnostics.CodeRJFunctionRoot,
	symbol:          diagnostics.CodeRJSymbolRoot,
}

func (RestoreFromJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return restoreFromJsonRootCodes.codeFor(leaf)
}

// The `compact` strategy's encode/decode walks REUSE prepareForJsonSafe /
// restoreFromJson arm-by-arm (only the object arm diverges to a positional
// array — see json_compact.go / json_compact_restore.go), so they DELEGATE
// their diagnostic codes the same way: cj → pjs, cjr → rj. Without these the
// compact emitters implement neither DiagCodeProvider nor LeafDiagCodeProvider,
// and an unserializable leaf (function / symbol / …) at a PROPAGATING position
// (tuple slot, array element, record value, callable object) would SILENTLY
// SKIP the primitive entry (empty argsText) instead of rendering an alwaysThrow
// like every sibling strategy — leaving the compact composite binding a
// never-rendered primitive (JCP001). The unserializable-leaf reason is
// wire-shape-independent ("Type `Function` can never be encoded to JSON" holds for compact
// too), so the shared PJS*/RJ* wording is exactly right — compact now matches
// clone (PJS003) and preserve/strip (RJ003) byte-for-byte.
func (CompactForJsonEmitter) DiagCodeFor(slot DiagSlot) string {
	return prepareForJsonSafeCodes[slot]
}

func (CompactForJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return prepareForJsonSafeRootCodes.codeFor(leaf)
}

func (CompactFromJsonEmitter) DiagCodeFor(slot DiagSlot) string {
	return restoreFromJsonCodes[slot]
}

func (CompactFromJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return restoreFromJsonRootCodes.codeFor(leaf)
}

var stringifyJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeSJNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeSJNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeSJFunctionRoot,
	SlotArrayElement:               diagnostics.CodeSJArrayElement,
	SlotFunctionPropDropped:        diagnostics.CodeSJFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeSJMethodDropped,
	SlotStaticDropped:              diagnostics.CodeSJStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeSJSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeSJUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeSJNonSerializablePropDrop,
}

func (StringifyJsonEmitter) DiagCodeFor(slot DiagSlot) string { return stringifyJsonCodes[slot] }

var stringifyJsonRootCodes = rootCodeMap{
	never:           diagnostics.CodeSJNeverRoot,
	nonSerializable: diagnostics.CodeSJNonSerializableRoot,
	function:        diagnostics.CodeSJFunctionRoot,
	symbol:          diagnostics.CodeSJSymbolRoot,
}

func (StringifyJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return stringifyJsonRootCodes.codeFor(leaf)
}

var toBinaryCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeTBNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeTBNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeTBFunctionRoot,
	SlotArrayElement:               diagnostics.CodeTBArrayElement,
	SlotNonSerializableElem:        diagnostics.CodeTBNonSerializableElem,
	SlotFunctionPropDropped:        diagnostics.CodeTBFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeTBMethodDropped,
	SlotStaticDropped:              diagnostics.CodeTBStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeTBSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeTBUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeTBNonSerializablePropDrop,
}

func (ToBinaryEmitter) DiagCodeFor(slot DiagSlot) string { return toBinaryCodes[slot] }

var toBinaryRootCodes = rootCodeMap{
	never:           diagnostics.CodeTBNeverRoot,
	nonSerializable: diagnostics.CodeTBNonSerializableRoot,
	function:        diagnostics.CodeTBFunctionRoot,
	symbol:          diagnostics.CodeTBSymbolRoot,
}

func (ToBinaryEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return toBinaryRootCodes.codeFor(leaf)
}

var fromBinaryCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeFBNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeFBNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeFBFunctionRoot,
	SlotArrayElement:               diagnostics.CodeFBArrayElement,
	SlotNonSerializableElem:        diagnostics.CodeFBNonSerializableElem,
	SlotFunctionPropDropped:        diagnostics.CodeFBFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeFBMethodDropped,
	SlotStaticDropped:              diagnostics.CodeFBStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeFBSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeFBUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeFBNonSerializablePropDrop,
}

func (FromBinaryEmitter) DiagCodeFor(slot DiagSlot) string { return fromBinaryCodes[slot] }

var fromBinaryRootCodes = rootCodeMap{
	never:           diagnostics.CodeFBNeverRoot,
	nonSerializable: diagnostics.CodeFBNonSerializableRoot,
	function:        diagnostics.CodeFBFunctionRoot,
	symbol:          diagnostics.CodeFBSymbolRoot,
}

func (FromBinaryEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return fromBinaryRootCodes.codeFor(leaf)
}

var validateCodes = map[DiagSlot]string{
	SlotNonSerializableRoot:        diagnostics.CodeVLNonSerializableRoot,
	SlotFunctionPropDropped:        diagnostics.CodeVLFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeVLMethodDropped,
	SlotStaticDropped:              diagnostics.CodeVLStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeVLSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeVLUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeVLNonSerializablePropDrop,
	SlotRootAnyUnknown:             diagnostics.CodeVLRootAnyUnknown,
}

func (ValidateEmitter) DiagCodeFor(slot DiagSlot) string { return validateCodes[slot] }

var validateRootCodes = rootCodeMap{
	never:           "", // validate validates Never as "no inhabitants" — handled by existing never arm, not unsupported
	nonSerializable: diagnostics.CodeVLNonSerializableRoot,
	function:        "", // validate validates function-kinds as `typeof === 'function'` — supported
	symbol:          diagnostics.CodeVLSymbolRoot,
}

func (ValidateEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return validateRootCodes.codeFor(leaf)
}

var validationErrorsCodes = map[DiagSlot]string{
	SlotNonSerializableRoot:        diagnostics.CodeVENonSerializableRoot,
	SlotFunctionPropDropped:        diagnostics.CodeVEFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeVEMethodDropped,
	SlotStaticDropped:              diagnostics.CodeVEStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeVESymbolKeyedDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeVENonSerializablePropDrop,
	SlotRootAnyUnknown:             diagnostics.CodeVERootAnyUnknown,
}

func (ValidationErrorsEmitter) DiagCodeFor(slot DiagSlot) string { return validationErrorsCodes[slot] }

var validationErrorsRootCodes = rootCodeMap{
	never:           "",
	nonSerializable: diagnostics.CodeVENonSerializableRoot,
	function:        "",
	symbol:          diagnostics.CodeVESymbolRoot,
}

func (ValidationErrorsEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return validationErrorsRootCodes.codeFor(leaf)
}

var hasUnknownKeysCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeHUKFunctionPropDropped,
}

func (HasUnknownKeysEmitter) DiagCodeFor(slot DiagSlot) string { return hasUnknownKeysCodes[slot] }

var cloneExactShapeCodes = map[DiagSlot]string{
	SlotFunctionPropDropped:        diagnostics.CodeCESFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeCESMethodDropped,
	SlotStaticDropped:              diagnostics.CodeCESStaticDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeCESNonSerializablePropDrop,
}

func (CloneExactShapeEmitter) DiagCodeFor(slot DiagSlot) string { return cloneExactShapeCodes[slot] }

// DiagCodeForLeaf — root/propagating unsupported kinds. Two ces-specific
// arms beyond the shared rootCodeMap treatment: a UNION with object members
// (no runtime arm discrimination in v1 — a clone that silently kept unknown
// keys would be a security bug, so the build fails instead), and callable
// interfaces routed through the function code by callableLeafSubstitute.
func (CloneExactShapeEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	if leaf != nil && leaf.Kind == protocol.KindUnion {
		return diagnostics.CodeCESUnionRoot
	}
	return cloneExactShapeRootCodes.codeFor(leaf)
}

var cloneExactShapeRootCodes = rootCodeMap{
	never:           "", // never is a noop arm (unknown-keys family parity)
	nonSerializable: "", // shared by reference — nothing key-tracked to strip
	function:        diagnostics.CodeCESFunctionRoot,
	symbol:          "", // symbols pass through by reference
}

var unknownKeyErrorsCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeUKEFunctionPropDropped,
}

func (UnknownKeyErrorsEmitter) DiagCodeFor(slot DiagSlot) string { return unknownKeyErrorsCodes[slot] }

var unknownKeysToUndefinedCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeUKUFunctionPropDropped,
}

func (UnknownKeysToUndefinedEmitter) DiagCodeFor(slot DiagSlot) string {
	return unknownKeysToUndefinedCodes[slot]
}

var unknownKeysToUndefinedWireCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeUKWFunctionPropDropped,
}

func (UnknownKeysToUndefinedWireEmitter) DiagCodeFor(slot DiagSlot) string {
	return unknownKeysToUndefinedWireCodes[slot]
}
