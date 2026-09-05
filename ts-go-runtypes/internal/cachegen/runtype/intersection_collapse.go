package runtype

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// collapseIntersection projects a TS intersection type into a single
// non-intersection RunType, following the rules in
// /root/.claude/plans/intersection-zesty-spindle.md.
//
// The TypeScript checker eagerly collapses many intersections before we see
// them (`string & number` → never; `string & "x"` → "x"; same-shape object
// merges) so the cases reaching this function are typically:
//
//   - pure object×object (delegate to projectObjectLiteral — the checker
//     already merges property lists);
//   - primitive×brand object (`string & {__brand: "X"}`) — keep primitive,
//     attach the object literals as decorators;
//   - more exotic combinations the checker couldn't reduce.
func (cache *Cache) collapseIntersection(tsType *checker.Type, node *reflection.RunType) {
	members := tsType.AsUnionOrIntersectionType().Types()

	var (
		primitiveMember *checker.Type
		literalMember   *checker.Type
		objectMembers   []*checker.Type
		hasNever        bool
		// hasIncompatiblePrimitives surfaces `string & number`-style cases
		// that survived past the checker's own collapse.
		hasIncompatiblePrimitives bool
	)

	for _, member := range members {
		memberFlags := member.Flags()
		switch {
		case memberFlags&checker.TypeFlagsNever != 0:
			hasNever = true
		case memberFlags&checker.TypeFlagsAny != 0,
			memberFlags&checker.TypeFlagsUnknown != 0:
			// Identity under intersection — skip.
		case isLiteralFlags(memberFlags):
			if literalMember == nil {
				literalMember = member
				continue
			}
			// Two literal members — incompatible if the new one differs from
			// the kept one. Same literal repeated would already have been
			// deduped by the checker.
			if !sameLiteral(literalMember, member, cache.typeChecker) {
				hasIncompatiblePrimitives = true
			}
		case isPrimitiveBaseFlags(memberFlags):
			if primitiveMember == nil {
				primitiveMember = member
				continue
			}
			// Two different primitive base members — `string & number`.
			if !samePrimitiveBase(primitiveMember, member) {
				hasIncompatiblePrimitives = true
			}
		case memberFlags&checker.TypeFlagsObject != 0,
			// The bare `object` keyword (TypeFlagsNonPrimitive) — a real base
			// in `object & {sentinel}` intersections. Without this case the
			// member is silently DROPPED and the collapse degrades the base to
			// unknown, deleting the kind check from the generated validator.
			memberFlags&checker.TypeFlagsNonPrimitive != 0:
			objectMembers = append(objectMembers, member)
		}
	}

	if hasNever || hasIncompatiblePrimitives {
		node.Kind = reflection.KindNever
		return
	}

	// Primitive narrowing: `string & "x"` should already be reduced by the
	// checker, but if both kinds survive we keep the literal — the literal
	// only survives the loop above when it's compatible with the primitive.
	if literalMember != nil && primitiveMember != nil {
		if !literalExtendsPrimitive(literalMember, primitiveMember) {
			node.Kind = reflection.KindNever
			return
		}
		// Drop the primitive — the literal is the narrowed form.
		primitiveMember = nil
	}

	// Primitive (or literal) × object literals: brand case. Keep the
	// primitive, attach each object literal as a decorator — unless the
	// object literal is recognised as a TypeFormat brand, in which case
	// it is lifted onto node.FormatAnnotation and skipped from the
	// TypeMeta array. Recognition is structural (presence of the two
	// sentinel properties); see typeid.FormatAnnotationFromType.
	primary := primitiveMember
	if literalMember != nil {
		primary = literalMember
	}
	if primary != nil && len(objectMembers) > 0 {
		cache.projectPrimitiveInto(primary, node)
		var annotations []*reflection.FormatAnnotation
		for _, objectMember := range objectMembers {
			if annotation := typeid.FormatAnnotationFromType(cache.typeChecker, objectMember); annotation != nil {
				annotations = append(annotations, annotation)
				continue
			}
			// Pure `{__rtFormatBrand}` nominal-brand member — TS-only, no runtime
			// footprint; skip it so it doesn't decorate the node (keeping the wire
			// output + id identical to the unbranded twin). See IsFormatBrandMember.
			if typeid.IsFormatBrandMember(cache.typeChecker, objectMember) {
				continue
			}
			node.TypeMeta = append(node.TypeMeta, cache.Serialize(objectMember))
		}
		// Same-family annotations MERGE (sibling conjunction: a `$ref` to a
		// branded base ∧ a local constraint keyword). Cross-family stacks and
		// param contradictions FAIL THE BUILD here — the historical last-wins
		// silently dropped a declared constraint, which is the one thing the
		// pipeline promises never to do.
		if merged, ok := typeid.MergeFormatAnnotations(annotations); ok {
			node.FormatAnnotation = merged
		} else {
			names := make([]string, 0, len(annotations))
			for _, annotation := range annotations {
				names = append(names, annotation.Name)
			}
			panic("mion: conflicting format annotations on one intersection (" + strings.Join(names, " & ") +
				") — merging across format families is not supported yet; spell the constraints in one brand")
		}
		return
	}

	// Primitive alone (every object member ended up being any/unknown).
	if primary != nil {
		cache.projectPrimitiveInto(primary, node)
		return
	}

	// Builtin-class × brand: `FormatDate<P>` lowers to `Date & {brand}`,
	// which the checker keeps as a real intersection of two object members
	// (the Date interface + the sentinel-bearing brand object). Neither is
	// a primitive, so without this branch it would fall through to the
	// object×object merge below and lose BOTH the Date class identity
	// (SubKindDate, classType wiring) AND the format brand. Detect a
	// recognised builtin-class member alongside a brand member, project the
	// class, and lift the annotation — the same shape a bare `Date` node
	// gets, plus the FormatAnnotation a string format gets.
	if classMember, annotation := splitBuiltinClassBrand(cache.typeChecker, objectMembers); classMember != nil && annotation != nil {
		// Reuse the standalone-Date class projector so SubKind / ClassRef /
		// classType wiring stay identical, then lift the brand on top.
		cache.projectClass(classMember, node)
		node.FormatAnnotation = annotation
		return
	}

	// Object × object — surface the merged shape as an objectLiteral.
	// We DON'T route through projectObjectType because its
	// IsArrayLikeType / Promise / class branches call GetTypeArguments
	// unconditionally, which tsgo crashes on for intersection types.
	// projectMembersInto only calls GetPropertiesOfType + GetIndexInfos
	// + GetSignaturesOfType, all of which are safe on intersections —
	// the TS checker has already merged property sets across members.
	if len(objectMembers) > 0 {
		// Lift structural format brands and sentinel slots first
		// (`unknown[] & {__rtFormatName?: …}`):
		// sentinel members become check entries / the FormatAnnotation,
		// never merged properties (projectMembersInto skips the props by
		// name as well).
		var restMembers []*checker.Type
		var annotations []*reflection.FormatAnnotation
		var tupleLabels []string
		var haveTupleLabels bool
		for _, objectMember := range objectMembers {
			// Labeled-tuple sentinel (`[A, B] & {__rtLabels?: ['x', 'y']}`):
			// lift the labels and write them onto the projected tuple members
			// below — never a property. Twin of the typeid-side label fold.
			if labels, isLabels := typeid.TupleLabelsFromMember(cache.typeChecker, objectMember); isLabels && !haveTupleLabels {
				tupleLabels, haveTupleLabels = labels, true
				continue
			}
			if childType, minCount, maxCount, ok := typeid.ContainsSpecFromMember(cache.typeChecker, objectMember); ok {
				node.Contains = append(node.Contains, &reflection.ContainsCheck{Child: cache.Serialize(childType), Min: minCount, Max: maxCount})
				continue
			}
			if specs, ok := typeid.PatternPropsFromMember(cache.typeChecker, objectMember); ok {
				for _, spec := range specs {
					check := &reflection.PatternPropCheck{Source: spec.Source, Value: cache.Serialize(spec.Value)}
					if spec.Key != nil {
						check.Key = cache.Serialize(spec.Key)
					}
					node.PatternProps = append(node.PatternProps, check)
				}
				continue
			}
			// APPEND, never assign: allOf-stacked propertyNames
			// arrive as one sentinel member each, and the id fold appends them
			// all (`pn{…}`, sorted). A bare assignment here enforced
			// only the LAST lifted child while the id folded every arm —
			// id ≠ behavior, the one thing the pipeline promises never to do.
			if childType := typeid.PropNamesChildFromMember(cache.typeChecker, objectMember); childType != nil {
				node.PropNames = append(node.PropNames, cache.Serialize(childType))
				continue
			}
			if annotation := typeid.FormatAnnotationFromType(cache.typeChecker, objectMember); annotation != nil {
				annotations = append(annotations, annotation)
				continue
			}
			if typeid.IsFormatBrandMember(cache.typeChecker, objectMember) {
				continue
			}
			restMembers = append(restMembers, objectMember)
		}
		restCount := len(restMembers)
		var soleRest *checker.Type
		if restCount == 1 {
			soleRest = restMembers[0]
		}
		// Same-family merge + loud cross-family failure as the primitive
		// branch above — a structural brand must never silently drop.
		if merged, ok := typeid.MergeFormatAnnotations(annotations); ok {
			node.FormatAnnotation = merged
		} else {
			names := make([]string, 0, len(annotations))
			for _, annotation := range annotations {
				names = append(names, annotation.Name)
			}
			panic("mion: conflicting format annotations on one intersection (" + strings.Join(names, " & ") +
				") — merging across format families is not supported yet; spell the constraints in one brand")
		}
		if restCount == 0 {
			// Every member was a sentinel — the base is `unknown` with the
			// check(s) attached.
			node.Kind = reflection.KindUnknown
			return
		}
		if restCount == 1 && haveTupleLabels && checker.IsTupleType(soleRest) &&
			len(tupleLabels) == len(cache.typeChecker.GetTypeArguments(soleRest)) {
			// Tuple base ∧ labels sentinel — project the tuple with the lifted
			// labels as the member names, exactly what the type-first labeled
			// tuple projects (the shared structural id demands byte-identical
			// nodes). A label list that does not cover every element is a
			// hand-rolled sentinel, ignored on both sides — it falls to the
			// single-base branch below, which is why `haveTupleLabels` is in
			// that guard: without it a labels-ONLY carrier (no other sentinel to
			// hold the guard open) fell through to the merged-property path and
			// surfaced the tuple's Array interface as an objectLiteral, while
			// the id twin was already hashing the plain tuple.
			cache.projectTuple(soleRest, node, tupleLabels)
			return
		}
		if restCount == 1 &&
			(haveTupleLabels || node.FormatAnnotation != nil || len(node.Contains) > 0 ||
				len(node.PatternProps) > 0 || len(node.PropNames) > 0) {
			// Single base ∧ sentinel(s) — `unknown[] & {sentinel}`,
			// `Record<string, unknown> & {…}`: project the BASE as itself
			// (array / record / class / tuple), negations attached. Routing
			// it through the merged-property path would surface the array's
			// interface members as an objectLiteral. The bare `object`
			// keyword is not a TypeFlagsObject type — project it directly
			// (projectObjectType would misroute it).
			//
			if soleRest.Flags()&checker.TypeFlagsNonPrimitive != 0 {
				node.Kind = reflection.KindObject
				return
			}
			cache.projectObjectType(soleRest, node)
			return
		}
		// Tuple ∩ tuple — merge slot-wise (typeid/tuplemerge.go) into ONE
		// tuple node whose shape (and id, via the typeid twin) equals the
		// equivalent hand-written tuple; a genuine conflict projects never
		// (over-rejects, never a silent noop — the historical behavior
		// surfaced two tuples as a junk objectLiteral whose validator
		// passed everything).
		if restCount >= 2 && typeid.AllTupleOrArrayTypes(cache.typeChecker, restMembers) {
			picks, ok := typeid.MergeTupleIntersection(cache.typeChecker, restMembers, func(a, b *checker.Type) bool {
				return cache.Serialize(a).ID == cache.Serialize(b).ID
			})
			if !ok {
				node.Kind = reflection.KindNever
				return
			}
			cache.projectMergedTuple(picks, node)
			return
		}
		node.Kind = reflection.KindObjectLiteral
		properties := cache.typeChecker.GetPropertiesOfType(tsType)
		callSignatures := cache.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
		cache.projectMembersInto(tsType, node, properties, callSignatures, false)
		return
	}

	// Fully reduced to any/unknown — pick unknown as a safe fallback.
	node.Kind = reflection.KindUnknown
}

