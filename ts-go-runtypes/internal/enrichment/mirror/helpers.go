package mirror

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// Spec is the arg bundle for a mirror reconcile / scaffold. It is filesystem
// agnostic: MirrorPathFor resolves a source file's home mirror path (the CLI
// passes its enrichConfig.mirrorPath method) so the pure package never reaches
// for config or disk.
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

// ImportSpecifier computes the ES-module specifier to reach absTarget from the
// file at absFrom: a relative path with a leading "./" (or "../"), forward
// slashes, and the source extension stripped (".d.ts" and ".ts" both drop to a
// bare path). This is the string that goes in `from '<spec>'`.
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

// stripModuleExt drops a ".d.ts" or single extension (".ts", ".tsx", …) from a
// path so it reads as a bare module specifier.
func stripModuleExt(path string) string {
	trimmed := strings.TrimSuffix(path, ".d.ts")
	if trimmed != path {
		return trimmed
	}
	return strings.TrimSuffix(path, filepath.Ext(path))
}

// ConstBlock wraps a rendered object-literal body in the
// `export const <var>: <Wrapper><<TypeName>> = <body>;` declaration, prefixed
// with the reconcile marker JSDoc (`@rtType` + `@rtIds`)
// when the const carries a structural id, then a plain
// `@todo` line on its OWN line. The marker + the `@todo` ride the const
// WRAPPER, never the skeleton body — the batch stdout path (runGenBatch)
// compares the body alone, so it stays byte-identical. ConstBlock is only ever
// called for a NEWLY-generated const (create-only first-gen, a new const
// appended during --update), so a fresh `@todo` is always correct here; the
// reconcile NEVER re-stamps it on an already-existing const.
func ConstBlock(varName, wrapper string, named enrichment.NamedConst, body string) string {
	marker := MarkerComment(named)
	return marker + todoComment() + "export const " + varName + ": " + wrapper + "<" + named.TypeName + "> = " + body + ";\n"
}

// todoComment renders the PLAIN `@todo` line that flags a freshly-generated const
// as "needs real data". It is DELIBERATELY OUTSIDE the `@rt` namespace: `@rt`-
// prefixed tags (`@rtType`, `@rtIds`, `@rtOrphan`, `@rtOrphanChild`) are
// compiler-owned machinery the compiler reads/writes/acts on, whereas `@todo` is
// purely emitted — filling the data and deleting the line is the user's/LLM's job,
// so it lives outside that namespace (and earns free IDE TODO-panel recognition).
//
// It is stamped ONCE on each NEW const (right after the `@rtType`/`@rtIds` marker,
// on its OWN separate line). The compiler NEVER acts on it, auto-removes it, or
// re-adds it: an existing const on --update keeps its `@todo` (if present)
// untouched, a const the user already cleared never regrows one, and --prune
// IGNORES it (it strips only @rtOrphan/@rtOrphanChild). It is a SEPARATE line from
// the marker so the marker index never confuses the two concerns.
func todoComment() string {
	return TodoLine + "\n"
}

// MarkerComment renders the reconcile JSDoc for a const: a single leading line
// `/** @rtType <Name>#<id> @rtIds {field: <id>, …} */\n` (the @rtIds entries
// carry the BARE child id — see formatChildIDs/ChildIDs). It is omitted (empty
// string) when there is no structural id (an unresolved/anonymous root), so a
// degenerate const stays marker-free. The encoding survives Prettier (leading
// JSDoc on a declaration is preserved) and round-trips through
// parseConstMarkers on reconcile.
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

// formatChildIDs renders an @rtIds map as `field: id, field2: id2` with keys
// sorted for deterministic, idempotent output.
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

// ConstTypeNames returns the distinct source type names in a slice of
// NamedConsts, in emission order, for a mirror file's `import type { … }` line.
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

// CrossFileImportLines renders deterministic `import { … } from '<rel>'` lines —
// one per target mirror file, vars sorted — for the cross-file references found
// in a mirror file. Mirror targets are sorted by their import specifier so output
// is stable.
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

// ReferencedVars returns the distinct friendly*/mock*/<locale>_friendly*
// identifiers appearing in a rendered body — the const-var references the
// closure emitter (or the translation blanker) inlined. It is a token scan
// (the bodies are object literals with bare identifier values), the same
// convention the closure test's TDZ check uses.
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
				continue // not a const-var (e.g. a field literally named "mockX" in lowercase)
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

// Scaffold builds the create-only mirror content for spec's consts against the
// EXISTING file content: it skips any export the file already declares
// (create-only — never clobbers a present const), renders a fresh marker + @todo
// + block for each missing one, and returns the FULL new file content (existing +
// appended blocks, or a fresh header + blocks when existing is empty) plus the
// list of added var names. It returns ("", nil, nil) when every requested export
// is already present (the create-only no-op). It performs no I/O — the caller
// reads `existing`, then writes the returned content.
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

