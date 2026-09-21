package enrichment

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/cldr"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Severity classifies a Finding's impact: Error fails the `enrich --no-emit` lane, Warning and Info are advisory.
type Severity int

const (
	// Info is advisory only.
	Info Severity = iota
	// Warning is an authoring smell that does not fail the build.
	Warning
	// Error fails the `enrich --no-emit` lane.
	Error
)

// String renders a Severity for the text report.
func (severity Severity) String() string {
	switch severity {
	case Info:
		return "info"
	case Warning:
		return "warning"
	case Error:
		return "error"
	default:
		return "unknown"
	}
}

// MarshalJSON renders a Severity as its lowercase string, so `--json` output is agent-readable rather than a bare int.
func (severity Severity) MarshalJSON() ([]byte, error) {
	return json.Marshal(severity.String())
}

// Finding is one issue the paired walk found in an authored map; Path is the dotted field path inside it, root "".
type Finding struct {
	Code     string   `json:"code"`
	Severity Severity `json:"severity"`
	Path     string   `json:"path"`
	Message  string   `json:"message"`
	// Args are the {0}, {1} substitutions for the JS diagnostic catalog when the finding crosses the resolver wire.
	// Message stays the CLI's pre-rendered text; a lint renders from Code plus Args, so the wording lives in one catalog.
	Args []string `json:"args,omitempty"`
}

// LiteralView is the read-only view of an authored object literal the paired checkers walk, kept tiny so a test can fake it
// without a full Program; astLiteralView adapts the tsgo AST to it.
// Keys is in declaration order; Child is nil and StringValue not ok when the key's value is not of that shape.
type LiteralView interface {
	Keys() []string
	Child(key string) LiteralView
	StringValue(key string) (string, bool)
}

// friendlyMetaKeys are the reserved keys a FriendlyText node carries beside its fields, never matched against a property.
var friendlyMetaKeys = map[string]bool{
	"rt$label":  true,
	"rt$errors": true,
	"rt$items":  true,
}

// mockMetaKeys are the reserved keys a MockData node carries beside its fields, never matched against a property.
var mockMetaKeys = map[string]bool{
	"rt$items":    true,
	"rt$length":   true,
	"rt$optional": true,
	"pool":        true,
	"min":         true,
	"max":         true,
}

// reservedMetaPrefix is RESERVED for enrichment meta keys, so a type declaring one cannot be enriched: the scaffold could
// not tell that field from the node meta. The generator refuses the type, the checker reports FT011 / MD011.
// A bare `$` prefix is NOT reserved, only `rt$` is.
const reservedMetaPrefix = "rt$"

// derefPropertyChildren derefs each child first, so it tolerates both node forms: raw ref sentinels and inlined nodes.
func derefPropertyChildren(ctx *walkCtx, rt *reflection.RunType) []*reflection.RunType {
	out := make([]*reflection.RunType, 0, len(rt.Children))
	for _, child := range rt.Children {
		child = ctx.deref(child)
		if child == nil || child.NotSupported {
			continue
		}
		switch child.Kind {
		case reflection.KindProperty, reflection.KindPropertySignature:
			out = append(out, child)
		}
	}
	return out
}

// checkReservedProperties emits one Error per rt$-prefixed property the RUNTYPE itself declares at this node.
func checkReservedProperties(findings *[]Finding, ctx *walkCtx, rt *reflection.RunType, path, code string) {
	for _, prop := range derefPropertyChildren(ctx, rt) {
		if strings.HasPrefix(prop.Name, reservedMetaPrefix) {
			*findings = append(*findings, Finding{
				Code:     code,
				Severity: Error,
				Path:     joinPath(path, prop.Name),
				Message:  "property '" + prop.Name + "' collides with the reserved enrichment meta prefix 'rt$' — rename the property or exclude the type from enrichment",
				Args:     []string{prop.Name},
			})
		}
	}
}