// projectMergedTuple builds the tuple node for a slot-wise tuple ∩ tuple
// merge — the member construction mirrors serialize.go:projectTuple (same
// TupleMember wrappers, same unique member-id discipline) so the merged
// node is indistinguishable from the equivalent hand-written tuple's.
func (cache *Cache) projectMergedTuple(picks []typeid.TupleMergePick, node *reflection.RunType) {
	node.Kind = reflection.KindTuple
	for i, pick := range picks {
		position := i
		// Optional slots resolve through serializeOptionalChild, exactly as
		// projectTuple does — picks carry RAW slot types by contract.
		var elementChild *reflection.RunType
		switch {
		case pick.Fold != nil:
			// A folded slot is already undefined-stripped, so it skips the
			// optional-child resolution the raw picks need.
			elementChild = cache.serializeFoldedSlot(pick.Fold)
		case pick.Optional:
			elementChild = cache.serializeOptionalChild(pick.Type)
		default:
			elementChild = cache.Serialize(pick.Type)
		}
		member := &reflection.RunType{
			Kind:     reflection.KindTupleMember,
			Child:    elementChild,
			Position: &position,
		}
		if pick.Optional {
			member.Optional = true
		}
		if pick.Rest {
			member.Flags = append(member.Flags, "rest")
		}
		structural := fmt.Sprintf("_tm_%s_%d", node.ID, i)
		memberID := cache.uniqueDict(structural, cache.opts.hashLength())
		member.ID = memberID
		cache.intern(structural, memberID)
		cache.putNode(memberID, member)
		node.Children = append(node.Children, reflection.NewRef(memberID))
	}
}

