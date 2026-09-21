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
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// variableDeclarations returns the VariableDeclaration nodes of a VariableStatement.
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

// objectView gives the merge per-property access by key; text is the FULL source the node was parsed from, either the
// existing file bytes or the synthetic `const _ = <body>;` of a desired skeleton, and every offset indexes into it.
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
	// keyStart / keyEnd bound the key IDENTIFIER, so a rename splice leaves the value bytes untouched.
	keyStart int
	keyEnd   int
	// propStart / propEnd bound the WHOLE property, for commenting a dropped field out or slicing an added one's text.
	propStart int
	propEnd   int
	// fullStart is the raw Pos(), so [fullStart, propStart) holds this property's leading trivia and any comment there.
	// A drop folds that comment INTO the carcass, so --prune removes it instead of leaving it above the next field.
	fullStart int
	value     *ast.Node // the initializer expression
}

// isObject reports whether the value is an object literal, which the merge recurses into, rather than a leaf.
func (prop *propView) isObject() bool {
	return prop.value != nil && ast.IsObjectLiteralExpression(prop.value)
}

// newObjectView wraps an ObjectLiteralExpression parsed from text; the sourceFile is needed for trivia-trimmed key starts.
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

// fieldKeys returns the DATA-field keys in declaration order; a meta key belongs to the node and is never merged as a field.
func (view *objectView) fieldKeys(metaKeys map[string]bool) []string {
	out := make([]string, 0, len(view.order))
	for _, key := range view.order {
		if metaKeys[key] || strings.HasPrefix(key, "rt$") {
			continue // an rt$ key is always meta, the prefix being RESERVED; a plain $ key is an ordinary field
		}
		out = append(out, key)
	}
	return out
}

// parseDesiredObject parses an emitted skeleton BODY, which carries no const wrapper, by wrapping it in a synthetic one.
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

// mergeCtx threads the per-merge state through the recursive walk: the family's reserved keys, the current dotted path
// prefix, and both @rtIds child-id maps keyed by full dotted path, the existing one parsed from the marker.
type mergeCtx struct {
	metaKeys      map[string]bool
	pathPrefix    string
	existingChild map[string]string
	desiredChild  map[string]string
	// friendlyFamily covers the source-language mirror AND every locale file. That family reconciles its vocabulary
	// granularly, so a field whose child TYPE ID changed still merges in place while its template matches: the authored
	// label and the still-declared error keys survive and only the vanished ones carcass.
	// Mock keeps the whole-field replace, its config riding RESERVED keys the merge never drops, so an in-place merge
	// would let a stale number-range config ride the new type.
	friendlyFamily bool
}

// childPath joins the ctx prefix with a field key, the root prefix being "".
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

// mergeObject merges a desired object INTO an existing one, appending splices against the existing bytes.
// The rename pass runs FIRST over the raw drop and add sets, since a matched pair becomes a key-only splice carrying
// the old value; then a field in both as objects recurses, as leaves stays byte-identical, and the rest is added or orphaned.
func mergeObject(ops *[]spliceOp, existing, desired *objectView, ctx mergeCtx) {
	existingFields := keySet(existing.fieldKeys(ctx.metaKeys))
	desiredFields := keySet(desired.fieldKeys(ctx.metaKeys))

	// A matched pair becomes a key-only splice, its value bytes untouched, and both keys leave the drop and add sets.
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

	// A kept key whose SHAPE changed is REPLACED IN PLACE: the stale value carcasses and the fresh skeleton follows it,
	// both in ONE splice over the property's range, so the field keeps its position and no separator logic is involved.
	// A kept key whose CHILD TYPE changed splits by family. Mock always replaces, or an `age: number` to `age: string`
	// would leave a number-range config riding the string field.
	// Friendly replaces only when the structural template changed too; for a same-template change it MERGES, so the
	// authored label and the still-declared keys survive instead of the whole subtree carcassing and re-scaffolding blank.
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
		// Leaf in both with the same child type: leave the existing bytes untouched.
	}

	// A desired-only field is inserted as a fresh skeleton at the end of the existing object.
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

	// An existing-only field is commented out in place.
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

	// A structural meta node is not a data field, so the merge above skips it, yet it still drifts when its element type
	// gains a sub-field. Scalar meta such as rt$length is author data and is left untouched.
	mergeMetaNodes(ops, existing, desired, ctx)

	// Every constraint key the type adds gets a blank and the recognized ones it drops are orphaned, so a new constraint
	// never renders silently unstyled and a plural arm always has an attachment point.
	mergeErrorsNode(ops, existing, desired, ctx)
}