// ReservedPropertyCollisions returns the dotted path of every rt$-prefixed property rt declares, the generator's pre-flight.
// A non-empty result means the type cannot be scaffolded; the check lanes report the same as FT011 / MD011.
func ReservedPropertyCollisions(rt *reflection.RunType, resolve func(id string) *reflection.RunType) []string {
	ctx := newWalkCtx(resolve)
	var collisions []string
	var walk func(rt *reflection.RunType, path string, depth int)
	walk = func(rt *reflection.RunType, path string, depth int) {
		rt = ctx.deref(rt)
		if rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
			return
		}
		if element := arrayElement(rt); element != nil {
			walk(element, joinPath(path, "rt$items"), depth+1)
			return
		}
		if !isObjectLike(ctx, rt) {
			return
		}
		ctx.seen[rt] = true
		defer delete(ctx.seen, rt)
		for _, prop := range derefPropertyChildren(ctx, rt) {
			if strings.HasPrefix(prop.Name, reservedMetaPrefix) {
				collisions = append(collisions, joinPath(path, prop.Name))
				continue
			}
			walk(prop.Child, joinPath(path, prop.Name), depth+1)
		}
	}
	walk(rt, "", 0)
	return collisions
}

// errorRecordReservedKeys are valid inside an `rt$errors` record whatever the field's declared format constraints.
var errorRecordReservedKeys = map[string]bool{
	"type":       true,
	"rt$default": true,
}

// friendlyPlaceholders are the `$[…]` substitution names a friendly template may reference.
var friendlyPlaceholders = map[string]bool{
	"label": true,
	"val":   true,
	"path":  true,
	"index": true,
}

// placeholderPattern matches the closed `$[name]` token set the renderer substitutes.
// The colon form parses ONLY so checkPlaceholders can flag it: `$[val:kind:name]` gave way to type-driven `$[val]` rendering.
var placeholderPattern = regexp.MustCompile(`\$\[(\w+)((?::\w+)*)\]`)

// CheckFriendly walks an authored FriendlyText<T> literal paired with the RunType T resolves to, collecting Findings.
// resolve follows KindRef sentinels in child slots; pass nil when the graph is fully inlined, the unit-test shape.
func CheckFriendly(rt *reflection.RunType, literal LiteralView, resolve func(id string) *reflection.RunType) []Finding {
	ctx := newWalkCtx(resolve)
	var findings []Finding
	checkFriendlyNode(&findings, ctx, rt, literal, "", 0)
	return findings
}

// CheckMock walks an authored MockData<T> literal paired with the RunType T resolves to, collecting Findings.
func CheckMock(rt *reflection.RunType, literal LiteralView, resolve func(id string) *reflection.RunType) []Finding {
	ctx := newWalkCtx(resolve)
	var findings []Finding
	checkMockNode(&findings, ctx, rt, literal, "", 0)
	return findings
}

// TODO(refine): FT004 / MD002 (value-shape mismatch) stay with the TS checker, whose mapped types already reject a
// wrong-shaped value at the call site. MD003 (pool value validates against the field) needs the runtime validator.
// MD004 (min > max) and FT010 / MD010 (authored-vs-current drift hash) are unimplemented: none of the six is registered.

// childByName indexes property children by field name for O(1) pairing against literal keys.
func childByName(ctx *walkCtx, rt *reflection.RunType) map[string]*reflection.RunType {
	props := propertyChildren(ctx, rt)
	byName := make(map[string]*reflection.RunType, len(props))
	for _, prop := range props {
		byName[prop.Name] = prop
	}
	return byName
}

// joinPath appends segment to a dotted path, the root path being "".
func joinPath(path, segment string) string {
	if path == "" {
		return segment
	}
	return path + "." + segment
}

