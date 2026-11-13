package cli

import (
	"encoding/json"
	"flag"
	"fmt"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/constants"
)

// Extension is what a binary built on mion adds; cmd/mion passes none. Rows follow resolver.Registry's Replace rules.
// An extension never feeds a typeID, fnHash or disk fingerprint: it must never change a public answer.
// Every row, and any diagnostics.Register* call, happens before cli.Main serves: the tables are not locked.
type Extension struct {
	Name, Version string // "mion-pro", its own version; mion's rides pkg/constants
	Commands      []Command
	PluginKeys    []PluginKey
	SessionFlags  []SessionFlags
	Ops           []resolver.Op
	ScanChecks    []resolver.ScanCheck
	GenDirEntries []resolver.GenDirEntry
}

// Command is one top-level verb.
type Command struct {
	Name    string
	Help    string // the usage line, rendered verbatim
	Run     func(args []string)
	Replace bool
}

// PluginKey is an extra key of the tsconfig `mion` plugin entry, so it is never reported as unknown.
type PluginKey struct {
	Name    string
	Replace bool
}

// SessionFlags is a group of flags on session-building commands; Register returns what applies them once resolved.
type SessionFlags struct {
	Name     string
	Commands []string // "serve", "compile": where the flags exist
	Register func(fs *flag.FlagSet) func(cfg *SessionConfig)
	Replace  bool
}

var (
	commandTable      = resolver.NewRegistry[Command]("command")
	sessionFlagsTable = resolver.NewRegistry[SessionFlags]("session flags")
	// pluginKeyTable holds the registered keys beyond the tsRuntypesPlugin json tags.
	pluginKeyTable = resolver.NewRegistry[PluginKey]("plugin key")
)

func registerCommand(command Command) { commandTable.Add(command.Name, command, command.Replace) }

func registerSessionFlags(row SessionFlags) { sessionFlagsTable.Add(row.Name, row, row.Replace) }

// registerPluginKey checks a name against the struct tags as well: a tag is a key mion already has.
func registerPluginKey(key PluginKey) {
	if pluginKeyTags[key.Name] {
		if !key.Replace {
			panic("mion: duplicate registration of plugin key " + key.Name)
		}
		return
	}
	pluginKeyTable.Add(key.Name, key, key.Replace)
}

// install adds an extension's rows; the resolver rows take its name as their Owner. An empty name panics: its rows
// would read as mion's own and the capabilities op would hide them.
func install(extension Extension) {
	if extension.Name == "" {
		panic("mion: an extension needs a Name")
	}
	resolver.RegisterExtension(extension.Name, extension.Version)
	for _, command := range extension.Commands {
		registerCommand(command)
	}
	for _, key := range extension.PluginKeys {
		registerPluginKey(key)
	}
	for _, row := range extension.SessionFlags {
		registerSessionFlags(row)
	}
	for _, op := range extension.Ops {
		op.Owner = extension.Name
		resolver.RegisterOp(op)
	}
	for _, check := range extension.ScanChecks {
		check.Owner = extension.Name
		resolver.RegisterScanCheck(check)
	}
	for _, entry := range extension.GenDirEntries {
		entry.Owner = extension.Name
		resolver.RegisterGenDirEntry(entry)
	}
}

// renderUsage is the top-level help: one line per command row, mion's own first.
func renderUsage() string {
	var builder strings.Builder
	builder.WriteString(usageHeader)
	for _, command := range commandTable.List() {
		builder.WriteString("    " + command.Help + "\n")
	}
	builder.WriteString(usageFooter)
	return builder.String()
}

// versionLine is mion's `--version`; with extensions it leads with theirs and keeps mion's in parentheses.
func versionLine(extensions []Extension) string {
	if len(extensions) == 0 {
		return fmt.Sprintf("mion %s (tsgo %s)", constants.Version, constants.TsgoVersion)
	}
	names := make([]string, len(extensions))
	for i, extension := range extensions {
		names[i] = extension.Name + " " + extension.Version
	}
	return fmt.Sprintf("%s (mion %s, tsgo %s)", strings.Join(names, ", "), constants.Version, constants.TsgoVersion)
}

// ReadPlugin returns the raw `mion` entry of a tsconfig's compilerOptions.plugins, so an extension verb reads its
// own keys. No tsconfig path, or no entry, is (nil, false, nil); an unreadable or unparseable file is an error.
func ReadPlugin(tsconfigPath string) (map[string]json.RawMessage, bool, error) {
	if tsconfigPath == "" {
		return nil, false, nil
	}
	parsed, ok := parseTsconfig(tsconfigPath)
	if !ok {
		return nil, false, fmt.Errorf("tsconfig %s: cannot parse", tsconfigPath)
	}
	raw, found := mionPluginEntry(parsed)
	if !found {
		return nil, false, nil
	}
	var entry map[string]json.RawMessage
	if err := json.Unmarshal(raw, &entry); err != nil {
		return nil, false, fmt.Errorf("tsconfig %s: mion plugin entry: %w", tsconfigPath, err)
	}
	return entry, true, nil
}
