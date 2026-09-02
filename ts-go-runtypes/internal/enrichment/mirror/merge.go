package mirror

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// variableDeclarations returns the VariableDeclaration nodes of a
// VariableStatement.
func variableDeclarations(statement *ast.Node) []*ast.Node {
	declaration := statement.AsVariableStatement().DeclarationList
	if declaration == nil {
		return nil
	}
	list := declaration.AsVariableDeclarationList()
	if list == nil || list.Declarations == nil {
		return nil
	}
	return list.Declarations.Nodes
}

// objectView is a parsed object-literal over some source text, giving the merge
// per-property access by key. text is the FULL source the node was parsed from
// (the existing file bytes, or the synthetic `const _ = <body>;` for a desired
// skeleton); byte offsets index into it.
type objectView struct {
	text       string
	node       *ast.Node // ObjectLiteralExpression
	sourceFile *ast.SourceFile
	props      map[string]*propView // field + meta properties by key
	order      []string             // property keys in declaration order
}

// propView is one property assignment inside an object literal.
type propView struct {
	key string
	// keyStart / keyEnd bound the key IDENTIFIER (trivia-trimmed), so a rename
	// splice replaces only the key and leaves the value bytes untouched.
	keyStart int
	keyEnd   int
	// propStart / propEnd bound the WHOLE property (trivia-trimmed key start →
	// initializer end), used to comment out a dropped field or slice an added
	// field's text.
	propStart int
	propEnd   int
	// fullStart is the property node's raw Pos() — the end of the PREVIOUS token,
	// so the span [fullStart, propStart) holds this property's leading trivia
	// (whitespace + any leading line/block comment). A drop/replace folds that
	// leading comment INTO the carcass (see carcassStart) so --prune removes it
	// cleanly instead of leaving it dangling above the next field.
	fullStart int
	value     *ast.Node // the initializer expression
}

// isObject reports whether this property's value is itself an object literal
// (the merge recurses into it) rather than a leaf.
func (prop *propView) isObject() bool {
	return prop.value != nil && ast.IsObjectLiteralExpression(prop.value)
}

// newObjectView wraps an ObjectLiteralExpression node parsed from text. The
// caller supplies the sourceFile for trivia-trimmed key starts.
func newObjectView(text string, sourceFile *ast.SourceFile, node *ast.Node) *objectView {
	view := &objectView{text: text, node: node, sourceFile: sourceFile, props: map[string]*propView{}}
	if node == nil || !ast.IsObjectLiteralExpression(node) {
		return view
	}
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if property == nil || !ast.IsPropertyAssignment(property) {
			continue
		}
		assignment := property.AsPropertyAssignment()
		nameNode := property.Name()
		if nameNode == nil || assignment.Initializer == nil {
			continue
		}
		key := nameNode.Text()
		keyStart := scanner.GetTokenPosOfNode(nameNode, sourceFile, false)
		propStart := scanner.GetTokenPosOfNode(property, sourceFile, false)
		prop := &propView{
			key:       key,
			keyStart:  keyStart,
			keyEnd:    nameNode.End(),
			propStart: propStart,
			propEnd:   property.End(),
			fullStart: property.Pos(),
			value:     assignment.Initializer,
		}
		if _, seen := view.props[key]; !seen {
			view.order = append(view.order, key)
		}
		view.props[key] = prop
	}
	return view
}

// fieldKeys returns the DATA-field keys (non-meta) of an object view, in
// declaration order. Meta keys (rt$label, rt$errors, pool, …) belong to the node
// itself and are never merged as fields.
func (view *objectView) fieldKeys(metaKeys map[string]bool) []string {
	out := make([]string, 0, len(view.order))
	for _, key := range view.order {
		if metaKeys[key] || strings.HasPrefix(key, "rt$") {
			continue // an rt$-prefixed key is always meta, never a data field (the
			// prefix is RESERVED — FT011/MD011; a plain $-key is an ordinary field)
		}
		out = append(out, key)
	}
	return out
}

// parseDesiredObject parses an emitted skeleton BODY (an object-literal text,
// no `export const … =` wrapper) into an objectView by wrapping it as
// `const _ = <body>;`. Returns nil when the body is not an object literal.
func parseDesiredObject(body string) *objectView {
	wrapped := "const _ = " + body + ";\n"
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: "/desired.ts", Path: tspath.Path("/desired.ts")},
		wrapped,
		core.ScriptKindTS,
	)
	if sourceFile == nil {
		return nil
	}
	node := desiredInitializer(sourceFile)
	if node == nil || !ast.IsObjectLiteralExpression(node) {
		return nil
	}
	return newObjectView(wrapped, sourceFile, node)
}

