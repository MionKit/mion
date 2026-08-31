package mirror

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// drift.go is the shared core of the breadcrumb-drift checks (the CLI `check`
// verb and the resolver's checkEnrich pass): does the mirror file's source
// breadcrumb still resolve (GE002), and does the source still declare every
// imported type (GE003)? GE001 (mirror LOCATION drift) needs the project's
// genDir config, so it stays with the CLI in cmd/ts-runtypes.

// breadcrumbPattern matches a mirror file's source breadcrumb:
// `import type { A, B } from '<spec>'`. Group 1 is the comma-separated type
// names, group 2 the module specifier. It is intentionally line-oriented and
// tolerant — only the FIRST such line (the source breadcrumb) is read; the
// ts-runtypes DSL import and any cross-file value imports are ignored.
var breadcrumbPattern = regexp.MustCompile(`(?m)^import\s+type\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]`)

// Breadcrumb is a mirror file's parsed source link: the imported type names,
// the module specifier, and the byte range of the import statement match
// (for diagnostics that anchor to the breadcrumb line).
type Breadcrumb struct {
	TypeNames []string
	Spec      string
	Start     int
	End       int
}

// DriftFinding is one breadcrumb-drift issue, file-anchored. Code is a
// FamilyEnrich diag code (GE002/GE003); Args are the catalog substitution
// values; Message is the pre-rendered CLI text. Start/End are byte offsets of
// the breadcrumb import in the mirror text.
type DriftFinding struct {
	Code    string
	Args    []string
	Message string
	Start   int
	End     int
}

// ParseBreadcrumb extracts the source breadcrumb from a mirror file's
// contents. The ts-runtypes DSL import (`import type { FriendlyText, MockData }
// from '@mionjs/run-types'`) is skipped so the SOURCE breadcrumb is the one
// returned. ok=false when no source breadcrumb is present (not a generated
// mirror, or no source link to check).
func ParseBreadcrumb(contents string) (Breadcrumb, bool) {
	for _, match := range breadcrumbPattern.FindAllStringSubmatchIndex(contents, -1) {
		spec := strings.TrimSpace(contents[match[4]:match[5]])
		if spec == "@mionjs/run-types" {
			continue // the DSL-types import, not the source breadcrumb
		}
		names := SplitImportNames(contents[match[2]:match[3]])
		if len(names) == 0 {
			continue
		}
		return Breadcrumb{TypeNames: names, Spec: spec, Start: match[0], End: match[1]}, true
	}
	return Breadcrumb{}, false
}

// SplitImportNames parses the `{ A, B as C }` body of an import clause into
// the imported type names (the original name before any `as` alias).
func SplitImportNames(clause string) []string {
	var names []string
	for _, part := range strings.Split(clause, ",") {
		name := strings.TrimSpace(part)
		if name == "" {
			continue
		}
		// `Original as Alias` — the source declares the Original name.
		if idx := strings.Index(name, " as "); idx >= 0 {
			name = strings.TrimSpace(name[:idx])
		}
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

// CheckBreadcrumbDrift resolves contents' source breadcrumb relative to
// mirrorFile and returns the GE002 (source deleted) / GE003 (type no longer
// declared) findings. Sources are looked up through fs when given (the
// resolver passes its Program's overlay FS so unsaved/virtual sources
// resolve); a nil fs falls back to the real disk (the CLI case). A mirror
// with no breadcrumb yields nothing.
func CheckBreadcrumbDrift(mirrorFile, contents string, fs vfspkg.FS) []DriftFinding {
	breadcrumb, ok := ParseBreadcrumb(contents)
	if !ok {
		return nil
	}
	resolvedSource := resolveBreadcrumbFS(fs, mirrorFile, breadcrumb.Spec)

	// GE002 — the source no longer exists (deleted → orphaned mirror).
	if !fsFileExists(fs, resolvedSource) {
		return []DriftFinding{{
			Code:    diagnostics.CodeGenSourceMissing,
			Args:    []string{breadcrumb.Spec, resolvedSource},
			Message: fmt.Sprintf("breadcrumb source %q resolves to a non-existent file (%s) — orphaned mirror; delete it or re-run gen", breadcrumb.Spec, resolvedSource),
			Start:   breadcrumb.Start,
			End:     breadcrumb.End,
		}}
	}

	// GE003 — the source exists but no longer declares an imported type.
	var findings []DriftFinding
	sourceText, readOK := fsReadFile(fs, resolvedSource)
	if !readOK {
		return findings // unreadable source — conservatively report nothing
	}
	for _, typeName := range breadcrumb.TypeNames {
		if SourceDeclaresType(sourceText, typeName) {
			continue
		}
		findings = append(findings, DriftFinding{
			Code:    diagnostics.CodeGenTypeMissing,
			Args:    []string{resolvedSource, typeName},
			Message: fmt.Sprintf("source %s no longer declares type %q — re-run gen", resolvedSource, typeName),
			Start:   breadcrumb.Start,
			End:     breadcrumb.End,
		})
	}
	return findings
}

// fsFileExists probes a path through fs, falling back to the real disk when
// fs is nil. Directories don't count — a breadcrumb must resolve to a file.
func fsFileExists(fs vfspkg.FS, path string) bool {
	if fs != nil {
		return fs.FileExists(path)
	}
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// fsReadFile reads a path through fs, falling back to the real disk when fs
// is nil.
func fsReadFile(fs vfspkg.FS, path string) (string, bool) {
	if fs != nil {
		return fs.ReadFile(path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	return string(data), true
}

// resolveBreadcrumbFS is ResolveBreadcrumb with the existence probes routed
// through fs (nil = real disk): resolve spec relative to the mirror file,
// preferring the .ts candidate, then .d.ts, returning the .ts candidate when
// neither exists (so GE002 reports a concrete path). A specifier that already
// carries its extension resolves as written.
func resolveBreadcrumbFS(fs vfspkg.FS, mirrorFile, spec string) string {
	if fs == nil {
		return ResolveBreadcrumb(mirrorFile, spec)
	}
	base := filepath.Join(filepath.Dir(mirrorFile), filepath.FromSlash(spec))
	if strings.HasSuffix(spec, ".ts") {
		return tspath.NormalizePath(base)
	}
	tsCandidate := tspath.NormalizePath(base + ".ts")
	if fs.FileExists(tsCandidate) {
		return tsCandidate
	}
	dtsCandidate := tspath.NormalizePath(base + ".d.ts")
	if fs.FileExists(dtsCandidate) {
		return dtsCandidate
	}
	return tsCandidate
}

// EnrichSeverity maps a FamilyEnrich diag code to the enrichment.Severity the
// CLI reports (and exits on). Severity ownership stays with the diag catalog;
// this is the read-side bridge for the text/JSON reports.
func EnrichSeverity(code string) enrichment.Severity {
	switch diagnostics.Definitions[code].Severity {
	case diagnostics.SeverityError:
		return enrichment.Error
	case diagnostics.SeverityWarning:
		return enrichment.Warning
	default:
		return enrichment.Info
	}
}

// Severity reports the finding's CLI severity, derived from the diag catalog.
func (finding DriftFinding) Severity() enrichment.Severity {
	return EnrichSeverity(finding.Code)
}
