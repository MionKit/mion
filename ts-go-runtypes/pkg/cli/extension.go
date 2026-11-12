package cli

import (
	"encoding/json"
	"flag"
	"fmt"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/constants"
)

// Extension is what a binary built on mion adds; cmd/mion passes none. Every row joins the same table as
// mion's own rows: a name mion already has panics unless the row sets Replace, and Replace on a name mion
// does not have panics too, so the bump that deletes a built-in forces the switch back to a plain row.
// An extension never feeds a typeID, fnHash or disk fingerprint: it must never change a public answer.
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

// SessionFlags is a group of flags on the commands that build a session ("serve", "compile", …): Register
// adds them to the command's FlagSet and returns what applies them once the config is resolved.
type SessionFlags struct {
	Name     string
	Commands []string // "serve", "compile": where the flags exist
	Register func(fs *flag.FlagSet) func(cfg *SessionConfig)
	Replace  bool
}

// table is one ordered registry with the duplicate / Replace rules above.
type table[T any] struct {
	kind  string
	order []string
	rows  map[string]T
}

func newTable[T any](kind string) *table[T] { return &table[T]{kind: kind, rows: map[string]T{}} }

func (rows *table[T]) add(name string, row T, replace bool) {
	if name == "" {
		panic("cli: " + rows.kind + " registered without a name")
	}
	_, exists := rows.rows[name]
	switch {
	case exists && !replace:
		panic("cli: duplicate registration of " + rows.kind + " " + name)
	case !exists && replace:
		panic("cli: " + rows.kind + " " + name + " is not registered, so there is nothing to replace")
	case !exists:
		rows.order = append(rows.order, name)
	}
	rows.rows[name] = row
}

func (rows *table[T]) list() []T {
	out := make([]T, 0, len(rows.order))
	for _, name := range rows.order {
		out = append(out, rows.rows[name])
	}
	return out
}

var (
	commandTable      = newTable[Command]("command")
	sessionFlagsTable = newTable[SessionFlags]("session flags")
	// pluginKeyTable holds the registered keys beyond the tsRuntypesPlugin json tags.
	pluginKeyTable = newTable[PluginKey]("plugin key")
)

func registerCommand(command Command) { commandTable.add(command.Name, command, command.Replace) }

func registerSessionFlags(row SessionFlags) { sessionFlagsTable.add(row.Name, row, row.Replace) }

// registerPluginKey checks a name against the struct tags as well: a tag is a key mion already has.
func registerPluginKey(key PluginKey) {
	if pluginKeyTags[key.Name] {
		if !key.Replace {
			panic("cli: duplicate registration of plugin key " + key.Name)
		}
		return
	}
	pluginKeyTable.add(key.Name, key, key.Replace)
}

// install adds an extension's rows; the resolver rows take its name as their Owner.
func install(extension Extension) {
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
	for _, command := range commandTable.list() {
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
	for _, raw := range parsed.CompilerOptions.Plugins {
		var entry map[string]json.RawMessage
		if json.Unmarshal(raw, &entry) != nil {
			continue
		}
		var name string
		if json.Unmarshal(entry["name"], &name) == nil && name == "mion" {
			return entry, true, nil
		}
	}
	return nil, false, nil
}
