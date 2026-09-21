package apimeta

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// SiteBinding is the export of a dispatch site's module, and the identifier the splice writes into the call.
func (site Site) SiteBinding() string {
	return entrymodules.BindingName(site.ModuleBasename())
}

// MethodBinding is the export of a per-method module.
func MethodBinding(id string) string {
	return entrymodules.BindingName(MethodModuleBasename(id))
}

// Replacements turns the sites into point insertions. ImportFrom names the site module under the `rtapi:/`
// scheme, which the relativizers that place `rtmod:/` imports turn into a path under <outDir>/api, and
// ImportBinding names the export, since the spliced Text also carries the padding and the comma.
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

// spliceText renders the trailing arguments appended at the call's closing `)`, the shape of
// purefunctions.TrailingArgText plus the empty-list case a dispatch call has.
func (site Site) spliceText(value string) string {
	text := strings.Repeat("undefined, ", site.InjectPad) + value
	if site.ArgsCount == 0 || site.TrailingComma {
		return text
	}
	return ", " + text
}
