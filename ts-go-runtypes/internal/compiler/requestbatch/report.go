package requestbatch

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// Replacements builds the wire-shaped point insertions that splice each
// site's batch id into the empty trailing slot of its call (at the closing
// `)`). Sites whose slot was already written (empty InjectText) are skipped.
// No ImportFrom: the injected value is a plain string literal.
func Replacements(sites []Site) []protocol.Replacement {
	var out []protocol.Replacement
	for _, site := range sites {
		if site.InjectText == "" || site.FilePath == "" {
			continue
		}
		out = append(out, protocol.Replacement{
			File:  site.FilePath,
			Start: site.InjectPos,
			End:   site.InjectPos,
			Text:  site.InjectText,
		})
	}
	return out
}

// Report builds the structured batch build report, one protocol.BatchSite
// per site, sorted by (file, start) so the report is deterministic.
func Report(sites []Site) []protocol.BatchSite {
	sorted := sortedSites(sites)
	out := make([]protocol.BatchSite, 0, len(sorted))
	for _, site := range sorted {
		var mappings []protocol.BatchMapping
		for _, mapping := range site.Mappings {
			mappings = append(mappings, protocol.BatchMapping{
				FromId:     mapping.FromId,
				ToId:       mapping.ToId,
				ParamIndex: mapping.ParamIndex,
				MapperKey:  mapping.MapperKey,
			})
		}
		out = append(out, protocol.BatchSite{
			File:         site.FilePath,
			Start:        site.Start,
			End:          site.End,
			BatchId:      site.BatchId,
			RouteIds:     append([]string(nil), site.RouteIds...),
			Mappings:     mappings,
			CalleeName:   site.CalleeName,
			CalleeModule: site.CalleeModule,
		})
	}
	return out
}

// Files returns the sorted unique source files carrying at least one site,
// the set OpGenerate folds into SiteFiles so a file whose only marker use is
// `batch([...])` is still transformed.
func Files(sites []Site) []string {
	seen := map[string]bool{}
	var files []string
	for _, site := range sites {
		if site.FilePath == "" || seen[site.FilePath] {
			continue
		}
		seen[site.FilePath] = true
		files = append(files, site.FilePath)
	}
	sort.Strings(files)
	return files
}

// CheckConflicts folds a whole-program site set and reports the one
// cross-site disagreement a batch id cannot survive: BAT003 when two sites
// with DIFFERENT definitions (routes or mappings) hash to the same id. The
// first site in (file, start) order wins and is the Related location of every
// later colliding site. Same routes with different mappings is not a conflict:
// the mappings are part of the id, so those are two batches.
func CheckConflicts(sites []Site) []diagnostics.Diagnostic {
	var diags []diagnostics.Diagnostic
	byId := map[string]Site{}
	for _, site := range sortedSites(sites) {
		first, seen := byId[site.BatchId]
		if !seen {
			byId[site.BatchId] = site
			continue
		}
		if strings.Join(first.RouteIds, routeIdSeparator) == strings.Join(site.RouteIds, routeIdSeparator) && sameMappings(first.Mappings, site.Mappings) {
			continue
		}
		diags = append(diags, diagnostics.NewWithRelated(
			diagnostics.CodeBatchIdCollision,
			siteLocation(site),
			[]string{site.BatchId},
			diagnostics.Related{Site: siteLocation(first), Message: "First used here for routes " + strings.Join(first.RouteIds, ", ")},
		))
	}
	return diags
}

// sameMappings compares two mapping sets in canonical order, every field.
func sameMappings(a, b []Mapping) bool {
	if len(a) != len(b) {
		return false
	}
	left := append([]Mapping(nil), a...)
	right := append([]Mapping(nil), b...)
	sortMappings(left)
	sortMappings(right)
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

// siteLocation is the diagnostics location of a site: its call span when the
// site came out of extraction, a bare file path for a synthetic site.
func siteLocation(site Site) diagnostics.Site {
	if site.sourceFile == nil || site.callNode == nil {
		return diagnostics.Site{FilePath: site.FilePath}
	}
	return textpos.NodeSite(site.FilePath, site.sourceFile, site.callNode)
}

func sortedSites(sites []Site) []Site {
	sorted := append([]Site(nil), sites...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].FilePath != sorted[j].FilePath {
			return sorted[i].FilePath < sorted[j].FilePath
		}
		return sorted[i].Start < sorted[j].Start
	})
	return sorted
}
