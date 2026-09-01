package typeid

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// OverrideStructuralKey returns a canonical, family-order-independent suffix
// folding a node's `overrideX<T>(pureFn)` registrations into its structural id.
// Shape mirrors FormatAnnotationStructuralKey's `|fmt:…`: one `|cfn:<family>:<hash>`
// segment per overridden family, sorted by family op key so the suffix is
// deterministic regardless of declaration order. `families` maps a public family
// op key ("val", "jsonEncoder", …) to the override's cfn body hash.
//
// Folding the hash into the id is what keeps the cache idempotent: an overridden
// type gets a DISTINCT id from its un-overridden twin, so no `<fnHash>_<typeId>`
// key ever maps to two different bodies across builds, and the override
// propagates to every containing type (a parent composes its children's folded
// ids).
func OverrideStructuralKey(families map[string]string) string {
	if len(families) == 0 {
		return ""
	}
	keys := make([]string, 0, len(families))
	for family := range families {
		keys = append(keys, family)
	}
	sort.Strings(keys)
	var builder strings.Builder
	for _, family := range keys {
		builder.WriteString("|cfn:")
		builder.WriteString(family)
		builder.WriteByte(':')
		builder.WriteString(families[family])
	}
	return builder.String()
}

// overrideSuffix returns the `|cfn:…` suffix for a node whose BASE structural
// key is baseKey, or "" when no override targets it. Empty (nil map) on the
// plain id path.
func (computer *Computer) overrideSuffix(baseKey string) string {
	if len(computer.overrides) == 0 {
		return ""
	}
	families := computer.overrides[baseKey]
	if len(families) == 0 {
		return ""
	}
	return OverrideStructuralKey(families)
}

// OverridesForBaseKey returns the family→cfnHash map an overridden node carries,
// looked up by its BASE structural key. Used by the serialize pass to stamp
// RunType.Overrides onto the projected node. Returns nil when the node is not
// overridden.
func (computer *Computer) OverridesForBaseKey(baseKey string) map[string]string {
	if len(computer.overrides) == 0 {
		return nil
	}
	return computer.overrides[baseKey]
}

// BaseStructuralKey returns tsType's structural key with children's override
// suffixes folded but WITHOUT tsType's OWN suffix — the key the override map is
// keyed by, and the key the serialize pass uses to look up a node's overrides.
// It recomputes via dispatch rather than reading tsType's own cache entry (which
// holds the FINAL, self-folded key, and from which the base cannot be safely
// recovered because a child's `|cfn:` suffix is embedded in this node's base).
// Children it walks ARE served from the cache as their final keys.
//
// Cyclic targets key by the block's PURE canonical emission (suffix-free), and
// an entry container remaps through the alias table's pure spelling — so the
// override fold pass and the stamp pass (both cold BaseStructuralKey walks)
// stay entry-point-independent exactly like the hashed ids. Acyclic keys are
// byte-identical to the pre-canonicalization spelling.
func (computer *Computer) BaseStructuralKey(tsType *checker.Type) string {
	if tsType == nil {
		return strconv.Itoa(int(reflection.KindNever))
	}
	if index := computer.stackIndex(tsType); index >= 0 {
		return computer.cycleRef(tsType, index)
	}
	// Same frame discipline as Compute (all parallel slices); the result is
	// deliberately never cached — the base key omits this node's own override
	// suffix, so a cache entry here would shadow the final key.
	computer.pushFrame(tsType)
	base := computer.dispatch(tsType)
	cacheable, wasTarget, mark := computer.popFrame()
	if !cacheable {
		computer.pending = append(computer.pending, tsType)
		return base
	}
	if wasTarget && !computer.depthExceeded {
		return computer.canonicalizeCluster(tsType, mark, base).pure
	}
	if entry, ok := computer.alias[base]; ok {
		return entry.pure
	}
	return base
}
