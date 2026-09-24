package operations

import (
	"fmt"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/hashid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// FnHashLen is the fixed character length of every fnHash; the operation set is finite and closed, so mustBeCollisionFree proves the
// length safe at init and a colliding new operation fails the build. Bumping this constant is the remedy, never renaming an operation,
// which only moves the collision. The bump churns every emitted cache key (`<fnHash>_<typeId>`), invalidating on-disk caches and the
// generated TS mirror; a consumer resolving through getFnHash (mion's JIT_FUNCTION_IDS) needs no edit.
const FnHashLen = 4

// fnHashSalt namespaces operation hashes away from structural type-id hashes: the `op|` infix is the ONLY thing keeping the two
// disjoint, NOT the version. The salt is deliberately version-INDEPENDENT, unlike a type id, which folds constants.Version in.
// Cross-version invalidation still holds, because every emitted key is `<fnHash>_<typeId>` and the typeId half re-hashes per version.
// Folding the version in here would move the per-family fn-hash PREFIXES every release, forcing every consumer that maps
// `family → prefix` (mion's JIT_FUNCTION_IDS) to re-pin its constants on each bump.
func fnHashSalt(canonicalKey string) string {
	return "op|" + canonicalKey
}

// circularCanonicalSuffix forks every CircularGuarded family's key when `rejectCircularRefs` is armed, orthogonal to every axis.
// The JS mirror (fnHash.ts / fnHashes.generated.ts) spells the fork "C"; both resolve to the same hash, so the strings need not match.
const circularCanonicalSuffix = "~C"

// Canonical returns the deterministic, property-order-independent hash input for an operation plus its call-site compile-time args.
// Order-independence comes from constants.ValidateVariantSuffix emitting letters in DECLARATION order whatever the optionNames order,
// the same discipline the type-id side keeps with memberIDs' sort (typeid.go).
// Any FUTURE axis that canonicalizes a raw object literal MUST recursively sort its keys here to preserve that.
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

// FnHash hashes a canonical key into the opaque, fixed-length fnHash baked into emitted cache keys. PURE, with no stateful dictionary:
// the value lives in emitted modules and the on-disk cache, so it must never depend on per-run insertion order (unlike hashid.Dict).
func FnHash(canonicalKey string) string {
	return hashid.QuickHash(fnHashSalt(canonicalKey), FnHashLen)
}

// FnHashFor is Canonical + FnHash in one call, used by the scanner to compute the injected fnHash and by the emitter to name entries;
// `rejectCircular` folds in only for a CircularGuarded operation.
func FnHashFor(op Operation, optionNames []string, strategy string, rejectCircular bool) string {
	return FnHash(Canonical(op, optionNames, strategy, rejectCircular))
}

// PlainHash returns the fnHash of an operation's DEFAULT variant (no options, default strategy, no circular guard), for cross-family
// references that always target the plain form: the union-discriminator `validate` check, a walker's own-family InnerPrefix.
// Panics on an unknown name, a programmer error caught at the first call.
func PlainHash(name string) string {
	op, ok := byName[name]
	if !ok {
		panic(fmt.Sprintf("operations.PlainHash: unknown operation %q", name))
	}
	return FnHashFor(op, nil, "", false)
}

// VariantHash is PlainHash for a set of option NAMES, for a cross-family reference that must target the SAME variant the referring
// walker renders (a validationErrors union arm delegating its verdict to a validate entry). An empty set reduces to PlainHash.
func VariantHash(name string, optionNames []string) string {
	op, ok := byName[name]
	if !ok {
		panic(fmt.Sprintf("operations.VariantHash: unknown operation %q", name))
	}
	return FnHashFor(op, optionNames, "", false)
}

// FnVariant is one (operation + call-site args) combination the registry can mint an fnHash for. Every axis is closed and finite, so
// the whole set is enumerable, which is what lets an emitted fnHash be read BACK to its variant (VariantForFnHash).
type FnVariant struct {
	Op             Operation
	Options        []string
	Strategy       string
	RejectCircular bool
	FnHash         string
}

// AllFnVariants enumerates every (operation, call-site args) combination the registry can produce, each CircularGuarded op twice.
// Both the collision guard and the fnHash reverse map read this one enumeration, so they can never drift.
func AllFnVariants() []FnVariant {
	var variants []FnVariant
	add := func(op Operation, options []string, strategy string, rejectCircular bool) {
		variants = append(variants, FnVariant{
			Op:             op,
			Options:        options,
			Strategy:       strategy,
			RejectCircular: rejectCircular,
			FnHash:         FnHashFor(op, options, strategy, rejectCircular),
		})
	}
	for _, op := range registry {
		circularVariants := []bool{false}
		if op.CircularGuarded {
			circularVariants = []bool{false, true}
		}
		for _, rejectCircular := range circularVariants {
			switch op.Axis {
			case AxisValidateOptions:
				for _, subset := range constants.OptionSubsets(constants.ValidateOptions) {
					add(op, subset, "", rejectCircular)
				}
			case AxisHasUnknownKeysOptions:
				for _, subset := range constants.OptionSubsets(constants.HasUnknownKeysOptions) {
					add(op, subset, "", rejectCircular)
				}
			case AxisJsonStrategy:
				for _, strategy := range op.Strategies {
					add(op, nil, strategy, rejectCircular)
				}
			default:
				add(op, nil, "", rejectCircular)
			}
		}
	}
	return variants
}

// variantByFnHash is the reverse of FnHashFor over the closed variant set, well-defined because mustBeCollisionFree proves the hash
// injective there, over this same enumeration.
var variantByFnHash = func() map[string]FnVariant {
	out := make(map[string]FnVariant)
	for _, variant := range AllFnVariants() {
		out[variant.FnHash] = variant
	}
	return out
}()

// VariantForFnHash reads an emitted fnHash back to the operation and call-site args it was minted from, false for anything else.
// The cross-family fixpoint routes a missing `<fnHash>_<id>` dep to the family AND the variant that renders it with this.
func VariantForFnHash(fnHash string) (FnVariant, bool) {
	variant, ok := variantByFnHash[fnHash]
	return variant, ok
}

func allCanonicalKeys() []string {
	variants := AllFnVariants()
	keys := make([]string, 0, len(variants))
	for _, variant := range variants {
		keys = append(keys, Canonical(variant.Op, variant.Options, variant.Strategy, variant.RejectCircular))
	}
	return keys
}

// mustBeCollisionFree panics when two distinct canonical keys hash alike at FnHashLen; it runs at package init, so every build trips it.
// A collision is an INTERNAL BUG, the length being ours and not user-configurable: never fall back or auto-grow, bump FnHashLen.
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
