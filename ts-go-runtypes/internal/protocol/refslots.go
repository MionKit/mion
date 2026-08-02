package protocol

// EachRefSlot calls visit for every non-nil ref-carrying child slot of
// runType, single slots first, then the slice slots in canonical order.
// This is THE one enumeration of RunType's child-bearing slots: the
// family populator (PopulateFamily), the runtype module dep collector
// (collectRefDeps) and the resolver's per-file scope walk all iterate
// through it, so a slot added to RunType is wired into every walker by
// extending this list alone.
//
// Slot notes (why some seemingly-redundant slots are enumerated):
//   - Extends — interface parents. Properties are already flattened into
//     Children by the TS checker, but the parent refs are only reachable
//     through this slot.
//   - TypeMeta — surviving object-literal types from a collapsed
//     `primitive & {brand}` intersection, reachable only from the branded
//     primitive node.
//   - SafeUnionChildren / UnionDiscriminators — the same ref objects as
//     Children in today's passes; enumerated so a future pass that
//     surfaces extra nodes here is still covered.
func (runType *RunType) EachRefSlot(visit func(*RunType)) {
	for _, slot := range []*RunType{runType.Child, runType.Index, runType.Return, runType.IndexT} {
		if slot != nil {
			visit(slot)
		}
	}
	for _, slots := range [][]*RunType{
		runType.Parameters,
		runType.Children,
		runType.SafeUnionChildren,
		runType.UnionDiscriminators,
		runType.TypeMeta,
		runType.TypeArguments,
		runType.Arguments,
		runType.ExtendsArguments,
		runType.Implements,
		runType.Extends,
		// Negations — the `__rtNot` children; reachable only from the
		// negation-bearing node, exactly like TypeMeta from a branded one.
		runType.Negations,
	} {
		for _, slot := range slots {
			if slot != nil {
				visit(slot)
			}
		}
	}
	// Contains — the `__rtContains` children (JSON Schema contains); each
	// entry's child is a full node slot exactly like a negation child.
	for _, containsCheck := range runType.Contains {
		if containsCheck != nil && containsCheck.Child != nil {
			visit(containsCheck.Child)
		}
	}
	// PatternProps / PropNames — the `__rtPatternProps` / `__rtPropNames`
	// children (JSON Schema patternProperties / propertyNames).
	for _, patternProp := range runType.PatternProps {
		if patternProp == nil {
			continue
		}
		if patternProp.Key != nil {
			visit(patternProp.Key)
		}
		if patternProp.Value != nil {
			visit(patternProp.Value)
		}
	}
	if runType.PropNames != nil {
		visit(runType.PropNames)
	}
	// OneOf — the `__rtOneOf` branch children (the OneOf<[…]> combinator).
	for _, branch := range runType.OneOf {
		if branch != nil {
			visit(branch)
		}
	}
}