// desiredInitializer returns the initializer of the synthetic `const _ = …`.
func desiredInitializer(sourceFile *ast.SourceFile) *ast.Node {
	root := sourceFile.AsNode()
	if root == nil {
		return nil
	}
	for _, statement := range root.Statements() {
		if statement == nil || !ast.IsVariableStatement(statement) {
			continue
		}
		for _, declaration := range variableDeclarations(statement) {
			if !ast.IsVariableDeclaration(declaration) {
				continue
			}
			if initializer := declaration.AsVariableDeclaration().Initializer; initializer != nil {
				return initializer
			}
		}
	}
	return nil
}

// mergeCtx threads the reconcile's per-merge state through the recursive walk:
// the family reserved-key set, the current dotted PATH PREFIX (for @rtIds
// lookups in nested objects), and the existing + desired @rtIds child-id maps
// (Tier-2 rename identity). The two child-id maps are the const's full @rtIds
// (existing-side parsed from the marker, desired-side from named.ChildIDs),
// keyed by full dotted path.
type mergeCtx struct {
	metaKeys      map[string]bool
	pathPrefix    string
	existingChild map[string]string
	desiredChild  map[string]string
	// friendlyFamily is true for friendly-family mirrors (the source-language
	// mirror AND every i18n locale file). The friendly family reconciles the
	// kind-specific vocabulary granularly (mergeErrorsNode adds/orphans
	// individual constraint keys), so a kept field whose child TYPE ID changed
	// can MERGE in place when its structural template still matches — the
	// authored rt$label / still-declared error keys survive, only the vanished
	// constraint keys carcass. Mock mirrors keep the whole-field replace: their
	// kind-specific config rides RESERVED keys the merge never drops, so an
	// in-place merge would let a stale (e.g. number-range) config silently ride
	// the new type.
	friendlyFamily bool
}

// childPath joins the ctx prefix with a field key (root prefix is "").
func (ctx mergeCtx) childPath(key string) string {
	if ctx.pathPrefix == "" {
		return key
	}
	return ctx.pathPrefix + "." + key
}

// descend returns a child ctx for a nested object field, extending the path.
func (ctx mergeCtx) descend(key string) mergeCtx {
	child := ctx
	child.pathPrefix = ctx.childPath(key)
	return child
}

