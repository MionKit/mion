package runtype

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// finalizeUnion runs once after a union's children are serialized. It:
//
//  1. Buckets children into simple / object-like / any (per
//     splitUnionItems);
//  2. Reorders the object-like bucket so superset shapes precede their
//     subset equivalents (per sortUnreachableTypes) — prevents
//     unreachable union members at validate time;
//  3. Records the resulting order on the union's SafeUnionChildren slice;
//  4. Runs the discriminator pass — populates UnionDiscriminators with
//     per-member refs to the property selected as the union's
//     discriminator (named-shared or unique-prop). The slot at index i
//     is parallel to SafeUnionChildren[i]; non-object members get nil.
//
// Children are ref RunTypes (Kind == KindRef) pointing at canonical
// entries in cache.nodes. SafeUnionChildren shares the same ref
// pointers; consumers derive per-member position via indexOf.
func (cache *Cache) finalizeUnion(node *reflection.RunType) {
	if len(node.Children) <= 1 {
		// Degenerate union — nothing to reorder, nothing to discriminate.
		return
	}

	simpleItems, objectRefs, anyItem := cache.splitUnionItems(node.Children)
	sortedObjects := cache.sortUnreachableTypes(objectRefs)

	safeOrder := make([]*reflection.RunType, 0, len(node.Children))
	safeOrder = append(safeOrder, simpleItems...)
	safeOrder = append(safeOrder, sortedObjects...)
	if anyItem != nil {
		safeOrder = append(safeOrder, anyItem)
	}
	node.SafeUnionChildren = safeOrder

	cache.markDiscriminators(node, sortedObjects)
}

// splitUnionItems mirrors splitUnionItems
// (ref: packages/run-types/src/nodes/collection/unionDiscriminator.ts:36-58):
// object-like members go to objectRefs, atomics to simpleItems, and the
// first any/unknown member is held aside for last-position placement.
// Subsequent any/unknown members are kept in their bucket (duplicates
// would already have been deduped by the TS checker, but we don't
// re-emit a separate any node — the reference algorithm drops them silently).
func (cache *Cache) splitUnionItems(children []*reflection.RunType) (simpleItems, objectRefs []*reflection.RunType, anyItem *reflection.RunType) {
	for _, ref := range children {
		canonical := cache.nodes[ref.ID]
		if canonical == nil {
			simpleItems = append(simpleItems, ref)
			continue
		}
		switch canonical.Kind {
		case reflection.KindAny, reflection.KindUnknown:
			if anyItem == nil {
				anyItem = ref
			}
			// duplicates dropped per the "Only keep the first" comment
		case reflection.KindObjectLiteral, reflection.KindClass:
			objectRefs = append(objectRefs, ref)
		default:
			simpleItems = append(simpleItems, ref)
		}
	}
	return
}

// sortUnreachableTypes is a Go port of sortUnreachableTypes
// (ref: unionDiscriminator.ts:69-116). Object-like members whose property
// type-id sets are subset-related to one another get grouped, then the
// group is sorted descending by property count so the most-specific
// shape is validated first. Unrelated members keep their declaration
// order.
func (cache *Cache) sortUnreachableTypes(objectRefs []*reflection.RunType) []*reflection.RunType {
	if len(objectRefs) <= 1 {
		return objectRefs
	}

	// Pre-compute the property type-id set for each object member.
	propSets := make([]map[string]struct{}, len(objectRefs))
	for i, ref := range objectRefs {
		propSets[i] = cache.propertyTypeIDSet(ref)
	}

	isSubsetOf := func(smallerIdx, largerIdx int) bool {
		smaller := propSets[smallerIdx]
		larger := propSets[largerIdx]
		if len(smaller) >= len(larger) {
			return false
		}
		for typeID := range smaller {
			if _, ok := larger[typeID]; !ok {
				return false
			}
		}
		return true
	}

	processed := make([]bool, len(objectRefs))
	result := make([]*reflection.RunType, 0, len(objectRefs))

	for i := 0; i < len(objectRefs); i++ {
		if processed[i] {
			continue
		}
		groupIdx := []int{i}
		processed[i] = true
		for j := 0; j < len(objectRefs); j++ {
			if i == j || processed[j] {
				continue
			}
			if isSubsetOf(i, j) || isSubsetOf(j, i) {
				groupIdx = append(groupIdx, j)
				processed[j] = true
			}
		}
		if len(groupIdx) > 1 {
			// Sort descending by property count (more props first).
			// Stable: when sizes match, original order wins.
			for outer := 1; outer < len(groupIdx); outer++ {
				key := groupIdx[outer]
				keySize := len(propSets[key])
				inner := outer - 1
				for inner >= 0 && len(propSets[groupIdx[inner]]) < keySize {
					groupIdx[inner+1] = groupIdx[inner]
					inner--
				}
				groupIdx[inner+1] = key
			}
		}
		for _, idx := range groupIdx {
			result = append(result, objectRefs[idx])
		}
	}
	return result
}

