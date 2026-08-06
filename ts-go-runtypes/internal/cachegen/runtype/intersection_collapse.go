package runtype

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/protocol"
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
func (cache *Cache) collapseIntersection(tsType *checker.Type, node *protocol.RunType) {
	members := tsType.AsUnionOrIntersectionType().Types()

	var (
		primitiveMember *checker.Type
		literalMember   *checker.Type
		carrierMember   *checker.Type
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
			// in `object & {__rtNot?: …}` intersections. Without this case the
			// member is silently DROPPED and the collapse degrades the base to
			// unknown, deleting the kind check from the generated validator.
			memberFlags&checker.TypeFlagsNonPrimitive != 0:
			// OneOf carriers never classify: the member must serialize as its
			// plain self on every downstream path (primitive brand, builtin
			// class, object merge) — the branch semantics live on the UNION
			// node (typeid.OneOfFromMembers), never on a member. Captured
			// (not dropped) for the duplicate-branch degenerate below.
			if typeid.IsOneOfCarrierMember(cache.typeChecker, member) {
				if carrierMember == nil {
					carrierMember = member
				}
				continue
			}
			objectMembers = append(objectMembers, member)
		}
	}

	if hasNever || hasIncompatiblePrimitives {
		node.Kind = protocol.KindNever
		return
	}

	// Duplicate-branch degenerate: identical oneOf branches intern to ONE
	// arm, the union dedups away, and the carrier'd intersection stands
	// alone. Distinct-branch carriers always live under a surviving union
	// (which owns the semantics), so the standalone treatment fires ONLY
	// when the branch ids collide — then the node is the one-member union
	// with counting (count ≥ 2 always, so nothing validates: exactly what
	// duplicate branches mean). A multi-base intersection here has no
	// single child to project — never, loud over silently under-checking.
	if carrierMember != nil {
		branches := typeid.OneOfCarrierBranches(cache.typeChecker, carrierMember)
		branchNodes := make([]*protocol.RunType, 0, len(branches))
		seenIDs := map[string]bool{}
		hasDuplicate := false
		for _, branch := range branches {
			branchNode := cache.Serialize(branch)
			if seenIDs[branchNode.ID] {
				hasDuplicate = true
			}
			seenIDs[branchNode.ID] = true
			branchNodes = append(branchNodes, branchNode)
		}
		if hasDuplicate {
			var base *checker.Type
			baseCount := 0
			if primitiveMember != nil {
				base = primitiveMember
				baseCount++
			}
			if literalMember != nil {
				base = literalMember
				baseCount++
			}
			if len(objectMembers) == 1 {
				base = objectMembers[0]
				baseCount++
			} else if len(objectMembers) > 1 {
				baseCount += len(objectMembers)
			}
			if baseCount != 1 {
				node.Kind = protocol.KindNever
				return
			}
			node.Kind = protocol.KindUnion
			node.Children = append(node.Children, cache.Serialize(base))
			cache.finalizeUnion(node)
			node.OneOf = branchNodes
			return
		}
	}

	// Primitive narrowing: `string & "x"` should already be reduced by the
	// checker, but if both kinds survive we keep the literal — the literal
	// only survives the loop above when it's compatible with the primitive.
	if literalMember != nil && primitiveMember != nil {
		if !literalExtendsPrimitive(literalMember, primitiveMember) {
			node.Kind = protocol.KindNever
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
		var annotations []*protocol.FormatAnnotation
		for _, objectMember := range objectMembers {
			// Negation sentinel (`{__rtNot?: Child}`): serialize the CHILD
			// onto node.Negations — the validate/verr emit inverts its check
			// (`base && !(child)`). Never a TypeMeta decorator and never a
			// property. Twin of the `!{…}` id fold in
			// typeid/intersection_collapse.go.
			if childType := typeid.NotChildTypeFromMember(cache.typeChecker, objectMember); childType != nil {
				node.Negations = append(node.Negations, cache.Serialize(childType))
				continue
			}
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
			panic("ts-runtypes: conflicting format annotations on one intersection (" + strings.Join(names, " & ") +
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
		// Lift negation sentinels and structural format brands first
		// (`{a} & {__rtNot?: Child}`, `unknown[] & {__rtFormatName?: …}`):
		// sentinel members become Negations entries / the FormatAnnotation,
		// never merged properties (projectMembersInto skips the props by
		// name as well).
		var restMembers []*checker.Type
		var annotations []*protocol.FormatAnnotation
		for _, objectMember := range objectMembers {
			if childType := typeid.NotChildTypeFromMember(cache.typeChecker, objectMember); childType != nil {
				node.Negations = append(node.Negations, cache.Serialize(childType))
				continue
			}
			if childType, minCount, maxCount, ok := typeid.ContainsSpecFromMember(cache.typeChecker, objectMember); ok {
				node.Contains = append(node.Contains, &protocol.ContainsCheck{Child: cache.Serialize(childType), Min: minCount, Max: maxCount})
				continue
			}
			if specs, ok := typeid.PatternPropsFromMember(cache.typeChecker, objectMember); ok {
				for _, spec := range specs {
					check := &protocol.PatternPropCheck{Source: spec.Source, Value: cache.Serialize(spec.Value)}
					if spec.Key != nil {
						check.Key = cache.Serialize(spec.Key)
					}
					node.PatternProps = append(node.PatternProps, check)
				}
				continue
			}
			if childType := typeid.PropNamesChildFromMember(cache.typeChecker, objectMember); childType != nil {
				node.PropNames = cache.Serialize(childType)
				continue
			}
			if spec, isUneval := typeid.UnevalSpecFromMember(cache.typeChecker, objectMember); isUneval {
				node.Unevaluated = cache.serializeUnevaluated(spec)
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
			panic("ts-runtypes: conflicting format annotations on one intersection (" + strings.Join(names, " & ") +
				") — merging across format families is not supported yet; spell the constraints in one brand")
		}
		if restCount == 0 {
			// Every member was a sentinel — the base is `unknown` with the
			// negation(s) attached (bare JSON Schema `not`).
			node.Kind = protocol.KindUnknown
			return
		}
		if restCount == 1 &&
			(len(node.Negations) > 0 || node.FormatAnnotation != nil || len(node.Contains) > 0 ||
				len(node.PatternProps) > 0 || node.PropNames != nil) {
			// Single base ∧ sentinel(s) — `unknown[] & {__rtNot?: …}`,
			// `Record<string, unknown> & {…}`: project the BASE as itself
			// (array / record / class / tuple), negations attached. Routing
			// it through the merged-property path would surface the array's
			// interface members as an objectLiteral. The bare `object`
			// keyword is not a TypeFlagsObject type — project it directly
			// (projectObjectType would misroute it).
			if soleRest.Flags()&checker.TypeFlagsNonPrimitive != 0 {
				node.Kind = protocol.KindObject
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
				node.Kind = protocol.KindNever
				return
			}
			cache.projectMergedTuple(picks, node)
			return
		}
		node.Kind = protocol.KindObjectLiteral
		properties := cache.typeChecker.GetPropertiesOfType(tsType)
		callSignatures := cache.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
		cache.projectMembersInto(tsType, node, properties, callSignatures, false)
		return
	}

	// Fully reduced to any/unknown — pick unknown as a safe fallback.
	node.Kind = protocol.KindUnknown
}

// serializeUnevaluated turns the raw sentinel payload into the protocol shape,
// serializing each guard subschema (and the leftover value) as a child node.
// Twin of the id side's unevaluatedKey — the two must read the same fields in
// the same order or a cache entry and its id part company.
func (cache *Cache) serializeUnevaluated(spec typeid.UnevalSpec) *protocol.UnevaluatedCheck {
	check := &protocol.UnevaluatedCheck{Keys: spec.Keys, Sources: spec.Sources, Prefix: spec.Prefix}
	// A `never` value is the `false` reading — nothing satisfies it, so the
	// sweep rejects rather than checking, and the node carries no child.
	if spec.Value != nil && spec.Value.Flags()&checker.TypeFlagsNever == 0 {
		check.Value = cache.Serialize(spec.Value)
	}
	for _, group := range spec.Groups {
		entry := &protocol.UnevalGroup{
			WhenKey: group.WhenKey,
			Keys:    group.Keys,
			Sources: group.Sources,
			Prefix:  group.Prefix,
			All:     group.All,
		}
		if group.When != nil {
			entry.When = cache.Serialize(group.When)
		}
		if group.WhenNot != nil {
			entry.WhenNot = cache.Serialize(group.WhenNot)
		}
		check.Groups = append(check.Groups, entry)
	}
	return check
}

// projectMergedTuple builds the tuple node for a slot-wise tuple ∩ tuple
// merge — the member construction mirrors serialize.go:projectTuple (same
// TupleMember wrappers, same unique member-id discipline) so the merged
// node is indistinguishable from the equivalent hand-written tuple's.
func (cache *Cache) projectMergedTuple(picks []typeid.TupleMergePick, node *protocol.RunType) {
	node.Kind = protocol.KindTuple
	for i, pick := range picks {
		position := i
		// Optional slots resolve through serializeOptionalChild, exactly as
		// projectTuple does — picks carry RAW slot types by contract.
		var elementChild *protocol.RunType
		if pick.Optional {
			elementChild = cache.serializeOptionalChild(pick.Type)
		} else {
			elementChild = cache.Serialize(pick.Type)
		}
		member := &protocol.RunType{
			Kind:     protocol.KindTupleMember,
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
		memberID, err := cache.uniqueDict(structural, cache.opts.hashLength())
		if err != nil {
			memberID = "x_tm_" + structural
		}
		member.ID = memberID
		cache.intern(structural, memberID)
		cache.putNode(memberID, member)
		node.Children = append(node.Children, protocol.NewRef(memberID))
	}
}

// projectPrimitiveInto fills `node` with the kind+literal data for a
// primitive or literal member. Mirrors the relevant arms of projectType's
// switch, but writes into an already-allocated node so the caller can keep
// the original id + add decorators on top.
func (cache *Cache) projectPrimitiveInto(tsType *checker.Type, node *protocol.RunType) {
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsStringLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = tsType.AsLiteralType().Value()
	case flags&checker.TypeFlagsNumberLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = parseNumberLiteral(cache.typeChecker.TypeToString(tsType))
	case flags&checker.TypeFlagsBooleanLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = cache.typeChecker.TypeToString(tsType) == "true"
	case flags&checker.TypeFlagsBigIntLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = fmt.Sprintf("%v", tsType.AsLiteralType().Value())
		node.Flags = append(node.Flags, "bigint")
	case flags&checker.TypeFlagsString != 0:
		node.Kind = protocol.KindString
	case flags&checker.TypeFlagsNumber != 0:
		node.Kind = protocol.KindNumber
	case flags&checker.TypeFlagsBoolean != 0:
		node.Kind = protocol.KindBoolean
	case flags&checker.TypeFlagsBigInt != 0:
		node.Kind = protocol.KindBigInt
	case flags&checker.TypeFlagsESSymbol != 0:
		node.Kind = protocol.KindSymbol
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
func splitBuiltinClassBrand(typeChecker *checker.Checker, objectMembers []*checker.Type) (*checker.Type, *protocol.FormatAnnotation) {
	var classMember *checker.Type
	var annotation *protocol.FormatAnnotation
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