// serializeFoldedSlot materializes a tuple slot several tuples constrained
// differently: a plain type, a primitive base wearing the merged format
// annotation, or a union of arms that each resolved on their own. The
// structural key is the id side's twin (SlotFold.Structural), so the node
// dedups against the equivalent hand-written spelling instead of minting a
// parallel entry. Building a FRESH node is the point — Serialize returns an
// INTERNED node and attaching the annotation to it would corrupt every other
// holder of that id.
func (cache *Cache) serializeFoldedSlot(fold *typeid.SlotFold) *reflection.RunType {
	if len(fold.Arms) == 0 && fold.Annotation == nil {
		return cache.Serialize(fold.Base)
	}
	structural := fold.Structural(cache.idComputer)
	if id, ok := cache.byStructural[structural]; ok {
		return reflection.NewRef(id)
	}
	id := cache.uniqueDict(structural, cache.opts.hashLength())
	cache.intern(structural, id)
	node := &reflection.RunType{ID: id}
	if len(fold.Arms) > 0 {
		node.Kind = reflection.KindUnion
		// Reserve the slot before projecting arms, exactly as
		// serializeSyntheticUnion does, so an arm that cycles back sees the id.
		cache.putNode(id, node)
		for _, arm := range fold.Arms {
			node.Children = append(node.Children, cache.serializeFoldedSlot(arm))
		}
		cache.finalizeUnion(node)
		reflection.PopulateFamily(node)
		cache.nodes[id] = node
		return reflection.NewRef(id)
	}
	cache.projectPrimitiveInto(fold.Base, node)
	node.FormatAnnotation = fold.Annotation
	reflection.PopulateFamily(node)
	cache.putNode(id, node)
	return reflection.NewRef(id)
}