// propertyTypeIDSet returns the set of property type-ids on an
// object-like canonical node. The "type-id" of a property is the id of
// its child type — same value PropertyRunType.getTypeID() returns
// at the runtype layer.
func (cache *Cache) propertyTypeIDSet(ref *reflection.RunType) map[string]struct{} {
	out := make(map[string]struct{})
	canonical := cache.nodes[ref.ID]
	if canonical == nil {
		return out
	}
	for _, childRef := range canonical.Children {
		memberNode := cache.nodes[childRef.ID]
		if memberNode == nil {
			continue
		}
		if memberNode.Kind != reflection.KindProperty && memberNode.Kind != reflection.KindPropertySignature {
			continue
		}
		if memberNode.Child != nil {
			out[memberNode.Child.ID] = struct{}{}
		}
	}
	return out
}

// discriminatorAssignment describes one (object member, chosen property)
// pair selected by a discriminator pass. The object's slot in
// node.SafeUnionChildren receives propRef.
type discriminatorAssignment struct {
	objectRef *reflection.RunType
	propRef   *reflection.RunType
	typeID    string
}

// markDiscriminators populates the union's UnionDiscriminators slot
// with per-member refs to the property selected as the discriminator.
// Mirrors markDiscriminators + getDiscriminatorProperties +
// getUniqueDiscriminatorProperties (ref: unionDiscriminator.ts:122-251).
// Tries shared-name first (every member has a property with the same
// name and distinct type-ids); falls back to unique-prop (each member
// picks its own property whose type-id is unique across the union).
func (cache *Cache) markDiscriminators(node *reflection.RunType, objectRefs []*reflection.RunType) {
	if len(objectRefs) < 2 {
		return
	}
	if cache.tryMarkSharedNameDiscriminator(node, objectRefs) {
		return
	}
	cache.tryMarkUniquePropDiscriminator(node, objectRefs)
}

// tryMarkSharedNameDiscriminator finds the lowest-cost property name
// shared across every object member with distinct per-member type-ids.
// On success, writes one ref per object member into the union's
// UnionDiscriminators slot (parallel to SafeUnionChildren). Reports
// true when a qualifying name was found.
func (cache *Cache) tryMarkSharedNameDiscriminator(node *reflection.RunType, objectRefs []*reflection.RunType) bool {
	byName := make(map[string][]discriminatorAssignment)
	for _, ref := range objectRefs {
		canonical := cache.nodes[ref.ID]
		if canonical == nil {
			return false
		}
		for _, childRef := range canonical.Children {
			memberNode := cache.nodes[childRef.ID]
			if memberNode == nil {
				continue
			}
			if memberNode.Kind != reflection.KindProperty && memberNode.Kind != reflection.KindPropertySignature {
				continue
			}
			childID := ""
			if memberNode.Child != nil {
				childID = memberNode.Child.ID
			}
			byName[memberNode.Name] = append(byName[memberNode.Name], discriminatorAssignment{objectRef: ref, propRef: childRef, typeID: childID})
		}
	}

	type candidate struct {
		name       string
		entries    []discriminatorAssignment
		complexity int
	}
	var candidates []candidate
	for name, entries := range byName {
		if len(entries) != len(objectRefs) {
			continue
		}
		typeIDCounts := make(map[string]int, len(entries))
		for _, entry := range entries {
			typeIDCounts[entry.typeID]++
		}
		allDistinct := true
		for _, count := range typeIDCounts {
			if count != 1 {
				allDistinct = false
				break
			}
		}
		if !allDistinct {
			continue
		}
		comp := 0
		for _, entry := range entries {
			comp += len(entry.typeID)
		}
		candidates = append(candidates, candidate{name: name, entries: entries, complexity: comp})
	}
	if len(candidates) == 0 {
		return false
	}
	pick := candidates[0]
	for _, cand := range candidates[1:] {
		if cand.complexity < pick.complexity ||
			(cand.complexity == pick.complexity && cand.name < pick.name) {
			pick = cand
		}
	}
	cache.assignUnionDiscriminators(node, pick.entries)
	return true
}

