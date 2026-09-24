package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// FamilySpec is one type-walking cache family: its constants.CacheModules key (== the wire CacheKind
// string), its settings and its emitter. Adding a family is one emitter file plus one row in Families.
type FamilySpec struct {
	Key      string
	Settings constants.CacheModuleSettings
	Emitter  Emitter
}

// family builds one registry row, binding Settings to the CacheModules key.
func family(key string, emitter Emitter) FamilySpec {
	return FamilySpec{Key: key, Settings: constants.CacheModules[key], Emitter: emitter}
}

// Families lists every type-walking cache family. Cross-family `val_<member>` edges travel on each entry's
// module deps and the resolver's fixpoint renders the foreign entries they name, so collection order does not
// affect what is rendered. It does fix the order diagnostics come out in (see resolver.collectFamilies).
var Families = []FamilySpec{
	family("validationErrors", ValidationErrorsEmitter{}),
	// The mutating JSON round-trip pair: `restoreFromJsonMutate(JSON.parse(JSON.stringify(prepareForJson(v))))`
	// must deep-equal v. Unions emit the flat wire shape (see union_flat.go).
	family("prepareForJsonMutate", PrepareForJsonEmitter{}),
	family("restoreFromJsonMutate", RestoreFromJsonEmitter{}),
	// The non-mutating prepareForJson sibling: strips undeclared properties and returns a new value.
	family("prepareForJsonClone", PrepareForJsonCloneEmitter{}),
	// The DECODE mirror of prepareForJsonClone: rebuilds each object from the declared shape, so an undeclared
	// key on the wire is gone rather than blanked. See json_restore_clone.go.
	family("restoreFromJsonClone", RestoreFromJsonCloneEmitter{}),
	// The `compact` strategy's round-trip pair: declared object props as a positional array, no key names.
	// Non-mutating clone on encode, keyed-object rebuild on decode. See json_compact.go / json_compact_restore.go.
	family("compactForJson", CompactForJsonEmitter{}),
	family("compactFromJson", CompactFromJsonEmitter{}),
	// No public mutating strip: removeUnknownKeys is 3-24x faster and avoids the delete-induced dictionary-mode deopt.
	// A deep clone of the DECLARED shape: unknown keys dropped by construction, nothing mutable shared with
	// the input (only immutables and opaque handles pass through).
	family("removeUnknownKeys", RemoveUnknownKeysEmitter{}),
	// DataViewSerializer (little-endian) round-trip pair; unions emit the flat-prop wire shape (union_flat_binary.go).
	family("toBinary", ToBinaryEmitter{}),
	family("fromBinary", FromBinaryEmitter{}),
	// The value-transform family behind createFormatTransformFn<T>.
	family("formatTransform", FormatTransformEmitter{}),
	// The per-type JSON Schema document (json_schema_doc.go): renders inline at the root, no cross-entry deps.
	family("jsonSchema", JsonSchemaDocEmitter{}),
	// registerClassSerializer's build-time class-name card (class_serializer_reg.go): inline at the root, no deps.
	family("classSerializerReg", ClassSerializerRegEmitter{}),
	// The fused validators (`{checkUnknowns: true}`): validate / validationErrors bodies plus the unknown-key
	// check at every object-ish node, so one walk answers "valid AND free of undeclared keys" (validate_strict.go).
	// Placed BEFORE validate: the registry's last row must stay `validate`.
	family("validateStrict", ValidateStrictEmitter{}),
	family("validationErrorsStrict", ValidationErrorsStrictEmitter{}),
	// The union-scoped validators (`{checkUnionUnknowns: true}`): plain bodies plus a key check on union member arms only.
	family("validateUnionKeys", ValidateUnionKeysEmitter{}),
	family("validationErrorsUnionKeys", ValidationErrorsUnionKeysEmitter{}),
	family("validate", ValidateEmitter{}),
}

var familiesByKey = func() map[string]FamilySpec {
	byKey := make(map[string]FamilySpec, len(Families))
	for _, spec := range Families {
		byKey[spec.Key] = spec
	}
	return byKey
}()

// FamilyByKey returns the registered family for a CacheModules key, panicking on an unknown one:
// resolver wiring is static, so a typo dies at process init.
func FamilyByKey(key string) FamilySpec {
	spec, ok := familiesByKey[key]
	if !ok {
		panic("typefns: unknown cache family key: " + key)
	}
	return spec
}

// Collect compiles the family's demanded entries into per-entry virtual-module records. extraRoots seed
// (type-id, variant) roots beyond the family's own call-site demand, the resolver's cross-family fixpoint path.
func (spec FamilySpec) Collect(dump protocol.Dump, opts RenderOpts, extraRoots []ExtraRoot) entrymodules.Graph {
	return CollectFamilyEntries(dump, spec.Settings, spec.Emitter, innerPrefix(spec.Settings), opts, extraRoots)
}
