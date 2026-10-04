package diagnostics

import (
	"fmt"
	"path/filepath"
	"slices"
	"strings"
)

// GroupedEntry is twin of GroupedEntry in packages/devtools/src/core/types.ts; testdata/grouped pins both.
type GroupedEntry struct {
	Severity Severity `json:"severity"`
	Name     string   `json:"name"`
	// Template carries `{slot}` names when Slots is set, else it is the finished text (a TypeScript error).
	Template   string    `json:"template"`
	Slots      []string  `json:"slots,omitempty"`
	Args       []string  `json:"args,omitempty"`
	Site       Site      `json:"site"`
	Related    []Related `json:"related,omitempty"`
	Downgraded bool      `json:"downgraded,omitempty"`
}

// EntryOf reads a Diagnostic for the grouped log; a downgraded finding prints as a warning.
func EntryOf(diagnostic Diagnostic, downgraded bool) GroupedEntry {
	entry := GroupedEntry{
		Severity:   diagnostic.Severity,
		Name:       diagnostic.Code,
		Args:       diagnostic.Args,
		Site:       diagnostic.Site,
		Related:    diagnostic.Related,
		Downgraded: downgraded,
	}
	if downgraded {
		entry.Severity = SeverityWarning
	}
	if definition, ok := Definitions[diagnostic.Code]; ok {
		entry.Template, entry.Slots = definition.Headline, definition.Slots
	} else {
		entry.Template = renderHeadline(diagnostic.Code, diagnostic.Args)
	}
	return entry
}

type groupedBlock struct {
	template string
	slots    []string
	entries  []GroupedEntry
}

type groupKey struct {
	severity   Severity
	name       string
	downgraded bool
}

type blockKey struct {
	group    groupKey
	template string
	slots    string
}

type groupedGroup struct {
	severity   Severity
	name       string
	downgraded bool
	blocks     []*groupedBlock
	size       int
}

// FormatGrouped prints each name once with its message, then its sites with the slot values that differ; paths under a non-empty cwd print relative.
func FormatGrouped(entries []GroupedEntry, cwd string) string {
	if len(entries) == 0 {
		return ""
	}
	entries = relativeEntries(entries, cwd)
	var groups []*groupedGroup
	groupByKey := map[groupKey]*groupedGroup{}
	blockByKey := map[blockKey]*groupedBlock{}
	for _, entry := range entries {
		groupLookup := groupKey{entry.Severity, entry.Name, entry.Downgraded}
		group, ok := groupByKey[groupLookup]
		if !ok {
			group = &groupedGroup{severity: entry.Severity, name: entry.Name, downgraded: entry.Downgraded}
			groupByKey[groupLookup] = group
			groups = append(groups, group)
		}
		group.size++
		// The NUL joins slot names that can never hold one, so two different lists never share a key.
		blockLookup := blockKey{groupLookup, entry.Template, strings.Join(entry.Slots, "\x00")}
		block, ok := blockByKey[blockLookup]
		if !ok {
			block = &groupedBlock{template: entry.Template, slots: entry.Slots}
			blockByKey[blockLookup] = block
			group.blocks = append(group.blocks, block)
		}
		block.entries = append(block.entries, entry)
	}
	for _, group := range groups {
		for _, block := range group.blocks {
			slices.SortStableFunc(block.entries, compareEntries)
		}
		slices.SortStableFunc(group.blocks, func(left, right *groupedBlock) int {
			return compareEntries(left.entries[0], right.entries[0])
		})
	}
	slices.SortStableFunc(groups, func(left, right *groupedGroup) int {
		if left.severity != right.severity {
			return int(left.severity) - int(right.severity)
		}
		if left.name != right.name {
			return strings.Compare(left.name, right.name)
		}
		return boolOrder(left.downgraded) - boolOrder(right.downgraded)
	})

	var builder strings.Builder
	for index, group := range groups {
		if index > 0 {
			builder.WriteString("\n\n")
		}
		fmt.Fprintf(&builder, "%s %s (%d)", SeverityLabel(group.severity), group.name, group.size)
		if group.downgraded {
			builder.WriteString(" " + DowngradedNote)
		}
		for _, block := range group.blocks {
			writeGroupedBlock(&builder, block)
		}
	}
	builder.WriteString("\n\n" + groupedCountLine(entries))
	return builder.String()
}