// tryMarkUniquePropDiscriminator picks one property per object member
// whose type-id is unique across the union. If multiple unique
// properties exist on a member, the one with the shortest (least
// complex) type-id wins. Members that have no unique property leave
// their slot in UnionDiscriminators nil. Reports true when at least
// one member was assigned.
func (cache *Cache) tryMarkUniquePropDiscriminator(node *reflection.RunType, objectRefs []*reflection.RunType) bool {
	type propCandidate struct {
		propRef *reflection.RunType
		typeID  string
	}
	memberCandidates := make([][]propCandidate, len(objectRefs))
	memberTypeIDs := make([]map[string]struct{}, len(objectRefs))
	for i, ref := range objectRefs {
		canonical := cache.nodes[ref.ID]
		if canonical == nil {
			continue
		}
		ids := make(map[string]struct{})
		var candidates []propCandidate
		for _, childRef := range canonical.Children {
			memberNode := cache.nodes[childRef.ID]
			if memberNode == nil {
				continue
			}
			if memberNode.Kind != reflection.KindProperty && memberNode.Kind != reflection.KindPropertySignature {
				continue
			}
			childID := ""
			if memberNode.Child != nil {
				childID = memberNode.Child.ID
			}
			candidates = append(candidates, propCandidate{propRef: childRef, typeID: childID})
			ids[childID] = struct{}{}
		}
		memberCandidates[i] = candidates
		memberTypeIDs[i] = ids
	}

	var assigned []discriminatorAssignment
	for i, candidates := range memberCandidates {
		var picked *propCandidate
		pickedComplexity := 0
		for k := range candidates {
			cand := &candidates[k]
			unique := true
			for j, otherIDs := range memberTypeIDs {
				if i == j {
					continue
				}
				if _, hit := otherIDs[cand.typeID]; hit {
					unique = false
					break
				}
			}
			if !unique {
				continue
			}
			complexity := len(cand.typeID)
			if picked == nil || complexity < pickedComplexity {
				picked = cand
				pickedComplexity = complexity
			}
		}
		if picked != nil {
			assigned = append(assigned, discriminatorAssignment{
				objectRef: objectRefs[i],
				propRef:   picked.propRef,
				typeID:    picked.typeID,
			})
		}
	}
	if len(assigned) == 0 {
		return false
	}
	cache.assignUnionDiscriminators(node, assigned)
	return true
}

// assignUnionDiscriminators writes one entry per (objectRef, propRef)
// pair into node.UnionDiscriminators, slotted at the position of
// objectRef within node.SafeUnionChildren. Non-object slots (simple /
// any) remain nil. The slice is allocated to len(SafeUnionChildren)
// on first call.
func (cache *Cache) assignUnionDiscriminators(node *reflection.RunType, entries []discriminatorAssignment) {
	if node.UnionDiscriminators == nil {
		node.UnionDiscriminators = make([]*reflection.RunType, len(node.SafeUnionChildren))
	}
	for _, entry := range entries {
		slot := indexOfRef(node.SafeUnionChildren, entry.objectRef)
		if slot >= 0 {
			node.UnionDiscriminators[slot] = entry.propRef
		}
	}
}

// indexOfRef returns the position of ref in refs by pointer identity,
// or -1 if not present.
func indexOfRef(refs []*reflection.RunType, ref *reflection.RunType) int {
	for i, candidate := range refs {
		if candidate == ref {
			return i
		}
	}
	return -1
}