// projectPrimitiveInto fills `node` with the kind+literal data for a
// primitive or literal member. Mirrors the relevant arms of projectType's
// switch, but writes into an already-allocated node so the caller can keep
// the original id + add decorators on top.
func (cache *Cache) projectPrimitiveInto(tsType *checker.Type, node *reflection.RunType) {
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsStringLiteral != 0:
		node.Kind = reflection.KindLiteral
		node.Literal = tsType.AsLiteralType().Value()
	case flags&checker.TypeFlagsNumberLiteral != 0:
		node.Kind = reflection.KindLiteral
		node.Literal = parseNumberLiteral(cache.typeChecker.TypeToString(tsType))
	case flags&checker.TypeFlagsBooleanLiteral != 0:
		node.Kind = reflection.KindLiteral
		node.Literal = cache.typeChecker.TypeToString(tsType) == "true"
	case flags&checker.TypeFlagsBigIntLiteral != 0:
		node.Kind = reflection.KindLiteral
		node.Literal = fmt.Sprintf("%v", tsType.AsLiteralType().Value())
		node.Flags = append(node.Flags, "bigint")
	case flags&checker.TypeFlagsString != 0:
		node.Kind = reflection.KindString
	case flags&checker.TypeFlagsNumber != 0:
		node.Kind = reflection.KindNumber
	case flags&checker.TypeFlagsBoolean != 0:
		node.Kind = reflection.KindBoolean
	case flags&checker.TypeFlagsBigInt != 0:
		node.Kind = reflection.KindBigInt
	case flags&checker.TypeFlagsESSymbol != 0:
		node.Kind = reflection.KindSymbol
	default:
		node.Kind = typeid.KindOf(cache.typeChecker, tsType)
	}
}

