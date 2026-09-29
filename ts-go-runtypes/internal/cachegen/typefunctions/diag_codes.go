package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// rootCodeMap maps an unsupported root leaf kind to one family's root-error code. A kind left "" falls back
// to the renderer's silent skip, so an unknown future kind raises no diagnostic without a registered code.
type rootCodeMap struct {
	never           string // KindNever
	nonSerializable string // KindPromise + KindRegexp + KindClass.SubKindNonSerializable
	function        string // KindFunction / KindMethod / KindMethodSignature / KindCallSignature
	symbol          string // KindSymbol
}

func (m rootCodeMap) codeFor(leaf *reflection.RunType) string {
	if leaf == nil {
		return ""
	}
	switch leaf.Kind {
	case reflection.KindNever:
		return m.never
	case reflection.KindPromise, reflection.KindRegexp:
		return m.nonSerializable
	case reflection.KindFunction,
		reflection.KindMethod,
		reflection.KindMethodSignature,
		reflection.KindCallSignature:
		return m.function
	case reflection.KindSymbol:
		return m.symbol
	case reflection.KindLiteral:
		// A symbol-flavored literal is refused like the bare kind, so it takes the same root code.
		for _, flag := range leaf.Flags {
			if flag == "symbol" {
				return m.symbol
			}
		}
	case reflection.KindClass:
		if leaf.SubKind == reflection.SubKindNonSerializable {
			return m.nonSerializable
		}
	}
	return ""
}

// Per-emitter DiagCodeFor implementations, one flat slot-to-code map each, concentrated in this file so
// adding a family or a slot is one edit per emitter rather than a hunt across the emit files.

var prepareForJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodePJNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodePJNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodePJFunctionRoot,
	SlotFunctionPropDropped:        diagnostics.CodePJFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodePJMethodDropped,
	SlotStaticDropped:              diagnostics.CodePJStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodePJSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodePJUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodePJNonSerializablePropDrop,
	SlotUnsafeNamePropDropped:      diagnostics.CodeUnsafePropertyName,
}

func (PrepareForJsonEmitter) DiagCodeFor(slot DiagSlot) string { return prepareForJsonCodes[slot] }

var prepareForJsonRootCodes = rootCodeMap{
	never:           diagnostics.CodePJNeverRoot,
	nonSerializable: diagnostics.CodePJNonSerializableRoot,
	function:        diagnostics.CodePJFunctionRoot,
	symbol:          diagnostics.CodePJSymbolRoot,
}

func (PrepareForJsonEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	return prepareForJsonRootCodes.codeFor(leaf)
}

var prepareForJsonCloneCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodePJSNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodePJSNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodePJSFunctionRoot,
	SlotFunctionPropDropped:        diagnostics.CodePJSFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodePJSMethodDropped,
	SlotStaticDropped:              diagnostics.CodePJSStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodePJSSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodePJSUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodePJSNonSerializablePropDrop,
	SlotUnsafeNamePropDropped:      diagnostics.CodeUnsafePropertyName,
}

func (PrepareForJsonCloneEmitter) DiagCodeFor(slot DiagSlot) string {
	return prepareForJsonCloneCodes[slot]
}

var prepareForJsonCloneRootCodes = rootCodeMap{
	never:           diagnostics.CodePJSNeverRoot,
	nonSerializable: diagnostics.CodePJSNonSerializableRoot,
	function:        diagnostics.CodePJSFunctionRoot,
	symbol:          diagnostics.CodePJSSymbolRoot,
}

func (PrepareForJsonCloneEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	return prepareForJsonCloneRootCodes.codeFor(leaf)
}

var restoreFromJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeRJNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeRJNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeRJFunctionRoot,
	SlotFunctionPropDropped:        diagnostics.CodeRJFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeRJMethodDropped,
	SlotStaticDropped:              diagnostics.CodeRJStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeRJSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeRJUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeRJNonSerializablePropDrop,
	SlotUnsafeNamePropDropped:      diagnostics.CodeUnsafePropertyName,
}

func (RestoreFromJsonEmitter) DiagCodeFor(slot DiagSlot) string { return restoreFromJsonCodes[slot] }

var restoreFromJsonRootCodes = rootCodeMap{
	never:           diagnostics.CodeRJNeverRoot,
	nonSerializable: diagnostics.CodeRJNonSerializableRoot,
	function:        diagnostics.CodeRJFunctionRoot,
	symbol:          diagnostics.CodeRJSymbolRoot,
}

func (RestoreFromJsonEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	return restoreFromJsonRootCodes.codeFor(leaf)
}

// The `compact` walks reuse prepareForJsonClone / restoreFromJsonMutate arm by arm, so they delegate their
// diagnostic codes the same way: cj → pjs, cjr → rj. Without these the compact emitters implement neither
// provider, and an unserializable leaf at a PROPAGATING position (tuple slot, array element, record value,
// callable object) would SILENTLY SKIP the primitive entry instead of rendering an alwaysThrow, leaving the
// compact composite binding a never-rendered primitive (JCP001). The wording carries over unchanged, the
// reason being wire-shape independent: "Type `Function` can never be encoded to JSON" holds for compact too.
func (CompactForJsonEmitter) DiagCodeFor(slot DiagSlot) string {
	return prepareForJsonCloneCodes[slot]
}

