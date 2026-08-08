package protocol

// EachRefSlot calls visit for every non-nil ref-carrying child slot of
// runType, single slots first, then the slice slots in canonical order,
// then the schema-check slots (SchemaChecks.eachRefSlot below).
// This is THE one enumeration of RunType's child-bearing slots: the
// family populator (PopulateFamily), the runtype module dep collector
// (collectRefDeps) and the resolver's per-file scope walk all iterate
// through it, so a slot added to RunType is wired into every walker by
// extending this list alone — a slot added to SchemaChecks by extending
// eachRefSlot alone.
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
	} {
		for _, slot := range slots {
			if slot != nil {
				visit(slot)
			}
		}
	}
	runType.SchemaChecks.eachRefSlot(visit)
}

// eachRefSlot visits every child-bearing slot of the sentinel-lifted schema
// checks; the entries are full nodes exactly like any other child slot, and
// each is reachable only from the check-bearing node (like TypeMeta from a
// branded one). Called from EachRefSlot only — the one-enumeration contract
// extends through here, so a slot added to SchemaChecks is wired into every
// walker by extending this method alone.
func (checks *SchemaChecks) eachRefSlot(visit func(*RunType)) {
	// Negations — the `__rtNot` children.
	for _, negation := range checks.Negations {
		if negation != nil {
			visit(negation)
		}
	}
	// Contains — the `__rtContains` children (JSON Schema contains); each
	// entry's child is a full node slot exactly like a negation child.
	for _, containsCheck := range checks.Contains {
		if containsCheck != nil && containsCheck.Child != nil {
			visit(containsCheck.Child)
		}
	}
	// PatternProps / PropNames — the `__rtPatternProps` / `__rtPropNames`
	// children (JSON Schema patternProperties / propertyNames).
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
	// OneOf — the `__rtOneOf` branch children (the OneOf<[…]> combinator).
	for _, branch := range checks.OneOf {
		if branch != nil {
			visit(branch)
		}
	}
	// Unevaluated — the `__rtUnevaluated` sweep's child slots: the leftover
	// value plus each guarded group's subschema. Omitting them starved the
	// family populator, the bundle dep collector and the per-file scope walk
	// of the guard children.
	for _, unevaluated := range checks.Unevaluated {
		if unevaluated == nil {
			continue
		}
		if unevaluated.Value != nil {
			visit(unevaluated.Value)
		}
		for _, group := range unevaluated.Groups {
			if group == nil {
				continue
			}
			if group.When != nil {
				visit(group.When)
			}
			if group.WhenNot != nil {
				visit(group.WhenNot)
			}
		}
	}
}
