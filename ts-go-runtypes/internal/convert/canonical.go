// canonical.go — the C6 no-info-loss oracle's projection: a declaration's
// resolved reflection graph rendered as canonical JSON, so two conversion
// legs can be compared for INFORMATION equality beyond the structural id
// (which ignores fields like Description and DefaultVal by design).
//
// The projection keeps every information-carrying field and drops exactly the
// authoring-trail / derived ones:
//
//   - TypeName / TypeArguments — the authoring alias trail (an inline shape
//     and its named twin are the same type);
//   - Extends / ExtendsArguments / Implements — declaration heritage; the
//     checker already merged the members into Children, and the type target
//     prints aliases, not interfaces;
//   - Family / NotSupported / IsSafeName / IsCircular — populated by derived
//     passes from the fields that ARE compared;
//   - SafeUnionChildren / UnionDiscriminators — serialize-time derivations of
//     Children;
//   - Position — the parent slice order carries it;
//   - ID — replaced by first-visit ordinals so interning ids never leak in
//     (C2 already pins id equality);
//   - UNION member order (Children / OneOf on a union node) — the id folds
//     unions order-insensitively and the checker reorders members between
//     sessions, so canonical children sort by their own canonical text.
//
// A field added to reflection.RunType must be classified here — the
// TestCanonicalCoversRunType tripwire fails until it is.
package convert

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/microsoft/typescript-go/shim/checker"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// CanonicalGraph renders node's resolved graph as canonical JSON.
func CanonicalGraph(node *reflection.RunType, resolve func(id string) *reflection.RunType) (string, error) {
	builder := &canonicalBuilder{resolve: resolve, ordinals: map[string]string{}}
	projected := builder.walk(node)
	rendered, marshalErr := json.Marshal(projected)
	if marshalErr != nil {
		return "", marshalErr
	}
	return string(rendered), nil
}

type canonicalBuilder struct {
	resolve  func(id string) *reflection.RunType
	ordinals map[string]string
	counter  int
}

func (builder *canonicalBuilder) walk(node *reflection.RunType) *reflection.RunType {
	if node != nil && node.Kind == reflection.KindRef && builder.resolve != nil {
		if resolved := builder.resolve(node.ID); resolved != nil {
			node = resolved
		}
	}
	if node == nil {
		return nil
	}
	if node.ID != "" {
		if ordinal, seen := builder.ordinals[node.ID]; seen {
			return &reflection.RunType{Kind: reflection.KindRef, ID: ordinal}
		}
		builder.ordinals[node.ID] = fmt.Sprintf("n%d", builder.counter)
	}
	ordinal := fmt.Sprintf("n%d", builder.counter)
	builder.counter++
	out := &reflection.RunType{
		ID:               ordinal,
		Kind:             node.Kind,
		SubKind:          node.SubKind,
		Name:             node.Name,
		Optional:         node.Optional,
		Readonly:         node.Readonly,
		NonEnumerable:    node.NonEnumerable,
		Visibility:       node.Visibility,
		IsAbstract:       node.IsAbstract,
		IsStatic:         node.IsStatic,
		Literal:          node.Literal,
		DefaultVal:       node.DefaultVal,
		Flags:            node.Flags,
		Description:      node.Description,
		FormatAnnotation: node.FormatAnnotation,
		EnumVal:          node.EnumVal,
		Values:           node.Values,
		ClassRef:         node.ClassRef,
		Overrides:        node.Overrides,
	}
	out.Child = builder.walk(node.Child)
	out.Index = builder.walk(node.Index)
	out.Return = builder.walk(node.Return)
	out.IndexT = builder.walk(node.IndexT)
	out.Parameters = builder.walkSlice(node.Parameters)
	childrenSlots := node.Children
	oneOfSlots := node.OneOf
	if node.Kind == reflection.KindUnion {
		childrenSlots = builder.sortSlots(childrenSlots)
		oneOfSlots = builder.sortSlots(oneOfSlots)
	}
	out.Children = builder.walkSlice(childrenSlots)
	out.Arguments = builder.walkSlice(node.Arguments)
	out.TypeMeta = builder.walkSlice(node.TypeMeta)
	out.Negations = builder.walkSlice(node.Negations)
	for _, containsCheck := range node.Contains {
		if containsCheck == nil {
			continue
		}
		out.Contains = append(out.Contains, &reflection.ContainsCheck{
			Child: builder.walk(containsCheck.Child), Min: containsCheck.Min, Max: containsCheck.Max})
	}
	for _, patternProp := range node.PatternProps {
		if patternProp == nil {
			continue
		}
		out.PatternProps = append(out.PatternProps, &reflection.PatternPropCheck{
			Source: patternProp.Source, Key: builder.walk(patternProp.Key), Value: builder.walk(patternProp.Value)})
	}
	out.PropNames = builder.walkSlice(node.PropNames)
	out.OneOf = builder.walkSlice(oneOfSlots)
	for _, unevaluated := range node.Unevaluated {
		if unevaluated == nil {
			continue
		}
		copied := &reflection.UnevaluatedCheck{
			Value: builder.walk(unevaluated.Value), Keys: unevaluated.Keys,
			Sources: unevaluated.Sources, Prefix: unevaluated.Prefix}
		for _, group := range unevaluated.Groups {
			if group == nil {
				continue
			}
			copied.Groups = append(copied.Groups, &reflection.UnevalGroup{
				When: builder.walk(group.When), WhenNot: builder.walk(group.WhenNot),
				WhenKey: group.WhenKey, Keys: group.Keys, Sources: group.Sources,
				Prefix: group.Prefix, All: group.All})
		}
		out.Unevaluated = append(out.Unevaluated, copied)
	}
	return out
}