// writeGroupedBlock fills every slot that has one value at every site into the message and lists the rest per site.
func writeGroupedBlock(builder *strings.Builder, block *groupedBlock) {
	var varying []int
	// A varying slot fills with its own placeholder, so the message keeps `{name}` there.
	fill := make([]string, len(block.slots))
	for slotIndex, slot := range block.slots {
		fill[slotIndex] = argAt(block.entries[0].Args, slotIndex)
		for _, entry := range block.entries[1:] {
			if argAt(entry.Args, slotIndex) != fill[slotIndex] {
				varying = append(varying, slotIndex)
				fill[slotIndex] = "{" + slot + "}"
				break
			}
		}
	}
	message := block.template
	if len(block.slots) > 0 {
		message = fillSlots(block.template, block.slots, fill)
	}
	// Detail lines (a TypeScript message chain) sit deeper than the sites, so they never read as one.
	for index, line := range strings.Split(message, "\n") {
		if index > 0 {
			line = "    " + line
		}
		builder.WriteString("\n  " + line)
	}
	for _, entry := range block.entries {
		builder.WriteString("\n    " + groupedLocation(entry.Site))
		for _, slotIndex := range varying {
			builder.WriteString("  " + block.slots[slotIndex] + "=" + groupedValue(argAt(entry.Args, slotIndex)))
		}
		for _, related := range entry.Related {
			builder.WriteString("\n      Related: " + groupedLocation(related.Site) + " " + related.Message)
		}
	}
}

func relativeEntries(entries []GroupedEntry, cwd string) []GroupedEntry {
	if cwd == "" {
		return entries
	}
	out := make([]GroupedEntry, len(entries))
	for index, entry := range entries {
		entry.Site.FilePath = relativePath(entry.Site.FilePath, cwd)
		if len(entry.Related) > 0 {
			related := slices.Clone(entry.Related)
			for relatedIndex := range related {
				related[relatedIndex].FilePath = relativePath(related[relatedIndex].FilePath, cwd)
			}
			entry.Related = related
		}
		out[index] = entry
	}
	return out
}

func relativePath(path, cwd string) string {
	if !filepath.IsAbs(path) {
		return path
	}
	// The project folder itself stays as given: "." would read as no place at all.
	if rel, err := filepath.Rel(cwd, path); err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return filepath.ToSlash(rel)
	}
	return path
}

func argAt(args []string, index int) string {
	if index < len(args) {
		return args[index]
	}
	return ""
}

// groupedLocation prints `file:line:col`, the form terminals and editors open on click.
func groupedLocation(site Site) string {
	switch {
	case site.FilePath == "":
		return "(no file)"
	case site.StartLine <= 0:
		return site.FilePath
	}
	return fmt.Sprintf("%s:%d:%d", site.FilePath, site.StartLine, site.StartCol)
}

// groupedValue quotes a value that is empty or holds whitespace or a quote, so where it ends stays visible.
func groupedValue(value string) string {
	if value != "" && !strings.ContainsAny(value, " \t\n\r\"") {
		return value
	}
	escaped := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`, "\t", `\t`).Replace(value)
	return `"` + escaped + `"`
}

func groupedCountLine(entries []GroupedEntry) string {
	counts := map[Severity]int{}
	files := map[string]bool{}
	for _, entry := range entries {
		counts[entry.Severity]++
		if entry.Site.FilePath != "" {
			files[entry.Site.FilePath] = true
		}
	}
	var parts []string
	for _, part := range []struct {
		severity       Severity
		singular, many string
	}{{SeverityError, "error", "errors"}, {SeverityWarning, "warning", "warnings"}, {SeverityInfo, "info", "info"}} {
		if count := counts[part.severity]; count > 0 {
			parts = append(parts, fmt.Sprintf("%d %s", count, plural(count, part.singular, part.many)))
		}
	}
	line := "mion: " + strings.Join(parts, ", ")
	if len(files) > 0 {
		line += fmt.Sprintf(" in %d %s", len(files), plural(len(files), "file", "files"))
	}
	return line
}

func plural(count int, singular, many string) string {
	if count == 1 {
		return singular
	}
	return many
}

func boolOrder(value bool) int {
	if value {
		return 1
	}
	return 0
}

// compareEntries orders sites by file, line, column, then values, so equal input always prints the same way.
func compareEntries(left, right GroupedEntry) int {
	if order := strings.Compare(left.Site.FilePath, right.Site.FilePath); order != 0 {
		return order
	}
	if left.Site.StartLine != right.Site.StartLine {
		return left.Site.StartLine - right.Site.StartLine
	}
	if left.Site.StartCol != right.Site.StartCol {
		return left.Site.StartCol - right.Site.StartCol
	}
	return slices.Compare(left.Args, right.Args)
}
