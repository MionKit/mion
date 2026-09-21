package mirror

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// Spec is the arg bundle for a reconcile or scaffold; MirrorPathFor is injected so this package needs no config or disk.
type Spec struct {
	MirrorPath    string
	SourceFile    string
	Consts        []enrichment.NamedConst
	VarDeclFile   map[string]string
	Out           string
	WantFriendly  bool
	WantMock      bool
	MirrorPathFor func(declFile string) string
}

// ImportSpecifier is the `from '<spec>'` string reaching absTarget from absFrom: relative, slashed, extension stripped.
func ImportSpecifier(absFrom, absTarget string) string {
	fromDir := filepath.Dir(absFrom)
	rel, err := filepath.Rel(fromDir, absTarget)
	if err != nil {
		rel = absTarget
	}
	rel = stripModuleExt(rel)
	slashed := filepath.ToSlash(rel)
	if !strings.HasPrefix(slashed, ".") {
		slashed = "./" + slashed
	}
	return slashed
}

// stripModuleExt drops a ".d.ts" or a single extension so the path reads as a bare module specifier.
func stripModuleExt(path string) string {
	trimmed := strings.TrimSuffix(path, ".d.ts")
	if trimmed != path {
		return trimmed
	}
	return strings.TrimSuffix(path, filepath.Ext(path))
}

// ConstBlock wraps a rendered body in its `export const` declaration, behind the reconcile marker and a `@todo` line.
// Both ride the const WRAPPER, never the body, which runGenBatch compares byte for byte.
// It is called only for a NEWLY-generated const, so a fresh `@todo` is right; reconcile never re-stamps an existing one.
func ConstBlock(varName, wrapper string, named enrichment.NamedConst, body string) string {
	marker := MarkerComment(named)
	return marker + todoComment() + "export const " + varName + ": " + wrapper + "<" + named.TypeName + "> = " + body + ";\n"
}

// todoComment renders the `@todo` line flagging a fresh const as needing real data, DELIBERATELY outside the `@rt`
// namespace: `@rt` tags are compiler-owned, whereas filling in and deleting a `@todo` is the author's job, and an IDE
// TODO panel finds it for free. The compiler never acts on it, removes it or re-adds it, and --prune ignores it.
// It is a SEPARATE line from the marker, so the marker index never confuses the two concerns.
func todoComment() string {
	return TodoLine + "\n"
}

// MarkerComment renders a const's reconcile JSDoc as ONE leading line, empty when the const has no structural id.
// The encoding survives Prettier, which preserves leading JSDoc, and round-trips through parseConstMarkers on reconcile.
func MarkerComment(named enrichment.NamedConst) string {
	if named.TypeID == "" {
		return ""
	}
	var b strings.Builder
	b.WriteString(MarkerCommentPrefix)
	if named.TypeName != "" {
		b.WriteString(named.TypeName)
		b.WriteString("#")
	}
	b.WriteString(named.TypeID)
	if len(named.ChildIDs) > 0 {
		b.WriteString(" " + RtIdsTag + " {")
		b.WriteString(formatChildIDs(named.ChildIDs))
		b.WriteString("}")
	}
	b.WriteString(" */\n")
	return b.String()
}