// mergeObject merges one desired object view INTO one existing object view,
// appending splice ops against the existing file bytes. It is recursive: the
// rename pass runs FIRST over the raw drop/add sets (pairing a uniquely-matched
// drop↔add by child identity → a key-only splice that carries the old value);
// then a field present in both AS OBJECTS recurses, a field present in both as
// leaves is left byte-identical (the author's value survives), a desired-only
// field is ADDED (inserted skeleton), and an existing-only field is ORPHANED
// (commented out with @rtOrphanChild).
func mergeObject(ops *[]spliceOp, existing, desired *objectView, ctx mergeCtx) {
	existingFields := keySet(existing.fieldKeys(ctx.metaKeys))
	desiredFields := keySet(desired.fieldKeys(ctx.metaKeys))

	// RENAME pass: pair an existing-only DROP with a desired-only ADD that share a
	// unique child identity. A matched pair becomes a key-only splice (old value
	// bytes untouched) and both keys leave the drop/add sets.
	renamePairs := computeRenames(existing, desired, existingFields, desiredFields, ctx)
	renamedExisting := map[string]bool{}
	renamedDesired := map[string]bool{}
	for oldKey, newKey := range renamePairs {
		oldProp := existing.props[oldKey]
		if oldProp == nil {
			continue
		}
		*ops = append(*ops, spliceOp{start: oldProp.keyStart, end: oldProp.keyEnd, text: renderKey(newKey)})
		renamedExisting[oldKey] = true
		renamedDesired[newKey] = true
	}

	// KEEP / RECURSE / REPLACE for fields present in both (excluding renamed
	// pairs, handled above as a key swap with no recursion — a rename preserves
	// the old value). A kept key whose SHAPE changed (existing object vs desired
	// leaf, or vice versa) is REPLACED IN PLACE: the stale value is
	// orphan-childed (preserved verbatim) and the fresh desired skeleton is
	// spliced in right after it, so the value never silently mismatches the new
	// type. Both halves ride a single splice op over the property's range, so the
	// field keeps its position and there is no anchor/separator interaction.
	//
	// A kept key whose CHILD TYPE changed (its @rtIds childID differs) splits by
	// family. Mock mirrors always replace (`age: number`→`age: string` must not
	// leave a number-range config riding the string field — the A4 regression).
	// Friendly-family mirrors replace ONLY when the structural template also
	// changed (a string field growing rt$items, a Map losing rt$keys …): for a
	// same-template change (a format param added/dropped — the id folds them),
	// the field MERGES in place instead, so authored leaves that still exist in
	// the new shape (rt$label, the `type` message, still-declared constraint
	// keys) survive and mergeErrorsNode carcasses exactly the vanished keys.
	// Without this, re-typing a field nuked its whole translation subtree into
	// an @rtOrphanChild carcass and re-scaffolded blanks (the i18n fuzz T3
	// finding).
	for key := range existingFields {
		if renamedExisting[key] {
			continue
		}
		if !desiredFields[key] {
			continue
		}
		existingProp := existing.props[key]
		desiredProp := desired.props[key]
		if existingProp == nil || desiredProp == nil {
			continue
		}
		childPath := ctx.childPath(key)
		bothObjects := existingProp.isObject() && desiredProp.isObject()
		mergeAcrossTypeChange := ctx.friendlyFamily && bothObjects &&
			sameStructuralTemplate(existing, desired, existingProp, desiredProp)
		if shapeMismatch(existingProp, desiredProp) || (childTypeChanged(ctx, childPath) && !mergeAcrossTypeChange) {
			*ops = append(*ops, replaceChildOp(existing, desired, key))
			continue
		}
		if bothObjects {
			childExisting := newObjectView(existing.text, existing.sourceFile, existingProp.value)
			childDesired := newObjectView(desired.text, desired.sourceFile, desiredProp.value)
			mergeObject(ops, childExisting, childDesired, ctx.descend(key))
		}
		// Leaf-in-both, same child type: leave the existing bytes untouched.
	}

	// ADD: a desired-only field, inserted as a fresh skeleton property at the end
	// of the existing object (before its closing brace).
	var addKeys []string
	for key := range desiredFields {
		if existingFields[key] || renamedDesired[key] {
			continue
		}
		addKeys = append(addKeys, key)
	}
	sort.Strings(addKeys)
	if len(addKeys) > 0 {
		*ops = append(*ops, insertFieldsOp(existing, desired, addKeys))
	}

	// DROP: an existing-only field, commented out in place with @rtOrphanChild.
	var dropKeys []string
	for key := range existingFields {
		if desiredFields[key] || renamedExisting[key] {
			continue
		}
		dropKeys = append(dropKeys, key)
	}
	sort.Strings(dropKeys)
	for _, key := range dropKeys {
		*ops = append(*ops, orphanChildOp(existing, existing.props[key]))
	}

	// META-RECURSE: the structural meta nodes (rt$items array element, rt$keys/rt$values
	// Map/Set element, rt$slots tuple slots) carry NESTED enrichment shapes that are
	// NOT data fields — so they are excluded from the field merge above, yet they
	// still drift when the underlying element type gains a sub-field. Descend into
	// them so nested enrichment is merged like any other object. Scalar meta
	// (rt$length/rt$size/rt$optional and the like) is author data, left untouched.
	mergeMetaNodes(ops, existing, desired, ctx)

	// $ERRORS DESCENT (every friendly-family mirror — source language AND each
	// locale): scaffold a @todo blank for every constraint key the type adds and
	// orphan the recognized ones it drops, so a new constraint never renders
	// silently unstyled and a plural arm always has an attachment point.
	mergeErrorsNode(ops, existing, desired, ctx)
}