// builtinClassNames are the lib.d.ts interfaces we treat as classes
// (mirrors the switch in projectClass / projectObjectType). A member with
// one of these symbol names is the "base" of a `Builtin & {brand}`
// intersection — currently only Date carries a format family, but the set
// matches the class projector so future builtin formats slot in.
var builtinClassNames = map[string]bool{"Date": true, "Map": true, "Set": true, "RegExp": true}

// splitBuiltinClassBrand inspects the object members of an intersection
// for the `Builtin & {brand}` shape: exactly one member is a recognised
// builtin class (by symbol name) and exactly one carries a TypeFormat
// brand. Returns (classMember, annotation) when both are present, else
// (nil, nil) so the caller falls back to the normal object merge.
func splitBuiltinClassBrand(typeChecker *checker.Checker, objectMembers []*checker.Type) (*checker.Type, *reflection.FormatAnnotation) {
	var classMember *checker.Type
	var annotation *reflection.FormatAnnotation
	for _, member := range objectMembers {
		if found := typeid.FormatAnnotationFromType(typeChecker, member); found != nil {
			if annotation != nil {
				return nil, nil // two brands — not the shape we handle
			}
			annotation = found
			continue
		}
		if isBuiltinClassMember(member) {
			if classMember != nil {
				return nil, nil // two builtin classes — ambiguous
			}
			classMember = member
		}
	}
	return classMember, annotation
}

// isBuiltinClassMember reports whether member is a brandable builtin class —
// a top-level Date/Map/Set/RegExp OR a namespace-qualified Temporal type
// (FormatTemporalX<P> lowers to `Temporal.X & {brand}`). projectClass and the
// id computer both already special-case these, so lifting the brand off them
// produces the correct class node + FormatAnnotation.
func isBuiltinClassMember(member *checker.Type) bool {
	if _, ok := typeid.TemporalInfoForType(member); ok {
		return true
	}
	symbol := member.Symbol()
	return symbol != nil && builtinClassNames[symbol.Name]
}

func isLiteralFlags(flags checker.TypeFlags) bool {
	return flags&checker.TypeFlagsStringLiteral != 0 ||
		flags&checker.TypeFlagsNumberLiteral != 0 ||
		flags&checker.TypeFlagsBooleanLiteral != 0 ||
		flags&checker.TypeFlagsBigIntLiteral != 0
}

func isPrimitiveBaseFlags(flags checker.TypeFlags) bool {
	if isLiteralFlags(flags) {
		return false
	}
	return flags&checker.TypeFlagsString != 0 ||
		flags&checker.TypeFlagsNumber != 0 ||
		flags&checker.TypeFlagsBoolean != 0 ||
		flags&checker.TypeFlagsBigInt != 0 ||
		flags&checker.TypeFlagsESSymbol != 0
}

// samePrimitiveBase reports whether a and b are the same primitive base
// (both string, both number, etc). Used to short-circuit `string & string`
// without firing the incompatible-primitive path.
func samePrimitiveBase(a, b *checker.Type) bool {
	mask := checker.TypeFlagsString | checker.TypeFlagsNumber | checker.TypeFlagsBoolean |
		checker.TypeFlagsBigInt | checker.TypeFlagsESSymbol
	return (a.Flags() & mask) == (b.Flags() & mask)
}

func sameLiteral(a, b *checker.Type, typeChecker *checker.Checker) bool {
	if a == b {
		return true
	}
	return typeChecker.TypeToString(a) == typeChecker.TypeToString(b)
}

func literalExtendsPrimitive(literal, primitive *checker.Type) bool {
	literalFlags := literal.Flags()
	primitiveFlags := primitive.Flags()
	switch {
	case literalFlags&checker.TypeFlagsStringLiteral != 0:
		return primitiveFlags&checker.TypeFlagsString != 0
	case literalFlags&checker.TypeFlagsNumberLiteral != 0:
		return primitiveFlags&checker.TypeFlagsNumber != 0
	case literalFlags&checker.TypeFlagsBooleanLiteral != 0:
		return primitiveFlags&checker.TypeFlagsBoolean != 0
	case literalFlags&checker.TypeFlagsBigIntLiteral != 0:
		return primitiveFlags&checker.TypeFlagsBigInt != 0
	}
	return false
}
