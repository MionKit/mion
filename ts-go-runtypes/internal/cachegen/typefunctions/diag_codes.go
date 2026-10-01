package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// rootCodeMap is one family's root-error code per non-data class.
type rootCodeMap map[reflection.NonData]string

func (m rootCodeMap) codeFor(leaf *reflection.RunType, resolve RefResolver) string {
	return m[reflection.NonDataOf(leaf, resolve)]
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
	reflection.NonDataNever:    diagnostics.CodePJNeverRoot,
	reflection.NonDataOpaque:   diagnostics.CodePJNonSerializableRoot,
	reflection.NonDataFunction: diagnostics.CodePJFunctionRoot,
	reflection.NonDataSymbol:   diagnostics.CodePJSymbolRoot,
}

func (PrepareForJsonEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
	return prepareForJsonRootCodes.codeFor(leaf, resolve)
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
	reflection.NonDataNever:    diagnostics.CodePJSNeverRoot,
	reflection.NonDataOpaque:   diagnostics.CodePJSNonSerializableRoot,
	reflection.NonDataFunction: diagnostics.CodePJSFunctionRoot,
	reflection.NonDataSymbol:   diagnostics.CodePJSSymbolRoot,
}

func (PrepareForJsonCloneEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
	return prepareForJsonCloneRootCodes.codeFor(leaf, resolve)
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
	reflection.NonDataNever:    diagnostics.CodeRJNeverRoot,
	reflection.NonDataOpaque:   diagnostics.CodeRJNonSerializableRoot,
	reflection.NonDataFunction: diagnostics.CodeRJFunctionRoot,
	reflection.NonDataSymbol:   diagnostics.CodeRJSymbolRoot,
}

func (RestoreFromJsonEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
	return restoreFromJsonRootCodes.codeFor(leaf, resolve)
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

func (CompactForJsonEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
	return prepareForJsonCloneRootCodes.codeFor(leaf, resolve)
}

func (CompactFromJsonEmitter) DiagCodeFor(slot DiagSlot) string {
	return restoreFromJsonCodes[slot]
}

func (CompactFromJsonEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
	return restoreFromJsonRootCodes.codeFor(leaf, resolve)
}

// restoreFromJsonClone changes no leaf's serializability, a rebuild or a guard around one of
// restoreFromJsonMutate's arms never making a leaf unserializable, so it delegates like compactFromJson.
func (RestoreFromJsonCloneEmitter) DiagCodeFor(slot DiagSlot) string {
	return restoreFromJsonCodes[slot]
}

func (RestoreFromJsonCloneEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
	return restoreFromJsonRootCodes.codeFor(leaf, resolve)
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
	// No NonDataNever: validate has its own never arm ("no inhabitants").
	reflection.NonDataOpaque:   diagnostics.CodeVLNonSerializableRoot,
	reflection.NonDataFunction: diagnostics.CodeVLFunctionRoot,
	reflection.NonDataSymbol:   diagnostics.CodeVLSymbolRoot,
}

func (ValidateEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
	return validateRootCodes.codeFor(leaf, resolve)
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
	reflection.NonDataOpaque:   diagnostics.CodeVENonSerializableRoot,
	reflection.NonDataFunction: diagnostics.CodeVEFunctionRoot,
	reflection.NonDataSymbol:   diagnostics.CodeVESymbolRoot,
}

func (ValidationErrorsEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
	return validationErrorsRootCodes.codeFor(leaf, resolve)
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
func (emitter RemoveUnknownKeysEmitter) DiagCodeForLeaf(leaf *reflection.RunType, resolve RefResolver) string {
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
	return "`" + strippedMemberLabel(leaf, nil) + "`"
}