// mergeErrorsNode descends one level into a node's `rt$errors` record — present
// and object-form on BOTH sides. Constraint keys are a fixed vocabulary, so
// there is NO rename pass at this level:
//
//   - a `rt$default`-only record on EITHER side is skipped whole: the author
//     opted into the exclusive catch-all mode (or the project scaffolds it —
//     tsconfig friendlyErrors: "default"), and a mode is author-owned;
//   - a key in both, object-form on both sides → plural merge (locale-owned arms);
//   - a key in both otherwise → kept byte-identical (an authored leaf is never
//     edited; a hand-diverged string↔object KIND is also kept — the author owns
//     their leaf's kind, `check` reports the drift);
//   - a desired-only key (the type added a constraint) → inserted as the
//     desired @todo blank (string, or a plural with the file-locale's arms);
//   - an existing-only key the type dropped → @rtOrphanChild carcass, but ONLY
//     for recognized constraint names (knownConstraintKeys): an author-added
//     key we can't attribute to the type is never touched (TS flags typos).
func mergeErrorsNode(ops *[]spliceOp, existing, desired *objectView, ctx mergeCtx) {
	existingProp := existing.props["rt$errors"]
	desiredProp := desired.props["rt$errors"]
	if existingProp == nil || desiredProp == nil {
		return
	}
	if !existingProp.isObject() || !desiredProp.isObject() {
		return // exotic value on either side — opaque, never merged
	}
	existingErrors := newObjectView(existing.text, existing.sourceFile, existingProp.value)
	desiredErrors := newObjectView(desired.text, desired.sourceFile, desiredProp.value)
	if isDefaultOnly(existingErrors) || isDefaultOnly(desiredErrors) {
		return // the exclusive rt$default mode — author-owned, nothing to sync
	}

	var addKeys []string
	for _, key := range desiredErrors.order {
		existingKey := existingErrors.props[key]
		if existingKey == nil {
			addKeys = append(addKeys, key)
			continue
		}
		desiredKey := desiredErrors.props[key]
		if existingKey.isObject() && desiredKey.isObject() {
			mergePluralObject(ops, existingErrors, desiredErrors, key)
		}
		// Same key, any other kind pairing: keep the existing bytes verbatim.
	}
	sort.Strings(addKeys)
	if len(addKeys) > 0 {
		*ops = append(*ops, insertFieldsOp(existingErrors, desiredErrors, addKeys))
	}

	var dropKeys []string
	for _, key := range existingErrors.order {
		if desiredErrors.props[key] == nil && knownConstraintKeys[key] {
			dropKeys = append(dropKeys, key)
		}
	}
	sort.Strings(dropKeys)
	for _, key := range dropKeys {
		*ops = append(*ops, orphanChildOp(existingErrors, existingErrors.props[key]))
	}
}

// isDefaultOnly reports whether an `rt$errors` record is the exclusive
// `{rt$default: '…'}` catch-all mode (its ONLY key is rt$default).
func isDefaultOnly(errors *objectView) bool {
	return len(errors.order) == 1 && errors.props["rt$default"] != nil
}

// knownConstraintKeys are the `rt$errors` keys attributable to the TYPE — the
// failable format param names across every format family, plus the base
// `type` failure. The descent orphans an existing-only key ONLY when it is in
// this catalog (the type declared it once and no longer does); anything else
// is author-owned and untouched.
var knownConstraintKeys = map[string]bool{
	"type": true,
	// string family
	"minLength": true, "maxLength": true, "length": true, "pattern": true,
	"allowedChars": true, "disallowedChars": true, "allowedValues": true, "disallowedValues": true,
	// number / bigint family
	"min": true, "max": true, "lt": true, "gt": true,
	"integer": true, "float": true, "multipleOf": true,
	// datetime family + uuid
	"date": true, "time": true, "splitChar": true, "version": true,
}

// mergePluralObject merges one plural template (a count-bearing constraint's
// object leaf) with the ASYMMETRIC-PLURAL rule: arms are LOCALE-OWNED. An arm
// the translation has beyond the target set is NEVER orphaned and NEVER
// rename-paired (a dropped `one` must not relabel into an added `few`); an arm
// the translator PRUNED stays pruned (their language, their call) — only the
// mandatory `other` backstop is ever re-inserted; a filled arm is kept
// byte-identical. The source's arm set never down-scopes the translation's.
func mergePluralObject(ops *[]spliceOp, existingErrors, desiredErrors *objectView, key string) {
	existingPlural := newObjectView(existingErrors.text, existingErrors.sourceFile, existingErrors.props[key].value)
	desiredPlural := newObjectView(desiredErrors.text, desiredErrors.sourceFile, desiredErrors.props[key].value)

	if existingPlural.props["other"] == nil && desiredPlural.props["other"] != nil {
		*ops = append(*ops, insertFieldsOp(existingPlural, desiredPlural, []string{"other"}))
	}
	// Existing-only arms: kept (locale-owned); arms in both: kept byte-identical;
	// desired-only arms beyond `other`: never forced onto a pruned set.
}

// objectMetaKeys are the meta keys whose VALUE is itself an object node carrying
// a nested enrichment shape — the merge descends into each (existing↔desired)
// the same way it recurses a data field. rt$keys/rt$values/rt$items appear on
// Map/Set/array nodes. rt$slots is handled separately (it is an ARRAY of nodes).
var objectMetaKeys = []string{"rt$items", "rt$keys", "rt$values"}