func checkFriendlyNode(findings *[]Finding, ctx *walkCtx, rt *reflection.RunType, literal LiteralView, path string, depth int) {
	rt = ctx.deref(rt)
	if literal == nil || rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
		return
	}

	// This node's own `rt$errors` is checked exactly once, here; a leaf returns at the `!isObjectLike` gate without
	// descending, so its `rt$errors` is never re-visited, which is what used to double-count a nested object.
	checkFriendlyErrors(findings, literal.Child("rt$errors"), rt, path)

	// An array node carries its child shape under `rt$items`.
	if element := arrayElement(rt); element != nil {
		if items := literal.Child("rt$items"); items != nil {
			checkFriendlyNode(findings, ctx, element, items, joinPath(path, "rt$items"), depth+1)
		}
		return
	}

	if !isObjectLike(ctx, rt) {
		return
	}
	ctx.seen[rt] = true
	defer delete(ctx.seen, rt)

	byName := childByName(ctx, rt)
	checkReservedProperties(findings, ctx, rt, path, "FT011")
	for _, key := range literal.Keys() {
		if friendlyMetaKeys[key] {
			// A meta key belongs to the owning node, not a field: rt$errors was handled above and rt$label is free text.
			continue
		}
		child, ok := byName[key]
		if !ok {
			// FT002: the map names a field T does not declare.
			*findings = append(*findings, Finding{
				Code:     "FT002",
				Severity: Error,
				Path:     joinPath(path, key),
				Message:  "unknown field '" + key + "' is not a property of the type",
				Args:     []string{key},
			})
			continue
		}
		if nested := literal.Child(key); nested != nil {
			checkFriendlyNode(findings, ctx, child.Child, nested, joinPath(path, key), depth+1)
		}
	}
}

// checkFriendlyErrors validates one `rt$errors` record against the field it belongs to; a nil fieldNode is the object root,
// where it only describes the base `type` failure. A nil errorsView is a malformed initializer the TS checker flags.
func checkFriendlyErrors(findings *[]Finding, errorsView LiteralView, fieldNode *reflection.RunType, path string) {
	if errorsView == nil {
		return
	}
	// FT009: rt$default is the exclusive catch-all mode, never both it and per-constraint keys, mirroring the TS union.
	keys := errorsView.Keys()
	if len(keys) > 1 {
		for _, key := range keys {
			if key == "rt$default" {
				*findings = append(*findings, Finding{
					Code:     "FT009",
					Severity: Error,
					Path:     joinPath(path, "rt$errors.rt$default"),
					Message:  "rt$default is mutually exclusive with per-constraint messages — use {rt$default: '…'} alone, or per-constraint keys without it",
				})
				break
			}
		}
	}
	allowed := allowedErrorKeys(fieldNode)
	for _, key := range errorsView.Keys() {
		keyPath := joinPath(path, "rt$errors."+key)
		if !allowed[key] {
			// FT003: neither type / rt$default nor one of the field's declared format constraints.
			*findings = append(*findings, Finding{
				Code:     "FT003",
				Severity: Warning,
				Path:     keyPath,
				Message:  "error key '" + key + "' is not a declared constraint of this field",
				Args:     []string{key},
			})
		}
		// FT005: bad `$[…]` placeholders in the template string.
		if template, ok := errorsView.StringValue(key); ok {
			checkPlaceholders(findings, template, keyPath)
			continue
		}
		// A nested object literal is a plural template, one arm per CLDR category.
		if plural := errorsView.Child(key); plural != nil {
			checkPluralLeaf(findings, plural, key, keyPath)
		}
	}
}

// checkPluralLeaf validates one plural template: the mandatory `other` backstop (FT006), CLDR arm keys (FT007),
// per-arm placeholders (FT005), and whether the constraint can pluralize at all (FT008, dead arms otherwise).
func checkPluralLeaf(findings *[]Finding, plural LiteralView, key, keyPath string) {
	if !CountBearing(key) {
		*findings = append(*findings, Finding{
			Code:     "FT008",
			Severity: Warning,
			Path:     keyPath,
			Message:  "constraint '" + key + "' carries no count — a plural object here has dead arms (only 'other' renders); use a plain string",
			Args:     []string{key},
		})
	}
	hasOther := false
	for _, arm := range plural.Keys() {
		if arm == "other" {
			hasOther = true
		}
		if !cldr.IsCategory(arm) {
			*findings = append(*findings, Finding{
				Code:     "FT007",
				Severity: Warning,
				Path:     keyPath + "." + arm,
				Message:  "unknown plural arm '" + arm + "' (CLDR categories: zero, one, two, few, many, other)",
				Args:     []string{arm},
			})
		}
		if template, ok := plural.StringValue(arm); ok {
			checkPlaceholders(findings, template, keyPath+"."+arm)
		}
	}
	if !hasOther {
		*findings = append(*findings, Finding{
			Code:     "FT006",
			Severity: Error,
			Path:     keyPath,
			Message:  "plural template must carry the mandatory 'other' arm (the render backstop)",
		})
	}
}

