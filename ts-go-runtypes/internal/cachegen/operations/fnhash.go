package operations

import (
	"fmt"

	"github.com/mionkit/ts-runtypes/internal/cachegen/hashid"
	"github.com/mionkit/ts-runtypes/internal/constants"
)

// FnHashLen is the fixed character length of every fnHash. The operation set is
// finite and closed, so a short length is safe; mustBeCollisionFree proves it at
// init. If a future operation collides, the build fails — bump this constant.
const FnHashLen = 3

// fnHashSalt namespaces operation hashes away from structural type-id hashes so
// the two never share a value by accident. The `op|` infix is the ONLY thing
// keeping fn-hashes disjoint from structural type-id hashes — NOT the version.
//
// Deliberately version-INDEPENDENT: unlike a type id (serialize.go folds
// constants.Version into every structural hash), an fnHash carries no version.
// Cross-version cache invalidation still holds because every emitted key is the
// composite `<fnHash>_<typeId>` and the typeId half already re-hashes across
// versions (and the on-disk cache lives under a version-folded typeID
// directory). Folding the version in here too would be redundant AND costly for
// consumers: it would make the per-family fn-hash PREFIXES move on every release,
// forcing any consumer that maps `family → prefix` (mion's JIT_FUNCTION_IDS) to
// re-pin those constants on every ts-runtypes bump. Keeping the salt version-free
// makes the prefixes stable, so a consumer pins once and never refreshes again.
func fnHashSalt(canonicalKey string) string {
	return "op|" + canonicalKey
}

// circularCanonicalSuffix is appended to a CircularGuarded operation's canonical
// key when the `rejectCircularRefs` compile option is armed. It is ORTHOGONAL to
// every existing axis (validate options / json strategy / none) — the same
// suffix folds into all four guarded families uniformly, so an armed factory and
// a plain one for the same T hash to distinct entries (pay-for-use, like
// noLiterals). The JS runtime mirror (fnHash.ts / fnHashes.generated.ts) uses the
// token letter "C" for the same fork; the two strings differ but each maps to the
// same hash value via FnHashFor, so they never need to match byte-for-byte.
const circularCanonicalSuffix = "~C"

// Canonical returns the deterministic, property-order-independent hash input for
// an operation + its call-site compile-time args.
//
//   - AxisNone:          the bare Name ("prepareForJson").
//   - AxisValidateOptions: Name + "|" + the canonical ValidateOptions variant suffix
//     ("validate|", "validate|NL", "validate|NLA"). constants.ValidateVariantSuffix
//     emits letters in ValidateOptions DECLARATION order regardless of optionNames
//     order, so {noLiterals,noIsArrayCheck} and {noIsArrayCheck,noLiterals}
//     produce the same key (the sorted-props invariant — see CLAUDE.md / the
//     plan). The type-id side already enforces the same discipline via
//     memberIDs' sort (typeid.go).
//   - AxisJsonStrategy:  Name + "|" + strategy, defaulting an empty strategy to
//     the operation's DefaultStrategy.
//
// When `rejectCircular` is set on a CircularGuarded op, circularCanonicalSuffix
// is appended after the axis key. Any FUTURE axis that canonicalizes a raw object
// literal MUST recursively sort its keys here to preserve order-independence.
func Canonical(op Operation, optionNames []string, strategy string, rejectCircular bool) string {
	key := canonicalAxisKey(op, optionNames, strategy)
	if rejectCircular && op.CircularGuarded {
		key += circularCanonicalSuffix
	}
	return key
}

func canonicalAxisKey(op Operation, optionNames []string, strategy string) string {
	switch op.Axis {
	case AxisValidateOptions:
		return op.Name + "|" + constants.ValidateVariantSuffix(optionNames)
	case AxisHasUnknownKeysOptions:
		return op.Name + "|" + constants.HasUnknownKeysVariantSuffix(optionNames)
	case AxisJsonStrategy:
		if strategy == "" {
			strategy = op.DefaultStrategy
		}
		return op.Name + "|" + strategy
	default:
		return op.Name
	}
}

