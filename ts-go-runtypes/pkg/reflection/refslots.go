package reflection

// EachRefSlot calls visit for every non-nil ref-carrying child slot of runType: single slots, then the slice
// slots in canonical order, then the schema-check slots (SchemaChecks.eachRefSlot below). THE one enumeration
// of RunType's child-bearing slots, so a new slot is wired into every walker by extending this list alone.
//
// Slots that look redundant but are not:
//   - Extends — interface parents; the properties are flattened into Children, the parent refs reach only here.
//   - TypeMeta — object-literal types surviving a collapsed `primitive & {brand}` intersection, reachable only
//     from the branded primitive node.
//   - SafeUnionChildren / UnionDiscriminators — already reachable through Children in today's passes;
//     enumerated so a future pass that surfaces extra nodes here is still covered.
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
	} {
		for _, slot := range slots {
			if slot != nil {
				visit(slot)
			}
		}
	}
	runType.SchemaChecks.eachRefSlot(visit)
}

// eachRefSlot visits every child-bearing slot of the sentinel-lifted schema checks; the entries are full nodes,
// each reachable only from the check-bearing node. Called from EachRefSlot only, so the one-enumeration
// contract extends through here: a slot added to SchemaChecks is wired in by extending this method alone.
func (checks *SchemaChecks) eachRefSlot(visit func(*RunType)) {
	for _, containsCheck := range checks.Contains {
		if containsCheck != nil && containsCheck.Child != nil {
			visit(containsCheck.Child)
		}
	}
	for _, patternProp := range checks.PatternProps {
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
	for _, propNames := range checks.PropNames {
		if propNames != nil {
			visit(propNames)
		}
	}
}
