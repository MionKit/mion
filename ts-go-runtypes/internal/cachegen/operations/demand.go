package operations

import "github.com/mionkit/ts-runtypes/internal/constants"

// Demand is one cache entry a createX call site requires: the family + variant
// to render, plus the fnHash that entry is keyed by. FamilyTag/VariantSuffix/
// Options drive the emitter's rendering; FnHash names the entry once the
// hashed-id migration lands. Kept as its own type (not protocol.SiteDemand) so
// this package stays free of a protocol dependency; the scanner converts.
type Demand struct {
	FamilyTag     string
	VariantSuffix string
	Options       []string
	FnHash        string
	// RejectCircular marks the demand for a CircularGuarded family's armed
	// variant (the `{rejectCircularRefs: true}` fork). The emitter renders the
	// inline circular guard for exactly these entries. It rides on the root /
	// composite demand only — never on the JSON primitives a composite wraps,
	// which stay plain (the guard is at the composite level).
	RejectCircular bool
}

// DemandFor returns the cache-entry demands for a createX call site identified
// by its InjectTypeFnArgs Fn token, refined by the call-site options / strategy:
//
//   - AxisValidateOptions: one entry, the requested variant of the family (it/te).
//   - AxisJsonStrategy:  the composite entry (the per-strategy jsonEncoder /
//     jsonDecoder family, keyed by the strategy's composite fnHash) PLUS one
//     entry per composed primitive family (constants.JsonStrategyFamilies). The
//     composite body looks up those primitives by their fnHash, so both must be
//     demanded. Empty strategy defaults to the operation's DefaultStrategy.
//   - AxisNone:          one plain entry.
//
// Reflection-only sites (unknown fnKey) yield nil. This is the forward
// (structured) replacement for the old constants.DemandsForFnId reverse-parse.
func DemandFor(fnKey string, optionNames []string, strategy string, rejectCircular bool) []Demand {
	op, ok := byFnKey[fnKey]
	if !ok {
		return nil
	}
	// rejectCircular only forks a CircularGuarded op; normalise away otherwise so
	// non-guarded families never carry a spurious armed flag.
	armed := rejectCircular && op.CircularGuarded
	switch op.Axis {
	case AxisValidateOptions:
		return []Demand{{
			FamilyTag:      op.FamilyTag,
			VariantSuffix:  constants.ValidateVariantSuffix(optionNames),
			Options:        optionNames,
			FnHash:         FnHashFor(op, optionNames, "", armed),
			RejectCircular: armed,
		}}
	case AxisHasUnknownKeysOptions:
		return []Demand{{
			FamilyTag:     op.FamilyTag,
			VariantSuffix: constants.HasUnknownKeysVariantSuffix(optionNames),
			Options:       optionNames,
			FnHash:        FnHashFor(op, optionNames, "", false),
		}}
	case AxisJsonStrategy:
		if strategy == "" {
			strategy = op.DefaultStrategy
		}
		var demands []Demand
		// The composite entry itself — routes to the composite emitter via its
		// per-strategy family tag and is keyed by the composite fnHash. The
		// circular guard rides HERE (the composite level), not on the primitives.
		if compositeTag, ok := constants.JsonCompositeTag(op.Name, strategy); ok {
			demands = append(demands, Demand{
				FamilyTag:      compositeTag,
				FnHash:         FnHashFor(op, nil, strategy, armed),
				RejectCircular: armed,
			})
		}
		// The primitive families the composite body references — always plain.
		for _, tag := range constants.JsonStrategyFamilies[op.Name+"|"+strategy] {
			primitive, ok := byFamilyT[tag]
			if !ok {
				continue
			}
			demands = append(demands, Demand{
				FamilyTag: tag,
				FnHash:    FnHashFor(primitive, nil, "", false),
			})
		}
		return demands
	default:
		return []Demand{{
			FamilyTag:      op.FamilyTag,
			FnHash:         FnHashFor(op, nil, "", armed),
			RejectCircular: armed,
		}}
	}
}