// mergeErrorsNode descends one level into a node's `rt$errors`; constraint keys are a fixed vocabulary, so there is NO
// rename pass at this level.
// A `rt$default`-only record on EITHER side is skipped whole: that mode is author-owned. A key in both is plural-merged
// when both sides are objects, else kept byte-identical, a hand-diverged leaf KIND included, which the check lane reports.
// A desired-only key is inserted blank; an existing-only key carcasses ONLY when recognized, since a key we cannot
// attribute to the type is author-added and never touched.
func mergeErrorsNode(ops *[]spliceOp, existing, desired *objectView, ctx mergeCtx) {
	existingProp := existing.props["rt$errors"]
	desiredProp := desired.props["rt$errors"]
	if existingProp == nil || desiredProp == nil {
		return
	}
	if !existingProp.isObject() || !desiredProp.isObject() {
		return // an exotic value on either side is opaque and never merged
	}
	existingErrors := newObjectView(existing.text, existing.sourceFile, existingProp.value)
	desiredErrors := newObjectView(desired.text, desired.sourceFile, desiredProp.value)
	if isDefaultOnly(existingErrors) || isDefaultOnly(desiredErrors) {
		return // the exclusive rt$default mode is author-owned, so there is nothing to sync
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

// isDefaultOnly reports whether rt$default is a record's ONLY key, the exclusive catch-all mode.
func isDefaultOnly(errors *objectView) bool {
	return len(errors.order) == 1 && errors.props["rt$default"] != nil
}

// knownConstraintKeys are the rt$errors keys attributable to the TYPE, every family's failable params plus `type`.
// Only a key in this catalog is ever orphaned; anything else is author-owned and untouched.
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

// mergePluralObject merges one plural template under the asymmetric rule that arms are LOCALE-OWNED: an extra arm is
// never orphaned and never rename-paired, so a dropped `one` cannot relabel into an added `few`.
// An arm the translator pruned stays pruned and a filled arm is byte-identical; only the mandatory `other` is re-inserted.
func mergePluralObject(ops *[]spliceOp, existingErrors, desiredErrors *objectView, key string) {
	existingPlural := newObjectView(existingErrors.text, existingErrors.sourceFile, existingErrors.props[key].value)
	desiredPlural := newObjectView(desiredErrors.text, desiredErrors.sourceFile, desiredErrors.props[key].value)

	if existingPlural.props["other"] == nil && desiredPlural.props["other"] != nil {
		*ops = append(*ops, insertFieldsOp(existingPlural, desiredPlural, []string{"other"}))
	}
	// Every other arm is kept: a desired-only one beyond `other` is never forced onto a pruned set.
}

// objectMetaKeys are the meta keys whose value is an object carrying a nested shape, recursed like a data field.
// rt$slots is handled separately, being an ARRAY of nodes.
var objectMetaKeys = []string{"rt$items", "rt$keys", "rt$values"}

// mergeMetaNodes merges each object-valued meta key present on both sides and walks rt$slots positionally.
// It never adds, drops or renames a meta key, so the node's own shape stays owned by the emitter.
func mergeMetaNodes(ops *[]spliceOp, existing, desired *objectView, ctx mergeCtx) {
	for _, metaKey := range objectMetaKeys {
		existingProp := existing.props[metaKey]
		desiredProp := desired.props[metaKey]
		if existingProp == nil || desiredProp == nil {
			continue
		}
		if !existingProp.isObject() || !desiredProp.isObject() {
			continue // a non-object meta value is author scalar data, with nothing to recurse
		}
		childExisting := newObjectView(existing.text, existing.sourceFile, existingProp.value)
		childDesired := newObjectView(desired.text, desired.sourceFile, desiredProp.value)
		mergeObject(ops, childExisting, childDesired, ctx.descend(metaKey))
	}
	mergeSlots(ops, existing, desired, ctx)
}

// mergeSlots pairs slot i with slot i and recurses each. Slots are fixed-position, so only the overlap is merged and
// an element is never inserted or dropped, which would shift the rest; a length change is the emitter's to regenerate.
// The path segment matches the emitter's `rt$slots.<i>` convention for @rtIds lookups.
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
			continue // a leaf slot has no nested shape to merge
		}
		childExisting := newObjectView(existing.text, existing.sourceFile, existingSlot)
		childDesired := newObjectView(desired.text, desired.sourceFile, desiredSlot)
		mergeObject(ops, childExisting, childDesired, ctx.descend("rt$slots."+strconv.Itoa(i)))
	}
}

