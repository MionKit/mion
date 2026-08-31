package typefunctions

import (
	"github.com/mionkit/ts-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// FamilySpec bundles everything one type-walking cache family needs to
// collect its per-entry virtual modules: its constants.CacheModules key
// (== the wire CacheKind string), settings and emitter. Adding a new RT
// function family = one emitter file + one row in Families; the resolver
// wires collection and added-flags off the registry.
type FamilySpec struct {
	Key      string
	Settings constants.CacheModuleSettings
	Emitter  Emitter
}

// family builds one registry row, binding Settings to the CacheModules key.
func family(key string, emitter Emitter) FamilySpec {
	return FamilySpec{Key: key, Settings: constants.CacheModules[key], Emitter: emitter}
}

// Families lists every type-walking cache family. Order is no longer
// load-bearing: cross-family `val_<member>` edges ride each entry's module
// deps and the resolver's cross-family fixpoint renders the foreign entries
// they name, so validate needs no special last-place collection pass.
var Families = []FamilySpec{
	family("validationErrors", ValidationErrorsEmitter{}),
	// prepareForJson / restoreFromJson: the mutating JSON round-trip pair —
	// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))` must
	// deep-equal v. Unions emit the flat wire shape (see union_flat.go).
	family("prepareForJson", PrepareForJsonEmitter{}),
	family("restoreFromJson", RestoreFromJsonEmitter{}),
	// stringifyJson: single-pass serialiser that builds the JSON string
	// directly from the type — never mutates v, strips extras by construction.
	family("stringifyJson", StringifyJsonEmitter{}),
	// prepareForJsonSafe: non-mutating prepareForJson sibling that strips
	// undeclared properties and returns a new value.
	family("prepareForJsonSafe", PrepareForJsonSafeEmitter{}),
	// compactForJson / compactFromJson: the `compact` strategy's positional-tuple
	// round-trip pair — declared object props as a positional array (no key names)
	// instead of a keyed object. Non-mutating clone on encode, keyed-object rebuild
	// on decode. See json_compact.go / json_compact_restore.go.
	family("compactForJson", CompactForJsonEmitter{}),
	family("compactFromJson", CompactFromJsonEmitter{}),
	// The unknown-keys group: boolean probe, error accumulator, and the
	// decoder-internal wire-aware to-undefined variant. The public deleting/
	// undefining mutators (stripUnknownKeys / unknownKeysToUndefined) were
	// removed in favor of cloneExactShape — measured 3–24x faster and free of
	// the delete-induced dictionary-mode deopt; the to-undefined EMITTER stays
	// (unknownkeys_to_undefined.go) because the wire variant delegates to it.
	family("hasUnknownKeys", HasUnknownKeysEmitter{}),
	family("unknownKeyErrors", UnknownKeyErrorsEmitter{}),
	family("unknownKeysToUndefinedWire", UnknownKeysToUndefinedWireEmitter{}),
	// cloneExactShape: a proper deep clone of the DECLARED shape — unknown
	// keys dropped by construction, nothing mutable shared with the input
	// (only immutables and opaque handles pass through). The clone-based
	// replacement for the removed mutating strip family.
	family("cloneExactShape", CloneExactShapeEmitter{}),
	// toBinary / fromBinary: DataViewSerializer (little-endian) round-trip
	// pair; unions emit the flat-prop wire shape (see union_flat_binary.go).
	family("toBinary", ToBinaryEmitter{}),
	family("fromBinary", FromBinaryEmitter{}),
	// formatTransform: the value-transform family (createFormatTransformFn<T>).
	family("formatTransform", FormatTransformEmitter{}),
	// jsonSchema: the per-type JSON Schema document (see json_schema_doc.go);
	// the whole document renders inline at the root — no cross-entry deps.
	family("jsonSchema", JsonSchemaDocEmitter{}),
	// classSerializerReg: registerClassSerializer's build-time class-name card
	// (see class_serializer_reg.go); inline at the root, no cross-entry deps.
	family("classSerializerReg", ClassSerializerRegEmitter{}),
	family("validate", ValidateEmitter{}),
}

var familiesByKey = func() map[string]FamilySpec {
	byKey := make(map[string]FamilySpec, len(Families))
	for _, spec := range Families {
		byKey[spec.Key] = spec
	}
	return byKey
}()

// FamilyByKey returns the registered family for a CacheModules key. Panics on
// an unknown key — resolver wiring is static, so a typo dies at process init.
func FamilyByKey(key string) FamilySpec {
	spec, ok := familiesByKey[key]
	if !ok {
		panic("typefns: unknown cache family key: " + key)
	}
	return spec
}

// Collect compiles the family's demanded entries into per-entry virtual-module
// records (see CollectFamilyEntries). extraRoots seed (type-id, variant) roots
// beyond the family's own call-site demand — the resolver's cross-family
// fixpoint path.
func (spec FamilySpec) Collect(dump protocol.Dump, opts RenderOpts, extraRoots []ExtraRoot) entrymodules.Graph {
	return CollectFamilyEntries(dump, spec.Settings, spec.Emitter, innerPrefix(spec.Settings), opts, extraRoots)
}

// AnySupported reports whether at least one runtype in the slice has a
// supported emit arm in this family (one shallow pass per family — the
// per-dispatch profile the perf pass measured and kept).
func (spec FamilySpec) AnySupported(runTypes []*reflection.RunType) bool {
	for _, runType := range runTypes {
		if spec.Emitter.Supports(runType) {
			return true
		}
	}
	return false
}
