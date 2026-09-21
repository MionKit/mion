package mirror

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// drift.go is the shared core of the breadcrumb-drift checks, both the CLI check lane and the resolver's checkEnrich pass:
// does the mirror's source breadcrumb still resolve (GE002), and does that source still declare every imported type (GE003)?
// GE001, mirror LOCATION drift, needs the project's genDir config and so stays with the CLI in cmd/mion.

// breadcrumbPattern matches a mirror's source breadcrumb, group 1 the type names and group 2 the module specifier.
// It is deliberately line-oriented and tolerant; only the first such line is read, the DSL and value imports are ignored.
var breadcrumbPattern = regexp.MustCompile(`(?m)^import\s+type\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]`)

// Breadcrumb is a mirror's parsed source link; the byte range is there for a diagnostic anchored to the breadcrumb line.
type Breadcrumb struct {
	TypeNames []string
	Spec      string
	Start     int
	End       int
}

// DriftFinding is one breadcrumb-drift issue: a FamilyEnrich code, its catalog substitutions, the pre-rendered CLI text,
// and the byte offsets of the breadcrumb import in the mirror.
type DriftFinding struct {
	Code    string
	Args    []string
	Message string
	Start   int
	End     int
}

// ParseBreadcrumb returns a mirror's SOURCE breadcrumb, skipping the DSL import; ok is false when there is no source link.
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

// SplitImportNames parses an import clause body into the imported names, the original name before any `as` alias.
func SplitImportNames(clause string) []string {
	var names []string
	for _, part := range strings.Split(clause, ",") {
		name := strings.TrimSpace(part)
		if name == "" {
			continue
		}
		// The source declares the Original name of an `Original as Alias`.
		if idx := strings.Index(name, " as "); idx >= 0 {
			name = strings.TrimSpace(name[:idx])
		}
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

// CheckBreadcrumbDrift returns the GE002 (source deleted) and GE003 (type no longer declared) findings for one mirror.
// Sources are looked up through fs, the resolver's overlay FS so an unsaved source resolves; a nil fs means real disk.
func CheckBreadcrumbDrift(mirrorFile, contents string, fs vfspkg.FS) []DriftFinding {
	breadcrumb, ok := ParseBreadcrumb(contents)
	if !ok {
		return nil
	}
	resolvedSource := resolveBreadcrumbFS(fs, mirrorFile, breadcrumb.Spec)

	// GE002: the source no longer exists, leaving an orphaned mirror.
	if !fsFileExists(fs, resolvedSource) {
		return []DriftFinding{{
			Code:    diagnostics.CodeGenSourceMissing,
			Args:    []string{breadcrumb.Spec, resolvedSource},
			Message: fmt.Sprintf("breadcrumb source %q resolves to a non-existent file (%s) — orphaned mirror; delete it or re-run mion enrich", breadcrumb.Spec, resolvedSource),
			Start:   breadcrumb.Start,
			End:     breadcrumb.End,
		}}
	}

	// GE003: the source exists but no longer declares an imported type.
	var findings []DriftFinding
	sourceText, readOK := fsReadFile(fs, resolvedSource)
	if !readOK {
		return findings // an unreadable source conservatively reports nothing
	}
	for _, typeName := range breadcrumb.TypeNames {
		if SourceDeclaresType(sourceText, typeName) {
			continue
		}
		findings = append(findings, DriftFinding{
			Code:    diagnostics.CodeGenTypeMissing,
			Args:    []string{resolvedSource, typeName},
			Message: fmt.Sprintf("source %s no longer declares type %q — re-run mion enrich", resolvedSource, typeName),
			Start:   breadcrumb.Start,
			End:     breadcrumb.End,
		})
	}
	return findings
}

// fsFileExists probes a path through fs, real disk when nil; a directory does not count, a breadcrumb must be a file.
func fsFileExists(fs vfspkg.FS, path string) bool {
	if fs != nil {
		return fs.FileExists(path)
	}
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// fsReadFile reads a path through fs, falling back to the real disk when fs is nil.
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

// resolveBreadcrumbFS is ResolveBreadcrumb with the existence probes routed through fs, preferring .ts then .d.ts.
// With neither present it returns the .ts candidate, so GE002 reports a concrete path.
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

// EnrichSeverity maps a diag code to the enrichment.Severity the CLI exits on; the catalog still owns the severity.
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