// FnHash hashes a canonical key (from Canonical) into the opaque, fixed-length
// fnHash baked into emitted cache keys. PURE: same input → same output, no
// stateful dictionary — this value lives in emitted modules and the on-disk
// cache, so it must never depend on per-run insertion order (unlike the type-id
// hashid.Dict, which grows on collision).
func FnHash(canonicalKey string) string {
	return hashid.QuickHash(fnHashSalt(canonicalKey), FnHashLen, "")
}

// FnHashFor is the one-call convenience: Canonical + FnHash for an operation and
// its call-site args. The scanner uses this to compute the injected fnHash and
// the emitter to name entries. `rejectCircular` folds in only for CircularGuarded
// operations (ignored otherwise).
func FnHashFor(op Operation, optionNames []string, strategy string, rejectCircular bool) string {
	return FnHash(Canonical(op, optionNames, strategy, rejectCircular))
}

// PlainHash returns the fnHash of an operation's DEFAULT variant (no options /
// default strategy / no circular guard), looked up by canonical name. Used for
// cross-family references that always target the plain form — e.g. the
// union-discriminator `validate` check (PlainHash("validate")) and a walker's
// own-family InnerPrefix. Panics on an unknown name (a programmer error, caught
// at first call / in tests).
func PlainHash(name string) string {
	op, ok := byName[name]
	if !ok {
		panic(fmt.Sprintf("operations.PlainHash: unknown operation %q", name))
	}
	return FnHashFor(op, nil, "", false)
}

// allCanonicalKeys enumerates every canonical key the registry can produce: each
// AxisNone op once, each AxisValidateOptions op over all ValidateOptions subsets, and
// each AxisJsonStrategy op over all its strategies — and, for every CircularGuarded
// op, the same set again with rejectCircular armed. The collision guard hashes
// this whole set.
func allCanonicalKeys() []string {
	var keys []string
	for _, op := range registry {
		// CircularGuarded ops fork on rejectCircular; enumerate both plain and armed.
		circularVariants := []bool{false}
		if op.CircularGuarded {
			circularVariants = []bool{false, true}
		}
		for _, rejectCircular := range circularVariants {
			switch op.Axis {
			case AxisValidateOptions:
				for _, subset := range optionSubsets(constants.ValidateOptions) {
					keys = append(keys, Canonical(op, subset, "", rejectCircular))
				}
			case AxisHasUnknownKeysOptions:
				for _, subset := range optionSubsets(constants.HasUnknownKeysOptions) {
					keys = append(keys, Canonical(op, subset, "", rejectCircular))
				}
			case AxisJsonStrategy:
				for _, strategy := range op.Strategies {
					keys = append(keys, Canonical(op, nil, strategy, rejectCircular))
				}
			default:
				keys = append(keys, Canonical(op, nil, "", rejectCircular))
			}
		}
	}
	return keys
}

// optionSubsets returns every subset of an option table's names (the power
// set), so the collision guard covers every variant a call site can request.
// Shared by the ValidateOptions and HasUnknownKeysOptions axes.
func optionSubsets(table []constants.ValidateOption) [][]string {
	names := make([]string, 0, len(table))
	for _, opt := range table {
		names = append(names, opt.Name)
	}
	subsets := make([][]string, 0, 1<<len(names))
	for mask := 0; mask < (1 << len(names)); mask++ {
		var subset []string
		for i, name := range names {
			if mask&(1<<i) != 0 {
				subset = append(subset, name)
			}
		}
		subsets = append(subsets, subset)
	}
	return subsets
}

// mustBeCollisionFree panics if any two distinct canonical keys hash to the same
// fnHash at FnHashLen. Runs at package init so EVERY build / test trips it — the
// "closed system, fail-and-bump" guarantee. A collision is an INTERNAL BUG (the
// length isn't user-configurable and the operation set is ours): never fall back
// or auto-grow — fix it by bumping FnHashLen.
func mustBeCollisionFree() {
	owner := make(map[string]string)
	for _, key := range allCanonicalKeys() {
		hash := FnHash(key)
		if existing, taken := owner[hash]; taken && existing != key {
			panic(fmt.Sprintf(
				"operations: internal bug — fnHash collision at FnHashLen=%d: %q and %q both hash to %q; bump FnHashLen",
				FnHashLen, existing, key, hash,
			))
		}
		owner[hash] = key
	}
}