func (builder *canonicalBuilder) walkSlice(slots []*reflection.RunType) []*reflection.RunType {
	var out []*reflection.RunType
	for _, slot := range slots {
		if walked := builder.walk(slot); walked != nil {
			out = append(out, walked)
		}
	}
	return out
}

// sortSlots orders slots by each slot's OWN canonical text (computed with a
// fresh builder so sibling order cannot leak into the key through the
// ordinal counter). Sorting must happen BEFORE the real walk assigns
// ordinals, or the pre-sort visit order would still leak.
func (builder *canonicalBuilder) sortSlots(slots []*reflection.RunType) []*reflection.RunType {
	if len(slots) < 2 {
		return slots
	}
	type keyedSlot struct {
		slot *reflection.RunType
		key  string
	}
	keyed := make([]keyedSlot, 0, len(slots))
	for _, slot := range slots {
		key, keyErr := CanonicalGraph(slot, builder.resolve)
		if keyErr != nil {
			key = ""
		}
		keyed = append(keyed, keyedSlot{slot: slot, key: key})
	}
	sort.SliceStable(keyed, func(a, b int) bool { return keyed[a].key < keyed[b].key })
	out := make([]*reflection.RunType, 0, len(keyed))
	for _, entry := range keyed {
		out = append(out, entry.slot)
	}
	return out
}

// DeclarationGraphs is the C6 oracle's read side: every recognized
// (non-generic) declaration's canonical graph, keyed like DeclarationIDs.
func DeclarationGraphs(prog *program.Program, typeChecker *checker.Checker, cache *runtype.Cache, fs vfspkg.FS, absPath string) (map[string]string, error) {
	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		return nil, fmt.Errorf("convert: source file not in program: %s", absPath)
	}
	graphs := map[string]string{}
	for _, decl := range recognizeFile(sourceFile, typeChecker, fs) {
		if decl.Generic {
			continue
		}
		resolved, resolveErr := resolveDecl(typeChecker, cache, decl)
		if resolveErr != nil {
			return nil, resolveErr
		}
		canonical, canonicalErr := CanonicalGraph(resolved.Node, resolved.Resolve)
		if canonicalErr != nil {
			return nil, canonicalErr
		}
		graphs[declLabel(decl)] = canonical
	}
	return graphs, nil
}
