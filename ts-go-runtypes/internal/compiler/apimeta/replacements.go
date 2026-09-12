package apimeta

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// SiteBinding is the import binding a dispatch site's module exports, and the
// identifier the splice writes into the call: `__rt_s$2Fusers$2FgetById`.
func (site Site) SiteBinding() string {
	return entrymodules.BindingName(site.ModuleBasename())
}

// MethodBinding is the export of a per-method module.
func MethodBinding(id string) string {
	return entrymodules.BindingName(MethodModuleBasename(id))
}

// Replacements turns the sites into the transform's point insertions. The
// anchor gets the mode as a plain string literal (no ImportFrom); a dispatch
// site gets its module binding, with ImportFrom naming the site module under
// the `rtapi:/` scheme, which the same relativizers that place `rtmod:/`
// imports turn into a path under <outDir>/api, and ImportBinding naming the
// export, since the spliced Text also carries the padding and the comma.
func Replacements(sites []Site) []protocol.Replacement {
	out := make([]protocol.Replacement, 0, len(sites))
	for _, site := range sites {
		binding := site.SiteBinding()
		out = append(out, protocol.Replacement{
			File:          site.FilePath,
			Start:         site.InjectPos,
			End:           site.InjectPos,
			Text:          site.spliceText(binding),
			ImportFrom:    constants.ApiModulePrefix + site.ModuleBasename() + constants.EntryModuleSuffix,
			ImportBinding: binding,
		})
	}
	return out
}

// spliceText renders the trailing argument(s) the splice appends at the
// call's closing `)`: `value` preceded by one `undefined` per skipped optional
// slot, and by `, ` unless the call has no argument yet (`sub.call()`) or its
// list already ends with a trailing comma. Same shape as
// purefunctions.TrailingArgText, plus the empty-list case a dispatch call has.
func (site Site) spliceText(value string) string {
	text := strings.Repeat("undefined, ", site.InjectPad) + value
	if site.ArgsCount == 0 || site.TrailingComma {
		return text
	}
	return ", " + text
}