// allowedErrorKeys is type / rt$default plus the field's declared format constraints.
func allowedErrorKeys(fieldNode *reflection.RunType) map[string]bool {
	allowed := make(map[string]bool, len(errorRecordReservedKeys)+2)
	for key := range errorRecordReservedKeys {
		allowed[key] = true
	}
	if fieldNode != nil {
		for _, constraint := range formatConstraintKeys(fieldNode.FormatAnnotation) {
			allowed[constraint] = true
		}
	}
	return allowed
}

// checkPlaceholders emits FT005 for an unrecognised `$[name]` and for a leftover colon-form token.
func checkPlaceholders(findings *[]Finding, template, path string) {
	for _, match := range placeholderPattern.FindAllStringSubmatch(template, -1) {
		name, colonTail := match[1], match[2]
		if colonTail != "" {
			*findings = append(*findings, Finding{
				Code:     "FT005",
				Severity: Warning,
				Path:     path,
				Message:  "format token '$[" + name + colonTail + "]' is no longer supported — use plain $[val]; the bound renders by its type format (currency, date)",
			})
			continue
		}
		if friendlyPlaceholders[name] {
			continue
		}
		*findings = append(*findings, Finding{
			Code:     "FT005",
			Severity: Warning,
			Path:     path,
			Message:  "unknown placeholder '$[" + name + "]' (expected one of label, val, path, index)",
			Args:     []string{name},
		})
	}
}

func checkMockNode(findings *[]Finding, ctx *walkCtx, rt *reflection.RunType, literal LiteralView, path string, depth int) {
	rt = ctx.deref(rt)
	if literal == nil || rt == nil || depth > maxWalkDepth || ctx.seen[rt] {
		return
	}

	if element := arrayElement(rt); element != nil {
		if items := literal.Child("rt$items"); items != nil {
			checkMockNode(findings, ctx, element, items, joinPath(path, "rt$items"), depth+1)
		}
		return
	}

	if !isObjectLike(ctx, rt) {
		return
	}
	ctx.seen[rt] = true
	defer delete(ctx.seen, rt)

	byName := childByName(ctx, rt)
	checkReservedProperties(findings, ctx, rt, path, "MD011")
	for _, key := range literal.Keys() {
		if mockMetaKeys[key] {
			continue
		}
		child, ok := byName[key]
		if !ok {
			// MD001: the map names a field T does not declare.
			*findings = append(*findings, Finding{
				Code:     "MD001",
				Severity: Error,
				Path:     joinPath(path, key),
				Message:  "unknown field '" + key + "' is not a property of the type",
				Args:     []string{key},
			})
			continue
		}
		if nested := literal.Child(key); nested != nil {
			checkMockNode(findings, ctx, child.Child, nested, joinPath(path, key), depth+1)
		}
	}
}

// FormatFinding renders the text-report line body `<path> [<CODE> <severity>] <message>`; the caller prefixes the file.
func FormatFinding(finding Finding) string {
	var b strings.Builder
	b.WriteString(finding.Path)
	b.WriteString(" [")
	b.WriteString(finding.Code)
	b.WriteString(" ")
	b.WriteString(finding.Severity.String())
	b.WriteString("] ")
	b.WriteString(finding.Message)
	return b.String()
}