// arrayElementNodes returns an array literal's element nodes, nil when node is not one.
func arrayElementNodes(node *ast.Node) []*ast.Node {
	if node == nil || !ast.IsArrayLiteralExpression(node) {
		return nil
	}
	return node.AsArrayLiteralExpression().Elements.Nodes
}

// childTypeChanged needs both ids present: a MISSING one is unknown, and the merge never replaces on uncertainty.
func childTypeChanged(ctx mergeCtx, childPath string) bool {
	existingID := ctx.existingChild[childPath]
	desiredID := ctx.desiredChild[childPath]
	if existingID == "" || desiredID == "" {
		return false
	}
	return existingID != desiredID
}

// shapeMismatch reports a kept key that changed between object and leaf; such a field cannot be merged in place.
func shapeMismatch(existingProp, desiredProp *propView) bool {
	return existingProp.isObject() != desiredProp.isObject()
}

// sameStructuralTemplate compares the presence set of the structural meta nodes: matching means the two templates nest
// the same way, so a friendly field can merge across a child-type change, each granular walk reconciling its own level.
// A differing skeleton, a string grown into an array say, has no positionwise merge and the caller replaces the field whole.
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

// replaceChildOp carcasses the stale property verbatim, its trailing comma swallowed, and splices the fresh skeleton
// right after it, so the field keeps its position and the literal stays valid.
func replaceChildOp(existing, desired *objectView, key string) spliceOp {
	prop := existing.props[key]
	desiredProp := desired.props[key]
	if prop == nil || desiredProp == nil {
		return spliceOp{}
	}
	end := prop.propEnd
	// Swallow a single trailing comma, so the carcass and the fresh property own exactly one separator between them.
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

// insertFieldsOp appends every added field's skeleton just before the closing brace, indented like the first property.
func insertFieldsOp(existing, desired *objectView, addKeys []string) spliceOp {
	indent := existingIndent(existing)
	anchor := insertionAnchor(existing)

	var b strings.Builder
	// Each added field carries a TRAILING comma and so relies on the previous property ending in one, which a
	// Prettier-collapsed single-line object does not, hence the leading comma when the previous byte is neither `,` nor `{`.
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

// orphanChildOp comments a dropped property out in place, its authored value preserved verbatim for a later restore.
// The range SWALLOWS the trailing comma, or a dangling `,` would be a syntax error.
// It also folds back over the author's LEADING comment, which describes the dropped field, so that comment is preserved
// with it and --prune removes it cleanly instead of leaving it above the surviving sibling.
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

// carcassFoldStart is the author's leading-comment position when there is one, so it folds INTO the carcass, else
// propStart; the fold never advances PAST propStart.
func carcassFoldStart(text string, prop *propView) int {
	if prop.fullStart < 0 || prop.fullStart >= prop.propStart {
		return prop.propStart
	}
	cursor := prop.fullStart
	for cursor < prop.propStart && isSpaceByte(text[cursor]) {
		cursor++
	}
	if cursor < prop.propStart && text[cursor] == '/' {
		return cursor // a leading comment, folded into the carcass
	}
	return prop.propStart
}

// existingIndent is the first property's indent, so an inserted field lines up; an empty object indents two spaces deeper.
func existingIndent(existing *objectView) string {
	if len(existing.order) > 0 {
		first := existing.props[existing.order[0]]
		if first != nil {
			return lineIndentAt(existing.text, first.propStart)
		}
	}
	// An empty object indents two spaces past the brace's own line.
	return lineIndentAt(existing.text, existing.node.Pos()) + "  "
}

// insertionAnchor is the offset just after the last property and its trailing comma, or just inside an empty object.
func insertionAnchor(existing *objectView) int {
	if len(existing.order) == 0 {
		// Just after the brace.
		return existing.node.Pos() + indexOfByte(existing.text[existing.node.Pos():existing.node.End()], '{') + 1
	}
	last := existing.props[existing.order[len(existing.order)-1]]
	anchor := last.propEnd
	// Swallow a trailing comma, so the inserted block's own per-field trailing comma stays valid.
	for anchor < len(existing.text) && existing.text[anchor] == ',' {
		anchor++
		break
	}
	return anchor
}

// needsLeadingSeparator reads the byte before the anchor: a `,` means the last property is already terminated and a `{`
// means the object is empty, while anything else means no trailing comma, so the inserted block must lead with one.
func needsLeadingSeparator(text string, anchor int) bool {
	cursor := anchor - 1
	for cursor >= 0 && isSpaceByte(text[cursor]) {
		cursor--
	}
	if cursor < 0 {
		return false // nothing before the anchor, a degenerate case needing no separator
	}
	prev := text[cursor]
	return prev != ',' && prev != '{'
}

// renderKey renders a key bare when the projection's own safe-name predicate allows, else through the one quoting helper.
func renderKey(key string) string {
	if reflection.IsSafeName(key) {
		return key
	}
	return jsquote.Single(key)
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

// sanitizeForComment neutralizes any nested `*/` terminator REVERSIBLY, so unsanitizeFromComment recovers the original
// byte for byte; newlines are kept, so the orphaned value stays readable.
// Order matters: escape the escape character FIRST, then break the terminator, so a value that literally contains
// `*\/`, `*/` or a stray backslash still round-trips.
func sanitizeForComment(original string) string {
	escaped := strings.ReplaceAll(original, "\\", "\\\\")
	return strings.ReplaceAll(escaped, "*/", "*\\/")
}

// unsanitizeFromComment reverses sanitizeForComment in EXACT inverse order, restoring the terminator before unescaping.
func unsanitizeFromComment(sanitized string) string {
	restored := strings.ReplaceAll(sanitized, "*\\/", "*/")
	return strings.ReplaceAll(restored, "\\\\", "\\")
}

// computeRenames pairs a DROP field with an ADD field sharing a UNIQUE child identity, returning old key to new key.
// Identity is the field's @rtIds child id, or the name of the const reference its value is when no id is recorded.
// A pairing needs EXACTLY ONE drop and ONE add per identity; anything shared is ambiguous and falls through.
func computeRenames(existing, desired *objectView, existingFields, desiredFields map[string]bool, ctx mergeCtx) map[string]string {
	drops := dropOnlyKeys(existingFields, desiredFields)
	adds := dropOnlyKeys(desiredFields, existingFields)
	if len(drops) == 0 || len(adds) == 0 {
		return nil
	}

	// Only a pair of singleton buckets can match.
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
			continue // ambiguous, so no rename
		}
		if renames == nil {
			renames = map[string]string{}
		}
		renames[dropKeys[0]] = addKeys[0]
	}
	return renames
}

// fieldIdentity prefers the form-INDEPENDENT @rtIds child id, so a renamed field re-pairs identically in both forms and
// a var-name reused across structurally-different types cannot mis-pair.
// The reference NAME is only the fallback, for a hand-authored const with no @rtIds marker; "" means no rename is possible.
func fieldIdentity(view *objectView, prop *propView, fullPath string, childIDs map[string]string) string {
	if id, ok := childIDs[fullPath]; ok && id != "" {
		return "id:" + id // canonical, form-independent
	}
	if prop != nil && prop.value != nil && prop.value.Kind == ast.KindIdentifier {
		name := prop.value.Text()
		if isFriendlyVar(name) || isMockVar(name) {
			return "ref:" + name // the fallback, a form-dependent var name
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