// mergeMetaNodes recurses through the structural meta nodes of a pair of object
// views: each object-valued meta key (rt$items/rt$keys/rt$values) is merged in place
// when present-and-object on both sides, and rt$slots is walked positionally
// (paired by index, each slot recursed). It never adds/drops/renames meta keys —
// only descends into the ones present on both sides — so the node's own shape is
// owned by the emitter, not the merge.
func mergeMetaNodes(ops *[]spliceOp, existing, desired *objectView, ctx mergeCtx) {
	for _, metaKey := range objectMetaKeys {
		existingProp := existing.props[metaKey]
		desiredProp := desired.props[metaKey]
		if existingProp == nil || desiredProp == nil {
			continue
		}
		if !existingProp.isObject() || !desiredProp.isObject() {
			continue // a leaf meta value (e.g. `rt$items: {pool: []}` is an object; a
			// non-object would be author scalar data) — nothing to recurse
		}
		childExisting := newObjectView(existing.text, existing.sourceFile, existingProp.value)
		childDesired := newObjectView(desired.text, desired.sourceFile, desiredProp.value)
		mergeObject(ops, childExisting, childDesired, ctx.descend(metaKey))
	}
	mergeSlots(ops, existing, desired, ctx)
}

// mergeSlots walks a tuple's `rt$slots` array positionally: it pairs existing slot
// i with desired slot i and recurses each (when both are objects). Slots are
// fixed-position, so a length change (a slot added/removed) is left to the
// emitter on regenerate — we only merge the overlap (the shorter length), never
// inserting or dropping array elements (which would shift positions). The dotted
// path segment matches the emitter's `rt$slots.<i>` convention for @rtIds lookups.
func mergeSlots(ops *[]spliceOp, existing, desired *objectView, ctx mergeCtx) {
	existingProp := existing.props["rt$slots"]
	desiredProp := desired.props["rt$slots"]
	if existingProp == nil || desiredProp == nil {
		return
	}
	existingSlots := arrayElementNodes(existingProp.value)
	desiredSlots := arrayElementNodes(desiredProp.value)
	n := len(existingSlots)
	if len(desiredSlots) < n {
		n = len(desiredSlots)
	}
	for i := 0; i < n; i++ {
		existingSlot, desiredSlot := existingSlots[i], desiredSlots[i]
		if existingSlot == nil || desiredSlot == nil {
			continue
		}
		if !ast.IsObjectLiteralExpression(existingSlot) || !ast.IsObjectLiteralExpression(desiredSlot) {
			continue // a leaf slot — no nested shape to merge
		}
		childExisting := newObjectView(existing.text, existing.sourceFile, existingSlot)
		childDesired := newObjectView(desired.text, desired.sourceFile, desiredSlot)
		mergeObject(ops, childExisting, childDesired, ctx.descend("rt$slots."+strconv.Itoa(i)))
	}
}

// arrayElementNodes returns the element expression nodes of an array-literal
// node, or nil when node is not an array literal.
func arrayElementNodes(node *ast.Node) []*ast.Node {
	if node == nil || !ast.IsArrayLiteralExpression(node) {
		return nil
	}
	return node.AsArrayLiteralExpression().Elements.Nodes
}

// childTypeChanged reports whether the @rtIds child id at childPath differs
// between the existing and desired maps. Both ids must be present and non-empty
// to be a real change — a MISSING id on either side is "unknown", and we never
// replace on uncertainty (the field is kept / recursed as before).
func childTypeChanged(ctx mergeCtx, childPath string) bool {
	existingID := ctx.existingChild[childPath]
	desiredID := ctx.desiredChild[childPath]
	if existingID == "" || desiredID == "" {
		return false
	}
	return existingID != desiredID
}

// shapeMismatch reports whether a kept key changed object↔leaf shape: existing
// is an object literal but desired is a leaf (identifier/reference/literal), or
// vice versa. Such a field cannot be merged in place — the old value's shape no
// longer matches the desired type, so it is replaced (orphan + fresh skeleton).
func shapeMismatch(existingProp, desiredProp *propView) bool {
	return existingProp.isObject() != desiredProp.isObject()
}

// sameStructuralTemplate reports whether two object-form field values carry the
// SAME structural meta-node skeleton — the presence set of rt$items / rt$keys /
// rt$values / rt$slots. Matching skeletons mean the two enrichment templates
// nest the same way, so a friendly-family field can merge across a child-type
// change (the granular walks — data fields, meta nodes, rt$errors keys — each
// reconcile their own level). A differing skeleton (string→array grows
// rt$items, Map→Set drops rt$keys) has no positionwise merge, so the caller
// replaces the field whole.
func sameStructuralTemplate(existing, desired *objectView, existingProp, desiredProp *propView) bool {
	childExisting := newObjectView(existing.text, existing.sourceFile, existingProp.value)
	childDesired := newObjectView(desired.text, desired.sourceFile, desiredProp.value)
	for _, metaKey := range append([]string{"rt$slots"}, objectMetaKeys...) {
		if (childExisting.props[metaKey] != nil) != (childDesired.props[metaKey] != nil) {
			return false
		}
	}
	return true
}

