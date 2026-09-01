// Package sourcerewrite owns the per-file rewrite + source-map generation
// compiler-side. It is the Go half of a Go ⇄ JS twin: it reproduces, BYTE-FOR-BYTE,
// the output of the JS pipeline in packages/ts-runtypes-devtools/src/apply-edits.ts
// (buildInsertion, buildImportBlock, makeByteToChar, the apply loop) and
// edit-buffer.ts (EditBuffer + Mappings + VLQ encoder), so the two wire modes
// (transformMode 'go' — the daemon returns {code, map} — and 'edits' — the plugin
// applies the edit list) are identical by construction and the bundler's
// composite-map chain is unchanged either way.
//
// ───────────────────────── UTF-16 vs UTF-8 (CRITICAL) ─────────────────────────
//
// The JS EditBuffer indexes UTF-16 code units, and source-map COLUMNS are
// UTF-16 code units (what JS tooling / browsers expect). Resolver offsets
// (protocol.Site.Pos, protocol.Replacement.Start/End) are UTF-8 BYTE offsets
// (tsgo positions count bytes). To produce a byte-identical map this package
// works in UTF-16 internally:
//
//   - `source` is converted to []uint16 via utf16.Encode([]rune(source));
//   - byteToChar (the port of makeByteToChar) converts a byte offset to a
//     UTF-16 index, with an identity fast-path when the source is pure ASCII
//     (len(source) == UTF-16 length);
//   - all editing / slicing / column math runs in UTF-16 units (EditBuffer);
//   - the rendered code is decoded back to UTF-8 via string(utf16.Decode(units)).
//
// The injected text (call-site bindings, the import block) is always ASCII, so
// its UTF-16 length == byte length == len. isWordChar is ASCII /\w/ only
// ([A-Za-z0-9_]); lines split on 0x0A. The VLQ alphabet and delta-encoding
// match edit-buffer.ts exactly. The magic-string credit/license for the
// source-map segment math carries over (see editbuffer.go).
package sourcerewrite

