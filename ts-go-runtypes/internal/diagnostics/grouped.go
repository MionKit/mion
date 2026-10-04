package diagnostics

import (
	"fmt"
	"slices"
	"strings"
)

// GroupedEntry is one finding as the grouped log sees it. Go twin of GroupedEntry in
// packages/devtools/src/core/surface.ts; the shared fixtures under testdata/grouped pin both.
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

type groupedGroup struct {
	severity   Severity
	name       string
	downgraded bool
	blocks     []*groupedBlock
	size       int
}

// FormatGrouped prints entries grouped by severity and name, each message once, then one line per site
// with the slot values that differ, and closes with a count line. Empty input prints nothing.
func FormatGrouped(entries []GroupedEntry) string {
	if len(entries) == 0 {
		return ""
	}
	var groups []*groupedGroup
	for _, entry := range entries {
		index := slices.IndexFunc(groups, func(group *groupedGroup) bool {
			return group.severity == entry.Severity && group.name == entry.Name && group.downgraded == entry.Downgraded
		})
		if index < 0 {
			groups = append(groups, &groupedGroup{severity: entry.Severity, name: entry.Name, downgraded: entry.Downgraded})
			index = len(groups) - 1
		}
		group := groups[index]
		group.size++
		blockIndex := slices.IndexFunc(group.blocks, func(block *groupedBlock) bool {
			return block.template == entry.Template && slices.Equal(block.slots, entry.Slots)
		})
		if blockIndex < 0 {
			group.blocks = append(group.blocks, &groupedBlock{template: entry.Template, slots: entry.Slots})
			blockIndex = len(group.blocks) - 1
		}
		group.blocks[blockIndex].entries = append(group.blocks[blockIndex].entries, entry)
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
	values := make([]string, len(block.slots))
	for slotIndex := range block.slots {
		first := argAt(block.entries[0].Args, slotIndex)
		values[slotIndex] = first
		for _, entry := range block.entries[1:] {
			if argAt(entry.Args, slotIndex) != first {
				varying = append(varying, slotIndex)
				break
			}
		}
	}
	message := headlineSlotRE.ReplaceAllStringFunc(block.template, func(placeholder string) string {
		slotIndex := slices.Index(block.slots, placeholder[1:len(placeholder)-1])
		if slotIndex < 0 || slices.Contains(varying, slotIndex) {
			return placeholder
		}
		return values[slotIndex]
	})
	if len(block.slots) == 0 {
		message = block.template
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

// groupedValue quotes a value that is empty or holds whitespace, so where one value ends stays visible.
func groupedValue(value string) string {
	if value != "" && !strings.ContainsAny(value, " \t\n\r") {
		return value
	}
	escaped := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`, "\t", `\t`).Replace(value)
	return `"` + escaped + `"`
}

func groupedCountLine(entries []GroupedEntry) string {
	counts := map[Severity]int{}
	var files []string
	for _, entry := range entries {
		counts[entry.Severity]++
		if entry.Site.FilePath != "" && !slices.Contains(files, entry.Site.FilePath) {
			files = append(files, entry.Site.FilePath)
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