// replaceChildOp replaces a kept-but-changed field in place: it orphan-childs the
// stale property (preserving its authored value verbatim inside an
// @rtOrphanChild comment, with its trailing comma swallowed) and splices the
// fresh desired skeleton immediately after — `/* @rtOrphanChild old, */ key:
// newValue,` — so the field keeps its position and the literal stays valid. A
// reappearing identical type later re-merges in place (the stale carcass is
// pruned separately).
func replaceChildOp(existing, desired *objectView, key string) spliceOp {
	prop := existing.props[key]
	desiredProp := desired.props[key]
	if prop == nil || desiredProp == nil {
		return spliceOp{}
	}
	end := prop.propEnd
	// Swallow a single trailing comma so the orphaned carcass + the fresh property
	// own exactly one separator (the fresh property's own trailing comma).
	for cursor := end; cursor < len(existing.text); cursor++ {
		if existing.text[cursor] == ',' {
			end = cursor + 1
			break
		}
		if !isSpaceByte(existing.text[cursor]) {
			break
		}
	}
	original := existing.text[prop.propStart:end]
	newValue := strings.TrimSpace(desired.text[desiredProp.value.Pos():desiredProp.value.End()])
	replacement := "/* " + OrphanChildTag + " " + sanitizeForComment(original) + " */ " + renderKey(key) + ": " + newValue + ","
	return spliceOp{start: prop.propStart, end: end, text: replacement}
}

// insertFieldsOp builds one insertion op that appends every added field's fresh
// desired skeleton at the end of the existing object literal (just before the
// closing `}`). Indentation matches the existing object's first property; a
// trailing comma keeps the literal valid.
func insertFieldsOp(existing, desired *objectView, addKeys []string) spliceOp {
	indent := existingIndent(existing)
	anchor := insertionAnchor(existing)

	var b strings.Builder
	// Separator guard: each added field carries a TRAILING comma, so it relies on
	// the previous property already ending in one. A Prettier-collapsed single-line
	// object (`{rt$label: '', name: {…}}`) drops the trailing comma on its last
	// property, so scan back over whitespace to the previous non-space byte — if it
	// is neither `,` (already separated) nor `{` (the object is empty, no separator
	// needed), prepend a leading comma so the inserted block stays valid.
	if needsLeadingSeparator(existing.text, anchor) {
		b.WriteString(",")
	}
	for _, key := range addKeys {
		desiredProp := desired.props[key]
		if desiredProp == nil {
			continue
		}
		valueText := strings.TrimSpace(desired.text[desiredProp.value.Pos():desiredProp.value.End()])
		b.WriteString("\n")
		b.WriteString(indent)
		b.WriteString(renderKey(key))
		b.WriteString(": ")
		b.WriteString(valueText)
		b.WriteString(",")
	}
	return spliceOp{start: anchor, end: anchor, text: b.String()}
}

// orphanChildOp comments out a dropped property in place, tagging it
// @rtOrphanChild and preserving its authored value (with its trailing comma)
// verbatim inside the block comment — so --prune can later remove it, or a
// reappearing field can restore it. The replace range SWALLOWS the property's
// trailing comma so no dangling `,` is left behind (which would be a syntax
// error); the comment then sits cleanly between the surviving siblings'
// separators.
//
// The range START is folded back over the property's LEADING comment (a `//`
// note or `/* … */` block the author wrote above the field). That comment
// describes the now-dropped field, so it belongs INSIDE the carcass — folding it
// in keeps it byte-preserved for a later restore AND lets --prune remove it
// cleanly, instead of leaving it dangling above the surviving sibling (C3 at the
// field level).
func orphanChildOp(existing *objectView, prop *propView) spliceOp {
	if prop == nil {
		return spliceOp{}
	}
	start := carcassFoldStart(existing.text, prop)
	end := prop.propEnd
	// Swallow a single trailing comma immediately after the property.
	for cursor := end; cursor < len(existing.text); cursor++ {
		if existing.text[cursor] == ',' {
			end = cursor + 1
			break
		}
		if !isSpaceByte(existing.text[cursor]) {
			break
		}
	}
	original := existing.text[start:end]
	replacement := "/* " + OrphanChildTag + " " + sanitizeForComment(original) + " */"
	return spliceOp{start: start, end: end, text: replacement}
}