func (CompactForJsonEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	return prepareForJsonCloneRootCodes.codeFor(leaf)
}

func (CompactFromJsonEmitter) DiagCodeFor(slot DiagSlot) string {
	return restoreFromJsonCodes[slot]
}

func (CompactFromJsonEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	return restoreFromJsonRootCodes.codeFor(leaf)
}

// restoreFromJsonClone changes no leaf's serializability, a rebuild or a guard around one of
// restoreFromJsonMutate's arms never making a leaf unserializable, so it delegates like compactFromJson.
func (RestoreFromJsonCloneEmitter) DiagCodeFor(slot DiagSlot) string {
	return restoreFromJsonCodes[slot]
}

func (RestoreFromJsonCloneEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	return restoreFromJsonRootCodes.codeFor(leaf)
}

var validateCodes = map[DiagSlot]string{
	SlotNonSerializableRoot:        diagnostics.CodeVLNonSerializableRoot,
	SlotFunctionPropDropped:        diagnostics.CodeVLFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeVLMethodDropped,
	SlotStaticDropped:              diagnostics.CodeVLStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeVLSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeVLUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeVLNonSerializablePropDrop,
	SlotUnsafeNamePropDropped:      diagnostics.CodeUnsafePropertyName,
	SlotRootAnyUnknown:             diagnostics.CodeVLRootAnyUnknown,
}

func (ValidateEmitter) DiagCodeFor(slot DiagSlot) string { return validateCodes[slot] }

var validateRootCodes = rootCodeMap{
	never:           "", // validate has its own never arm, "no inhabitants", so it is not unsupported
	nonSerializable: diagnostics.CodeVLNonSerializableRoot,
	function:        diagnostics.CodeVLFunctionRoot,
	symbol:          diagnostics.CodeVLSymbolRoot,
}

func (ValidateEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	return validateRootCodes.codeFor(leaf)
}

var validationErrorsCodes = map[DiagSlot]string{
	SlotNonSerializableRoot:        diagnostics.CodeVENonSerializableRoot,
	SlotFunctionPropDropped:        diagnostics.CodeVEFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeVEMethodDropped,
	SlotStaticDropped:              diagnostics.CodeVEStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeVESymbolKeyedDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeVENonSerializablePropDrop,
	SlotUnsafeNamePropDropped:      diagnostics.CodeUnsafePropertyName,
	SlotRootAnyUnknown:             diagnostics.CodeVERootAnyUnknown,
}

func (ValidationErrorsEmitter) DiagCodeFor(slot DiagSlot) string { return validationErrorsCodes[slot] }

var validationErrorsRootCodes = rootCodeMap{
	never:           "",
	nonSerializable: diagnostics.CodeVENonSerializableRoot,
	function:        diagnostics.CodeVEFunctionRoot,
	symbol:          diagnostics.CodeVESymbolRoot,
}

func (ValidationErrorsEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	return validationErrorsRootCodes.codeFor(leaf)
}

var removeUnknownKeysCodes = map[DiagSlot]string{
	SlotFunctionPropDropped:        diagnostics.CodeRUKFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeRUKMethodDropped,
	SlotStaticDropped:              diagnostics.CodeRUKStaticDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeRUKNonSerializablePropDrop,
	SlotUnsafeNamePropDropped:      diagnostics.CodeUnsafePropertyName,
}

// DiagCodeFor: under `sharedValues: 'share'` both sharing slots become the quiet RUK016, since the caller asked for it.
func (emitter RemoveUnknownKeysEmitter) DiagCodeFor(slot DiagSlot) string {
	if emitter.shared == sharedValuesShare && (slot == SlotFunctionPropDropped || slot == SlotNonSerializablePropDropped) {
		return diagnostics.CodeRUKSharedAsAsked
	}
	return removeUnknownKeysCodes[slot]
}

// DiagCodeForLeaf names why the entry always throws, from the leaf refuseWith latched (or the walker's own).
func (emitter RemoveUnknownKeysEmitter) DiagCodeForLeaf(leaf *reflection.RunType) string {
	if leaf == nil {
		return ""
	}
	switch {
	case leaf.Kind == reflection.KindUnion:
		return diagnostics.CodeRUKUnionRoot
	case leaf.Kind == reflection.KindClass && hasFlag(leaf.Flags, reflection.FlagPrivateFields):
		return diagnostics.CodeRUKPrivateFields
	case reflection.IsSymbolKeyedName(leaf.Name):
		return diagnostics.CodeRUKSymbolKeyedMember
	case emitter.shared == sharedValuesRefuse:
		return diagnostics.CodeRUKSharedRefused
	}
	return ""
}

// DiagLabelForLeaf is the always-throw message argument: the member or class the refusal is about.
func (RemoveUnknownKeysEmitter) DiagLabelForLeaf(leaf *reflection.RunType) string {
	if leaf == nil {
		return ""
	}
	if leaf.Kind == reflection.KindIndexSignature {
		return "index signature values"
	}
	if leaf.Name != "" {
		return propertyWhere(leaf)
	}
	if leaf.Kind == reflection.KindClass && leaf.TypeName != "" {
		return "class `" + leaf.TypeName + "`"
	}
	return "`" + strippedMemberLabel(leaf) + "`"
}