import (
	"sort"
	"strings"
	"unicode/utf16"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Apply rewrites `source` per the resolver's sites + replacements: call-site
// bindings (buildInsertion), pure-fn replacements, and the single deduped import
// block at offset 0 (buildImportBlock) — then generates a v3 source map.
// Returns (rewrittenCode, map). When there are no sites AND no replacements it
// returns (source, nil) — matching rewrite.ts. `file` is recorded as sources[0].
func Apply(file, source string, sites []protocol.Site, replacements []protocol.Replacement) (string, *protocol.SourceMap) {
	if len(sites) == 0 && len(replacements) == 0 {
		return source, nil
	}

	// Source is edited in UTF-16 units (matching the JS string the EditBuffer
	// indexed). byteToChar maps every resolver byte offset to its UTF-16 index.
	units := utf16.Encode([]rune(source))
	byteOffsets := make([]int, 0, len(sites)+2*len(replacements))
	for _, site := range sites {
		byteOffsets = append(byteOffsets, site.Pos)
	}
	for _, rep := range replacements {
		byteOffsets = append(byteOffsets, rep.Start, rep.End)
	}
	toChar := makeByteToChar(source, units, byteOffsets)

	editBuffer := newEditBuffer(units)
	// Sites are zero-width insertions keyed on Pos; replacements are span edits
	// keyed on Start/End. The EditBuffer resolves every edit against ORIGINAL
	// coordinates, so application order is irrelevant.
	for _, group := range groupSitesByPos(sites) {
		editBuffer.appendLeft(toChar(group[0].Pos), buildGroupInsertion(group))
	}
	for _, rep := range replacements {
		if rep.Start == rep.End {
			editBuffer.appendLeft(toChar(rep.Start), rep.Text)
		} else {
			editBuffer.update(toChar(rep.Start), toChar(rep.End), rep.Text)
		}
	}
	importBlock := buildImportBlock(sites, replacements)
	if importBlock != "" {
		editBuffer.prepend(importBlock)
	}

	sourceMap := editBuffer.generateMap(file, source)
	return editBuffer.string(), sourceMap
}

// makeByteToChar converts resolver UTF-8 byte offsets to UTF-16 code-unit
// indices (port of rewrite.ts makeByteToChar). Pure-ASCII sources (the common
// case) short-circuit to identity; otherwise one code-point walk maps exactly
// the offsets the edits need. Resolver offsets always land on code-point
// boundaries, so the mapping is exact.
func makeByteToChar(source string, units []uint16, byteOffsets []int) func(int) int {
	if len(source) == len(units) {
		return func(byteOffset int) int { return byteOffset }
	}
	// Dedupe + sort the requested byte offsets, mirroring the JS Set+sort.
	seen := make(map[int]bool, len(byteOffsets))
	sorted := make([]int, 0, len(byteOffsets))
	for _, off := range byteOffsets {
		if !seen[off] {
			seen[off] = true
			sorted = append(sorted, off)
		}
	}
	sort.Ints(sorted)

	byChar := make(map[int]int, len(sorted))
	pending := 0
	byteCursor := 0
	unit := 0
	// Iterate code points (runes), matching JS `for (const char of code)`.
	for _, r := range source {
		for pending < len(sorted) && sorted[pending] <= byteCursor {
			byChar[sorted[pending]] = unit
			pending++
		}
		if pending == len(sorted) {
			break
		}
		byteCursor += utf8Len(r)
		unit += utf16Len(r)
	}
	for ; pending < len(sorted); pending++ {
		byChar[sorted[pending]] = unit
	}
	return func(byteOffset int) int {
		if v, ok := byChar[byteOffset]; ok {
			return v
		}
		return byteOffset
	}
}

// utf8Len mirrors the JS byte-length branch on a code point's value.
func utf8Len(r rune) int {
	switch {
	case r <= 0x7f:
		return 1
	case r <= 0x7ff:
		return 2
	case r <= 0xffff:
		return 3
	default:
		return 4
	}
}

// utf16Len is the number of UTF-16 code units a rune occupies (char.length in
// JS): 1 in the BMP, 2 for astral code points (surrogate pair).
func utf16Len(r rune) int {
	if r > 0xffff {
		return 2
	}
	return 1
}

// entryBasename derives one entry-module basename a site imports: the
// `<fnHash>_<typeId>` cache key for a createX entry (fnId set), the bare typeId
// for a reflection entry (fnId empty).
func entryBasename(id, fnId string) string {
	if fnId != "" {
		return fnId + "_" + id
	}
	return id
}

// entryBinding is the import-binding identifier an injection references — also
// the entry module's export name.
func entryBinding(id, fnId string) string {
	return constants.EntryBindingPrefix + entryBasename(id, fnId)
}

// siteFnIds is the ordered fnId list a site injects: the multi-function list
// when the marker named several families, else the lone fnId (empty string for
// a reflection site → bare-id binding).
func siteFnIds(site protocol.Site) []string {
	if len(site.FnIds) > 0 {
		return site.FnIds
	}
	return []string{site.FnId}
}

// siteModuleFor is the module basename ONE fnId of a site is imported from:
// the per-fnId bundle when the site is multi-function (its fnIds span several
// families, each its own bundle under allSingle), else the site-wide stamp,
// else the entry's own module. A binding must never be imported from a module
// that does not export it, so this tracks fnIds positionally — Modules mirrors
// FnIds index-for-index.
func siteModuleFor(site protocol.Site, index int, fnId string) string {
	if index < len(site.Modules) && site.Modules[index] != "" {
		return site.Modules[index]
	}
	if site.Module != "" {
		return site.Module
	}
	return entryBasename(site.ID, fnId)
}

// buildImportBlock collects every entry-module import the rewritten file needs
// and renders the deduped import statements as a SINGLE physical line. One
// clause shape everywhere: every module exports each entry under its binding
// name, so clauses import it directly (`{__rt_X}`, never renamed); only the
// specifier differs (the bundle when site.Module/Modules is stamped, the
// entry's own module otherwise). Deterministic order (sorted by specifier,
// clauses sorted within) keeps rewrites byte-stable.
func buildImportBlock(sites []protocol.Site, replacements []protocol.Replacement) string {
	bySpecifier := make(map[string]map[string]bool)
	addClause := func(specifier, clause string) {
		clauses := bySpecifier[specifier]
		if clauses == nil {
			clauses = make(map[string]bool)
			bySpecifier[specifier] = clauses
		}
		clauses[clause] = true
	}
	for _, site := range sites {
		if site.ID == "" {
			continue
		}
		for index, fnId := range siteFnIds(site) {
			basename := siteModuleFor(site, index, fnId)
			specifier := constants.EntryModulePrefix + basename + constants.EntryModuleSuffix
			addClause(specifier, entryBinding(site.ID, fnId))
		}
	}
	for _, rep := range replacements {
		if rep.ImportFrom == "" {
			continue
		}
		addClause(rep.ImportFrom, rep.Text)
	}
	if len(bySpecifier) == 0 {
		return ""
	}
	specifiers := make([]string, 0, len(bySpecifier))
	for specifier := range bySpecifier {
		specifiers = append(specifiers, specifier)
	}
	sort.Strings(specifiers)
	statements := make([]string, 0, len(specifiers))
	for _, specifier := range specifiers {
		clauses := make([]string, 0, len(bySpecifier[specifier]))
		for clause := range bySpecifier[specifier] {
			clauses = append(clauses, clause)
		}
		sort.Strings(clauses)
		statements = append(statements, "import {"+strings.Join(clauses, ", ")+"} from '"+specifier+"';")
	}
	return strings.Join(statements, " ") + "\n"
}

// groupSitesByPos buckets sites by their injection position (a call's closing
// paren). Every marker slot a single call injects shares that call's Pos, so a
// group is exactly one call's slots; the transform composes ONE insertion per
// group. Distinct calls have distinct closing parens, so single-marker calls
// are groups of one (byte-identical to the pre-multislot path). First-occurrence
// order keeps the output deterministic.
func groupSitesByPos(sites []protocol.Site) [][]protocol.Site {
	index := make(map[int]int, len(sites))
	groups := make([][]protocol.Site, 0, len(sites))
	for _, site := range sites {
		gi, ok := index[site.Pos]
		if !ok {
			gi = len(groups)
			index[site.Pos] = gi
			groups = append(groups, nil)
		}
		groups[gi] = append(groups[gi], site)
	}
	return groups
}

// slotBinding renders the entry-tuple binding one marker slot injects: an ARRAY
// of bindings for a multi-function InjectTypeFnArgs<T, F1, F2, …> site
// (len(FnIds) > 1), else the lone binding — a scalar fn binding, or the bare
// reflection id when FnId is empty (InjectRunTypeId).
func slotBinding(site protocol.Site) string {
	if len(site.FnIds) > 1 {
		bindings := make([]string, 0, len(site.FnIds))
		for _, fnId := range site.FnIds {
			bindings = append(bindings, entryBinding(site.ID, fnId))
		}
		return "[" + strings.Join(bindings, ", ") + "]"
	}
	return entryBinding(site.ID, site.FnId)
}

// buildGroupInsertion produces the text to splice in just before a call's
// closing `)` for every marker slot that call injects. A call with ONE marker
// param is a group of one and renders byte-identically to the pre-multislot
// path: `undefined` padding for earlier optional params, then the binding. A
// call with SEVERAL marker params (multi-slot injection — e.g. mion's per-side
// route markers) renders one binding per marker at its own parameter index,
// with `undefined` filling the non-marker optional gaps a positional call must
// still pass. Every site in a group shares the call, so ArgsCount and
// TrailingComma are read from the first. The scanner only emits slots whose
// ParamIndex >= ArgsCount (a written arg at a slot is a pass-through, never a
// site), so the walk below reaches every slot.
func buildGroupInsertion(group []protocol.Site) string {
	if len(group) == 0 {
		return ""
	}
	slots := append([]protocol.Site(nil), group...)
	sort.Slice(slots, func(i, j int) bool { return slots[i].ParamIndex < slots[j].ParamIndex })
	argsCount := slots[0].ArgsCount
	trailingComma := slots[0].TrailingComma
	byIndex := make(map[int]protocol.Site, len(slots))
	maxIndex := argsCount
	for _, slot := range slots {
		byIndex[slot.ParamIndex] = slot
		if slot.ParamIndex > maxIndex {
			maxIndex = slot.ParamIndex
		}
	}
	parts := make([]string, 0, maxIndex-argsCount+1)
	for index := argsCount; index <= maxIndex; index++ {
		if slot, ok := byIndex[index]; ok {
			parts = append(parts, slotBinding(slot))
		} else {
			// A non-marker optional parameter between argsCount and the last
			// marker: a positional call must fill it, so pad with `undefined`.
			parts = append(parts, "undefined")
		}
	}
	body := strings.Join(parts, ", ")
	// Bare body (no leading comma) when there are no prior args OR the arg list
	// already ends with a trailing comma — both put the position right after a
	// separator (`(` or `,`).
	if argsCount == 0 || trailingComma {
		return body
	}
	return ", " + body
}