// formatChildIDs renders an @rtIds map with keys sorted, for deterministic and idempotent output.
func formatChildIDs(childIDs map[string]string) string {
	paths := make([]string, 0, len(childIDs))
	for path := range childIDs {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	parts := make([]string, 0, len(paths))
	for _, path := range paths {
		parts = append(parts, path+": "+childIDs[path])
	}
	return strings.Join(parts, ", ")
}

// ConstTypeNames returns the distinct source type names in emission order, for a mirror's `import type { … }` line.
func ConstTypeNames(consts []enrichment.NamedConst) []string {
	seen := make(map[string]bool, len(consts))
	names := make([]string, 0, len(consts))
	for _, named := range consts {
		if named.TypeName == "" || seen[named.TypeName] {
			continue
		}
		seen[named.TypeName] = true
		names = append(names, named.TypeName)
	}
	return names
}

// CrossFileImportLines renders one import line per target mirror, vars sorted and targets sorted by specifier, for stability.
func CrossFileImportLines(fromMirror string, importsByMirror map[string]map[string]bool) []string {
	type entry struct {
		spec string
		vars []string
	}
	entries := make([]entry, 0, len(importsByMirror))
	for targetMirror, varSet := range importsByMirror {
		vars := make([]string, 0, len(varSet))
		for varName := range varSet {
			vars = append(vars, varName)
		}
		sort.Strings(vars)
		entries = append(entries, entry{spec: ImportSpecifier(fromMirror, targetMirror), vars: vars})
	}
	sort.Slice(entries, func(left, right int) bool { return entries[left].spec < entries[right].spec })

	lines := make([]string, 0, len(entries))
	for _, item := range entries {
		lines = append(lines, "import { "+strings.Join(item.vars, ", ")+" } from '"+item.spec+"';\n")
	}
	return lines
}

// ReferencedVars returns the distinct const-var identifiers a rendered body references, by token scan: the bodies are
// object literals whose values are bare identifiers.
func ReferencedVars(body string) []string {
	seen := map[string]bool{}
	var out []string
	for _, token := range strings.FieldsFunc(body, func(r rune) bool {
		return !(r == '$' || r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9'))
	}) {
		if token == "friendly" || token == "mock" {
			continue
		}
		if !strings.HasPrefix(token, "friendly") && !strings.HasPrefix(token, "mock") && !isTranslationVar(token) {
			continue
		}
		if !isTranslationVar(token) {
			suffix := strings.TrimPrefix(strings.TrimPrefix(token, "friendly"), "mock")
			if suffix == "" || suffix[0] < 'A' || suffix[0] > 'Z' {
				continue // not a const-var, a field literally named "mockx" for instance
			}
		}
		if !seen[token] {
			seen[token] = true
			out = append(out, token)
		}
	}
	return out
}

// HasExport reports whether source already declares `export const <varName>`.
func HasExport(source, varName string) bool {
	if source == "" {
		return false
	}
	pattern := regexp.MustCompile(`export\s+const\s+` + regexp.QuoteMeta(varName) + `\b`)
	return pattern.MatchString(source)
}

// Scaffold returns the FULL new mirror content plus the added var names, create-only: an export the file already
// declares is skipped, never clobbered. It returns ("", nil, nil) when every requested export is present, and does no I/O.
func Scaffold(spec Spec, existing string) (string, []string, error) {
	var added []string
	var blocks []string
	for _, named := range spec.Consts {
		if spec.WantFriendly && !HasExport(existing, named.FriendlyVar) {
			blocks = append(blocks, ConstBlock(named.FriendlyVar, enrichment.FriendlyTextName, named, named.Friendly))
			added = append(added, named.FriendlyVar)
		}
		if spec.WantMock && !HasExport(existing, named.MockVar) {
			blocks = append(blocks, ConstBlock(named.MockVar, enrichment.MockDataName, named, named.Mock))
			added = append(added, named.MockVar)
		}
	}
	if len(blocks) == 0 {
		return "", nil, nil
	}

	var builder strings.Builder
	if existing == "" {
		writeMirrorHeader(&builder, spec, blocks)
	} else {
		builder.WriteString(existing)
		if !strings.HasSuffix(existing, "\n") {
			builder.WriteString("\n")
		}
		builder.WriteString("\n")
	}
	builder.WriteString(strings.Join(blocks, "\n"))
	return builder.String(), added, nil
}

// writeMirrorHeader emits a fresh mirror's import block: the source breadcrumb, the DSL types, and one deduped
// value-import line per other mirror file this one references.
func writeMirrorHeader(builder *strings.Builder, spec Spec, blocks []string) {
	// The breadcrumb is strictly `import type`, so there is no value-level source-to-mirror cycle.
	sourceSpec := ImportSpecifier(spec.MirrorPath, spec.SourceFile)
	builder.WriteString("import type { ")
	builder.WriteString(strings.Join(ConstTypeNames(spec.Consts), ", "))
	builder.WriteString(" } from '")
	builder.WriteString(sourceSpec)
	builder.WriteString("';\n")
	builder.WriteString("import type { ")
	builder.WriteString(strings.Join(dslTypeNames(spec), ", "))
	builder.WriteString(" } from '@mionjs/run-types';\n")

	// A referenced var declared in another source file is imported from its home mirror.
	thisFile := tspath.NormalizePath(spec.SourceFile)
	importsByMirror := map[string]map[string]bool{}
	body := strings.Join(blocks, "\n")
	for _, varName := range ReferencedVars(body) {
		declFile, ok := spec.VarDeclFile[varName]
		if !ok {
			continue
		}
		if tspath.NormalizePath(declFile) == thisFile {
			continue // an intra-file reference needs no import
		}
		if spec.Out != "" {
			continue // with --out every const lives in one file, so no imports
		}
		targetMirror := spec.MirrorPathFor(declFile)
		if importsByMirror[targetMirror] == nil {
			importsByMirror[targetMirror] = map[string]bool{}
		}
		importsByMirror[targetMirror][varName] = true
	}
	for _, line := range CrossFileImportLines(spec.MirrorPath, importsByMirror) {
		builder.WriteString(line)
	}
	builder.WriteString("\n")
}

// dslTypeNames lists the wrapper types a mirror's consts annotate with: one per family, both in a combined --out file.
func dslTypeNames(spec Spec) []string {
	var names []string
	if spec.WantFriendly {
		names = append(names, enrichment.FriendlyTextName)
	}
	if spec.WantMock {
		names = append(names, enrichment.MockDataName)
	}
	return names
}

// ResolveBreadcrumb resolves a breadcrumb specifier against the mirror's directory, probing .ts then .d.ts.
// A specifier already carrying its extension resolves as written; with neither present the .ts candidate is returned.
func ResolveBreadcrumb(mirrorFile, spec string) string {
	base := filepath.Join(filepath.Dir(mirrorFile), filepath.FromSlash(spec))
	if strings.HasSuffix(spec, ".ts") {
		return tspath.NormalizePath(base)
	}
	tsCandidate := tspath.NormalizePath(base + ".ts")
	if _, err := os.Stat(tsCandidate); err == nil {
		return tsCandidate
	}
	dtsCandidate := tspath.NormalizePath(base + ".d.ts")
	if _, err := os.Stat(dtsCandidate); err == nil {
		return dtsCandidate
	}
	// With neither present the .ts candidate keeps GE002 reporting a concrete path.
	return tsCandidate
}

// SourceDeclaresType reports whether sourceText still makes typeName available, by declaration or by re-export.
// The orphan judgement shares it with the GE003 drift lane, and a false negative DESTRUCTIVELY orphans a live type,
// so it errs toward KEEP: a wildcard `export *` could re-export the name, and absence cannot be proven, so it counts.
func SourceDeclaresType(sourceText, typeName string) bool {
	// A direct declaration or value binding, the name in the declarator position.
	declPattern := regexp.MustCompile(`(?m)(^|\b)(export\s+)?(declare\s+)?(abstract\s+)?(interface|type|class|enum|namespace|module|const|let|var|function)\s+` + regexp.QuoteMeta(typeName) + `\b`)
	if declPattern.MatchString(sourceText) {
		return true
	}
	// An `export *` could re-export the name and absence cannot be proven, so never orphan on it.
	if regexp.MustCompile(`(?m)export\s+\*`).MatchString(sourceText) {
		return true
	}
	// A named re-export counts under either the local or the `as`-aliased name.
	if exportClauseDeclares(sourceText, typeName) {
		return true
	}
	return false
}

// exportClauseDeclares matches typeName as a bare name or either side of an `as`; a `from` tail is optional, both count.
func exportClauseDeclares(sourceText, typeName string) bool {
	clausePattern := regexp.MustCompile(`(?s)export\s+(?:type\s+)?\{([^}]*)\}`)
	for _, match := range clausePattern.FindAllStringSubmatch(sourceText, -1) {
		for _, part := range strings.Split(match[1], ",") {
			specifier := strings.TrimSpace(part)
			if specifier == "" {
				continue
			}
			// Either side counts: the local declares it, the exported name makes it importable.
			localName, exportedName := specifier, specifier
			if idx := strings.Index(specifier, " as "); idx >= 0 {
				localName = strings.TrimSpace(specifier[:idx])
				exportedName = strings.TrimSpace(specifier[idx+len(" as "):])
			}
			if localName == typeName || exportedName == typeName {
				return true
			}
		}
	}
	return false
}
