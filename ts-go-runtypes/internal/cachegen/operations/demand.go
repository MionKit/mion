package operations

import "github.com/mionkit/mion/ts-go-runtypes/internal/constants"

// Demand is one cache entry a createX call site requires: the family and variant to render, plus the fnHash the entry is keyed by.
// Its own type rather than protocol.SiteDemand, so this package stays free of a protocol dependency; the scanner converts.
type Demand struct {
	FamilyTag     string
	VariantSuffix string
	Options       []string
	FnHash        string
	// RejectCircular marks the armed `{rejectCircularRefs: true}` variant, guarded inline; never on a JSON primitive.
	RejectCircular bool
	// ComposedBy names the JSON composite operation a primitive demand exists for; empty for a direct demand.
	ComposedBy string
}

// DemandFor returns the cache-entry demands for a createX call site's InjectTypeFnArgs Fn token; a reflection-only site (unknown
// fnKey) yields nil. A JSON-strategy site demands the composite entry AND one entry per composed primitive family, because the
// composite body looks those primitives up by their fnHash.
func DemandFor(fnKey string, optionNames []string, strategy string, rejectCircular bool) []Demand {
	op, ok := byFnKey[fnKey]
	if !ok {
		return nil
	}
	return DemandForOp(op, optionNames, strategy, rejectCircular)
}

// DemandForOp is DemandFor for a caller that already holds the Operation; the scanner swaps the operation mid-resolution, so it
// would otherwise have to re-derive a marker token just to look the same operation back up.
func DemandForOp(op Operation, optionNames []string, strategy string, rejectCircular bool) []Demand {
	// Normalise away rejectCircular off a non-guarded op, or its family carries a spurious armed flag.
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
		// The circular guard rides HERE, at the composite level, not on the primitives.
		if compositeTag, ok := constants.JsonCompositeTag(op.Name, strategy); ok {
			demands = append(demands, Demand{
				FamilyTag:      compositeTag,
				FnHash:         FnHashFor(op, nil, strategy, armed),
				RejectCircular: armed,
			})
		}
		// The primitive families the composite body references, always plain.
		for _, tag := range constants.JsonStrategyFamilies[op.Name+"|"+strategy] {
			primitive, ok := byFamilyT[tag]
			if !ok {
				continue
			}
			demands = append(demands, Demand{
				FamilyTag:  tag,
				FnHash:     FnHashFor(primitive, nil, "", false),
				ComposedBy: op.Name,
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
