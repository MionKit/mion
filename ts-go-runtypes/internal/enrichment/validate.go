package enrichment

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment/cldr"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Severity classifies a Finding's impact. Error fails the `check` command (exit
// 1); Warning / Info are advisory.
type Severity int

const (
	// Info is advisory only.
	Info Severity = iota
	// Warning is an authoring smell that does not fail the build.
	Warning
	// Error fails the `check` command.
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

// MarshalJSON renders a Severity as its lowercase string so `--json` output is
// agent-readable ("error" / "warning" / "info") rather than a bare int.
func (severity Severity) MarshalJSON() ([]byte, error) {
	return json.Marshal(severity.String())
}

// Finding is one issue the paired walk found in an authored FriendlyText /
// MockData map. Code is the stable identifier (FT002, MD001, …); Path is the
// dotted field path inside the map (root is "").
type Finding struct {
	Code     string   `json:"code"`
	Severity Severity `json:"severity"`
	Path     string   `json:"path"`
	Message  string   `json:"message"`
	// Args are the positional substitution values for the JS-side diagnostic
	// catalog ({0}, {1}, …) when the finding rides the resolver wire as a
	// diagnostics.Diagnostic. Message stays the CLI's pre-rendered text; the lint
	// surfaces render from Code+Args so wording lives in one JS catalog.
	Args []string `json:"args,omitempty"`
}

// LiteralView is the minimal read-only view of an authored object-literal that
// the paired checkers walk. It is deliberately tiny so tests can fake it
// without a full Program; the CLI wraps the tsgo object-literal AST in an
// adapter (astLiteralView) that implements it.
//
//   - Keys lists the literal's property keys in declaration order.
//   - Child returns the nested object-literal view bound to key, or nil when
//     that key's value is not an object literal (a string, number, array, …).
//   - StringValue returns the string-literal value bound to key (ok=false when
//     the key is absent or its value is not a string literal).
type LiteralView interface {
	Keys() []string
	Child(key string) LiteralView
	StringValue(key string) (string, bool)
}

// friendlyMetaKeys are the reserved `rt$`-meta keys a FriendlyText node may carry
// alongside its field children — never matched against the RunType's properties.
var friendlyMetaKeys = map[string]bool{
	"rt$label":  true,
	"rt$errors": true,
	"rt$items":  true,
}

// mockMetaKeys are the reserved keys a MockData node may carry alongside its
// field children — never matched against the RunType's properties.
var mockMetaKeys = map[string]bool{
	"rt$items":    true,
	"rt$length":   true,
	"rt$optional": true,
	"pool":        true,
	"min":         true,
	"max":         true,
}

// reservedMetaPrefix is the namespace RESERVED for enrichment meta keys
// (rt$label, rt$errors, rt$items, …). A type declaring an rt$-prefixed
// property cannot be enriched — the scaffold could not tell such a field from
// the node meta. `gen` refuses the type; the checker reports it as FT011
// (friendly) / MD011 (mock). Plain `$`-prefixed properties are ordinary fields
// (the bare `$` prefix is NOT reserved — only `rt$` is).
const reservedMetaPrefix = "rt$"

// derefPropertyChildren returns rt's Property/PropertySignature members with
// each CHILD deref'd first — tolerating both node forms: the raw closure shape
// (children are `{kind: ref, id}` sentinels) and the inlined single-const
// shape (children are canonical property nodes; deref is a no-op).
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

// checkReservedProperties emits one Error per rt$-prefixed property the
// RUNTYPE itself declares at this node (code FT011 or MD011 per family).
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

// ReservedPropertyCollisions walks rt's enrichment graph and returns the
// dotted path of every rt$-prefixed property it declares — gen's pre-flight:
// a non-empty result means the type cannot be scaffolded (the CLI fails with
// the offending paths; `check` reports the same as FT011/MD011).
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

// errorRecordReservedKeys are the always-valid keys inside an `rt$errors`
// data-record, regardless of the field's declared format constraints.
var errorRecordReservedKeys = map[string]bool{
	"type":       true,
	"rt$default": true,
}

// friendlyPlaceholders are the `$[…]` substitution names a friendly template
// string may reference.
var friendlyPlaceholders = map[string]bool{
	"label": true,
	"val":   true,
	"path":  true,
	"index": true,
}

// placeholderPattern matches `$[name]` placeholders in a friendly template —
// the closed token set the renderer substitutes. The colon form still parses
// (second group non-empty) ONLY so checkPlaceholders can flag it: the old
// `$[val:kind:name]` named-format tokens were replaced by type-driven `$[val]`
// rendering (the bound's own type format decides currency/date formatting).
var placeholderPattern = regexp.MustCompile(`\$\[(\w+)((?::\w+)*)\]`)

// CheckFriendly walks an authored FriendlyText<T> map (literal) paired with the
// RunType T resolves to, collecting Findings. resolve follows KindRef sentinels
// in child slots; pass nil when the graph is fully inlined (the unit-test
// shape). See validate.go's package doc for the wired checks (FT002/FT003/FT005).
func CheckFriendly(rt *reflection.RunType, literal LiteralView, resolve func(id string) *reflection.RunType) []Finding {
	ctx := newWalkCtx(resolve)
	var findings []Finding
	checkFriendlyNode(&findings, ctx, rt, literal, "", 0)
	return findings
}

// CheckMock walks an authored MockData<T> map (literal) paired with the RunType
// T resolves to, collecting Findings (MD001 today).
func CheckMock(rt *reflection.RunType, literal LiteralView, resolve func(id string) *reflection.RunType) []Finding {
	ctx := newWalkCtx(resolve)
	var findings []Finding
	checkMockNode(&findings, ctx, rt, literal, "", 0)
	return findings
}

// TODO(refine): FT004 / MD002 (value-shape mismatch) are left to the TS type
// checker — the precise FriendlyText<T> / MockData<T> mapped types already
// reject a wrong-shaped value at the call site. MD003 (each pool value
// validates against the field) needs the runtime validator and is out of scope
// for this CLI pass. MD004 (min > max), FT010 / MD010 (authored-vs-current
// drift hash), and the always-on Vite-build integration (surfacing through the
// plugin Diagnostic channel) are deferred — `check` is CLI-only for now.

// childByName indexes a RunType's data-bearing property children by field name
// for O(1) pairing against literal keys.
func childByName(ctx *walkCtx, rt *reflection.RunType) map[string]*reflection.RunType {
	props := propertyChildren(ctx, rt)
	byName := make(map[string]*reflection.RunType, len(props))
	for _, prop := range props {
		byName[prop.Name] = prop
	}
	return byName
}

// joinPath appends segment to a dotted path (root path is "").
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

	// This node's own `rt$errors` describes failures OF THIS NODE — checked exactly
	// once, here, against this node's RunType (its declared format constraints, or
	// type/rt$default for an object). Leaf fields are handled here too: they return
	// at the `!isObjectLike` gate below without descending, so their `rt$errors` is
	// never re-visited (which is what previously double-counted nested objects).
	checkFriendlyErrors(findings, literal.Child("rt$errors"), rt, path)

	// An array node carries its child shape under `rt$items` — descend there
	// paired with the element RunType.
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
			// rt$label / rt$errors / rt$items belong to the owning node, not a field —
			// rt$errors was handled above; rt$items only on arrays; rt$label is free text.
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

// checkFriendlyErrors validates a single `rt$errors` record (errorsView) against
// the field it belongs to. fieldNode is the field's RunType (nil at the object
// root, where `rt$errors` only describes the base `type` failure). A nil
// errorsView means the initializer wasn't an object literal (malformed — the
// TS checker flags it; nothing for us to walk).
func checkFriendlyErrors(findings *[]Finding, errorsView LiteralView, fieldNode *reflection.RunType, path string) {
	if errorsView == nil {
		return
	}
	// FT009: `rt$default` is the exclusive catch-all mode — a node either has ONE
	// rt$default message or per-constraint keys, never both (mirrors the TS union).
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
			// FT003: a constraint key that is neither type/rt$default nor one of the
			// field's declared format constraints.
			*findings = append(*findings, Finding{
				Code:     "FT003",
				Severity: Warning,
				Path:     keyPath,
				Message:  "error key '" + key + "' is not a declared constraint of this field",
				Args:     []string{key},
			})
		}
		// FT005: scan the template string for bad `$[…]` placeholders.
		if template, ok := errorsView.StringValue(key); ok {
			checkPlaceholders(findings, template, keyPath)
			continue
		}
		// A nested object literal is a plural template (arms per CLDR category).
		if plural := errorsView.Child(key); plural != nil {
			checkPluralLeaf(findings, plural, key, keyPath)
		}
	}
}

// checkPluralLeaf validates one plural template object: the mandatory `other`
// backstop (FT006), CLDR-valid arm keys (FT007), per-arm placeholders (FT005),
// and that the constraint can pluralize at all (FT008 — a plural object on a
// non-count-bearing constraint has dead arms; only `other` ever renders).
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

// allowedErrorKeys returns the set of valid `rt$errors` record keys for a field:
// the always-valid type/rt$default plus the field's declared format constraints.
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

// checkPlaceholders emits FT005 for every `$[name]` in template whose name is
// not one of the recognised placeholders, and for any leftover colon-form
// token (the removed `$[val:kind:name]` named-format syntax).
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

// FormatFinding renders one finding as the text-report line body
// `<path> [<CODE> <severity>] <message>` (the caller prefixes the file).
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
