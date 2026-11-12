package resolver

import (
	"github.com/mionkit/mion/ts-go-runtypes/pkg/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/protocol"
)

// extensions are the binary's extensions in registration order, as the capabilities op names them.
var extensions []protocol.ExtensionInfo

// RegisterExtension names an extension built into this binary; a name registered twice panics.
func RegisterExtension(name, version string) {
	for _, known := range extensions {
		if known.Name == name {
			panic("resolver: duplicate registration of extension " + name)
		}
	}
	extensions = append(extensions, protocol.ExtensionInfo{Name: name, Version: version})
}

// opCapabilities lists the extension rows only (Owner != ""), so the public binary answers every list empty.
func (sess *Session) opCapabilities(protocol.Request, *protocol.Metrics) protocol.Response {
	capabilities := &protocol.Capabilities{
		Extensions:  append([]protocol.ExtensionInfo{}, extensions...),
		Ops:         []string{},
		ScanChecks:  []protocol.ScanCheckInfo{},
		Diagnostics: diagnostics.Catalog(func(definition diagnostics.Definition) bool { return definition.Owner != "" }),
	}
	for _, op := range opTable.list() {
		if op.Owner != "" {
			capabilities.Ops = append(capabilities.Ops, op.Name)
		}
	}
	for _, check := range scanCheckTable.list() {
		if check.Owner != "" {
			capabilities.ScanChecks = append(capabilities.ScanChecks, protocol.ScanCheckInfo{
				Name: check.Name, Family: diagnostics.FamilyLabel(check.Family), Probe: check.Probe,
			})
		}
	}
	return protocol.Response{Capabilities: capabilities}
}