// carcassFoldStart returns the byte offset where a drop's @rtOrphanChild carcass
// should START: the property's leading-comment position when the author wrote a
// `//` or `/* */` comment directly above the field (so it folds INTO the carcass),
// else the trivia-trimmed propStart (no leading comment to fold). It walks forward
// from the property's raw fullStart over whitespace to the first non-space byte; a
// `/` there (the opener of `//` or `/*`) before propStart means a leading comment
// is present. The fold never advances PAST propStart.
func carcassFoldStart(text string, prop *propView) int {
	if prop.fullStart < 0 || prop.fullStart >= prop.propStart {
		return prop.propStart
	}
	cursor := prop.fullStart
	for cursor < prop.propStart && isSpaceByte(text[cursor]) {
		cursor++
	}
	if cursor < prop.propStart && text[cursor] == '/' {
		return cursor // a leading `//` or `/* */` comment — fold it into the carcass
	}
	return prop.propStart
}

// existingIndent returns the leading-whitespace indent of the existing object's
// first property (so an inserted field lines up). Defaults to two spaces deeper
// than the object's own line when the object is empty.
func existingIndent(existing *objectView) string {
	if len(existing.order) > 0 {
		first := existing.props[existing.order[0]]
		if first != nil {
			return lineIndentAt(existing.text, first.propStart)
		}
	}
	// Empty object: indent two spaces past the `{`'s line indent.
	return lineIndentAt(existing.text, existing.node.Pos()) + "  "
}

// insertionAnchor returns the byte offset just AFTER the last property (and its
// trailing comma, if any) of the existing object — i.e. before the closing `}`.
// For an empty object it is just inside the braces.
func insertionAnchor(existing *objectView) int {
	if len(existing.order) == 0 {
		// Just after the `{`.
		return existing.node.Pos() + indexOfByte(existing.text[existing.node.Pos():existing.node.End()], '{') + 1
	}
	last := existing.props[existing.order[len(existing.order)-1]]
	anchor := last.propEnd
	// Swallow a trailing comma so the inserted block's own leading comma logic
	// (we use a trailing comma per field) stays valid.
	for anchor < len(existing.text) && existing.text[anchor] == ',' {
		anchor++
		break
	}
	return anchor
}

// needsLeadingSeparator reports whether an insertion at anchor must be prefixed
// with a separator comma: it scans backwards over whitespace from anchor to the
// previous non-space byte. A `,` means the last property is already comma-
// terminated (no separator needed); a `{` means the object is empty (no separator
// needed); anything else (e.g. a `}` ending the last property's value, or a
// string-literal quote) means the last property has NO trailing comma, so the
// inserted block must lead with one to stay valid.
func needsLeadingSeparator(text string, anchor int) bool {
	cursor := anchor - 1
	for cursor >= 0 && isSpaceByte(text[cursor]) {
		cursor--
	}
	if cursor < 0 {
		return false // nothing before the anchor — degenerate, no separator
	}
	prev := text[cursor]
	return prev != ',' && prev != '{'
}

// renderKey renders a property key: a bare identifier when safe, else quoted.
func renderKey(key string) string {
	if isSafeIdentifier(key) {
		return key
	}
	return "'" + strings.ReplaceAll(key, "'", "\\'") + "'"
}

// isSafeIdentifier reports whether key is a dot-access-safe JS identifier
// (matches the emitter's IsSafeName convention closely enough for keys we emit).
func isSafeIdentifier(key string) bool {
	if key == "" {
		return false
	}
	for i := 0; i < len(key); i++ {
		c := key[i]
		isLetter := c == '_' || c == '$' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
		isDigit := c >= '0' && c <= '9'
		if i == 0 && !isLetter {
			return false
		}
		if i > 0 && !isLetter && !isDigit {
			return false
		}
	}
	return true
}

// keySet collects a slice into a presence set.
func keySet(keys []string) map[string]bool {
	out := make(map[string]bool, len(keys))
	for _, key := range keys {
		out[key] = true
	}
	return out
}

// lineIndentAt returns the leading whitespace of the line containing offset.
func lineIndentAt(text string, offset int) string {
	lineStart := offset
	for lineStart > 0 && text[lineStart-1] != '\n' {
		lineStart--
	}
	indent := lineStart
	for indent < len(text) && (text[indent] == ' ' || text[indent] == '\t') {
		indent++
	}
	return text[lineStart:indent]
}

// indexOfByte returns the index of the first b in s, or -1.
func indexOfByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