// writeMirrorHeader emits the import block for a fresh mirror file: the
// `import type { … } from '<rel to source>'` breadcrumb (only the types declared
// in THIS source file), the `ts-runtypes` DSL types, and one deduped cross-file
// value-import line per other mirror file whose consts this file references.
func writeMirrorHeader(builder *strings.Builder, spec Spec, blocks []string) {
	// The source breadcrumb: relative path from the mirror file back to the source
	// file, strictly `import type` (no value-level source→mirror cycle).
	sourceSpec := ImportSpecifier(spec.MirrorPath, spec.SourceFile)
	builder.WriteString("import type { ")
	builder.WriteString(strings.Join(ConstTypeNames(spec.Consts), ", "))
	builder.WriteString(" } from '")
	builder.WriteString(sourceSpec)
	builder.WriteString("';\n")
	builder.WriteString("import type { ")
	builder.WriteString(strings.Join(dslTypeNames(spec), ", "))
	builder.WriteString(" } from '@mionjs/run-types';\n")

	// Cross-file value imports: collect the friendly*/mock* vars referenced in the
	// rendered blocks whose declaration file differs from this group's source file,
	// grouped by their home mirror file.
	thisFile := tspath.NormalizePath(spec.SourceFile)
	importsByMirror := map[string]map[string]bool{}
	body := strings.Join(blocks, "\n")
	for _, varName := range ReferencedVars(body) {
		declFile, ok := spec.VarDeclFile[varName]
		if !ok {
			continue
		}
		if tspath.NormalizePath(declFile) == thisFile {
			continue // intra-file reference — no import
		}
		if spec.Out != "" {
			continue // single-file --out: every const lives in one file, no imports
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

// dslTypeNames lists the ts-runtypes wrapper types a mirror file's consts
// annotate with, per the spec's family flags: a friendly-family file (the
// source language and every per-locale translation file alike) imports only
// FriendlyText, a mock-family file only MockData, a combined (--out) file both.
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

// ResolveBreadcrumb resolves a module specifier (as written in the breadcrumb,
// extension usually stripped) relative to the mirror file's directory,
// appending ".ts" (the source is a .ts; a .d.ts-origin mirror still tracks the
// .ts/.d.ts source, and we probe both). A specifier that already carries its
// extension (allowImportingTsExtensions style) resolves as written. Returns
// the .ts candidate when nothing exists so GE002 reports a concrete path.
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
	// Neither exists — return the .ts candidate so GE002 reports a concrete path.
	return tsCandidate
}

// SourceDeclaresType reports whether sourceText still makes typeName available —
// as a direct declaration OR a re-export. It is shared by the orphan judgement
// (A5: a false negative DESTRUCTIVELY orphans a live type) and the `check`
// drift lane (GE003), so it errs toward KEEP on uncertainty. A textual scan — sufficient
// for "does this name still exist as a declaration or export here?".
//
// Recognized:
//   - direct declaration: interface/type/class/enum Name (declare/abstract/export)
//   - value binding:      export (declare) const/let/var/function Name / enum / namespace
//   - named re-export:    export { Name }, export { X as Name }, export type { … }
//   - wildcard re-export: any `export * from` → UNKNOWN, conservatively KEEP
//
// The wildcard case can re-export Name from elsewhere; we cannot prove absence,
// so we never orphan when one is present.
func SourceDeclaresType(sourceText, typeName string) bool {
	// Direct declaration / value binding with the name in the declarator position.
	declPattern := regexp.MustCompile(`(?m)(^|\b)(export\s+)?(declare\s+)?(abstract\s+)?(interface|type|class|enum|namespace|module|const|let|var|function)\s+` + regexp.QuoteMeta(typeName) + `\b`)
	if declPattern.MatchString(sourceText) {
		return true
	}
	// Any `export * from` (with or without a namespace alias) — could re-export the
	// name; cannot prove absence, so KEEP (never orphan on uncertainty).
	if regexp.MustCompile(`(?m)export\s+\*`).MatchString(sourceText) {
		return true
	}
	// Named re-export: scan every `export [type] { … }` clause for the name as
	// either the local name or the `as`-aliased exported name.
	if exportClauseDeclares(sourceText, typeName) {
		return true
	}
	return false
}

// exportClauseDeclares reports whether any `export { … }` (or `export type
// { … }`) clause in sourceText exports typeName — matching it as a bare name, as
// the local side of `Name as X`, or as the exported side of `X as Name`. The
// clause may or may not carry a `from '<spec>'` tail (re-export vs local
// re-bind); both count.
func exportClauseDeclares(sourceText, typeName string) bool {
	clausePattern := regexp.MustCompile(`(?s)export\s+(?:type\s+)?\{([^}]*)\}`)
	for _, match := range clausePattern.FindAllStringSubmatch(sourceText, -1) {
		for _, part := range strings.Split(match[1], ",") {
			specifier := strings.TrimSpace(part)
			if specifier == "" {
				continue
			}
			// `Local as Exported` — typeName matches EITHER side (the local declares
			// it, the exported name makes it importable under that name).
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