// sanitizeForComment makes original safe inside a `/* … */` block comment by
// neutralizing any nested `*/` terminator, REVERSIBLY. It escapes the escape
// character first (`\` → `\\`) so an author value containing the escaped form is
// distinguishable, then breaks the terminator (`*/` → `*\/`). The result is
// guaranteed to contain no literal `*/`, and unsanitizeFromComment recovers the
// original byte-for-byte. Newlines are preserved so the orphaned value stays
// readable.
//
// Order matters: backslash-escaping FIRST, then terminator-breaking, so a value
// that literally contains `*\/` (or `*/`, or stray backslashes) round-trips.
func sanitizeForComment(original string) string {
	escaped := strings.ReplaceAll(original, "\\", "\\\\")
	return strings.ReplaceAll(escaped, "*/", "*\\/")
}

// unsanitizeFromComment reverses sanitizeForComment in EXACT inverse order
// (terminator-restore first, then backslash-unescape), so the recovered text is
// byte-identical to the pre-orphan original even when that original itself
// contained `*/`, `*\/`, or backslashes.
func unsanitizeFromComment(sanitized string) string {
	restored := strings.ReplaceAll(sanitized, "*\\/", "*/")
	return strings.ReplaceAll(restored, "\\\\", "\\")
}

// computeRenames pairs an existing-only DROP field with a desired-only ADD field
// that share a UNIQUE child identity, returning oldKey → newKey for each match.
// Child identity is two-tier:
//
//   - Tier 1 — the field's VALUE is a `friendly*/mock*` const reference
//     (named-type field): identity is that reference name. No marker needed.
//   - Tier 2 — otherwise (primitive / inline field): identity is the field's
//     @rtIds child id (existing-side from the existing const's parsed @rtIds,
//     desired-side from the desired const's ChildIDs), keyed by full dotted path.
//
// A pairing is made only when an identity maps to EXACTLY ONE drop and EXACTLY
// ONE add (unique match). An identity shared by >1 drop or >1 add is ambiguous —
// no rename; those fields fall through to orphan-child / insert.
func computeRenames(existing, desired *objectView, existingFields, desiredFields map[string]bool, ctx mergeCtx) map[string]string {
	drops := dropOnlyKeys(existingFields, desiredFields)
	adds := dropOnlyKeys(desiredFields, existingFields)
	if len(drops) == 0 || len(adds) == 0 {
		return nil
	}

	// Bucket drops + adds by identity; only singleton↔singleton buckets pair.
	dropByIdentity := map[string][]string{}
	for _, key := range drops {
		identity := fieldIdentity(existing, existing.props[key], ctx.childPath(key), ctx.existingChild)
		if identity != "" {
			dropByIdentity[identity] = append(dropByIdentity[identity], key)
		}
	}
	addByIdentity := map[string][]string{}
	for _, key := range adds {
		identity := fieldIdentity(desired, desired.props[key], ctx.childPath(key), ctx.desiredChild)
		if identity != "" {
			addByIdentity[identity] = append(addByIdentity[identity], key)
		}
	}

	var renames map[string]string
	for identity, dropKeys := range dropByIdentity {
		addKeys := addByIdentity[identity]
		if len(dropKeys) != 1 || len(addKeys) != 1 {
			continue // ambiguous (shared by >1 drop or >1 add) — no rename
		}
		if renames == nil {
			renames = map[string]string{}
		}
		renames[dropKeys[0]] = addKeys[0]
	}
	return renames
}

// fieldIdentity computes a field's rename identity, preferring the
// form-INDEPENDENT @rtIds child id (canonical: same structural id for the
// friendly and mock forms, so a renamed field re-pairs identically in both, and
// a var-name reuse across structurally-different types cannot mis-pair). The
// `friendly*/mock*` reference NAME is only the FALLBACK — used when no child id
// is recorded at this path (the closure records named-type-ref ids, so this is
// rare, but a hand-authored const without an @rtIds marker relies on it).
// Returns "" when neither is available (the field cannot participate in a
// rename).
func fieldIdentity(view *objectView, prop *propView, fullPath string, childIDs map[string]string) string {
	if id, ok := childIDs[fullPath]; ok && id != "" {
		return "id:" + id // canonical, form-independent
	}
	if prop != nil && prop.value != nil && prop.value.Kind == ast.KindIdentifier {
		name := prop.value.Text()
		if isFriendlyVar(name) || isMockVar(name) {
			return "ref:" + name // fallback (form-dependent var name)
		}
	}
	return ""
}

// dropOnlyKeys returns the keys present in `from` but not in `other`.
func dropOnlyKeys(from, other map[string]bool) []string {
	var out []string
	for key := range from {
		if !other[key] {
			out = append(out, key)
		}
	}
	return out
}
