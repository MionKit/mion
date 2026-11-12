package cli

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/constants"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/protocol"
)

// withCliTables restores the cli tables when the test ends; resolver rows persist, so each test names its own.
func withCliTables(t *testing.T) {
	t.Helper()
	commands, flags, keys := cloneTable(commandTable), cloneTable(sessionFlagsTable), cloneTable(pluginKeyTable)
	t.Cleanup(func() { *commandTable, *sessionFlagsTable, *pluginKeyTable = commands, flags, keys })
}

func cloneTable[T any](rows *table[T]) table[T] {
	copied := make(map[string]T, len(rows.rows))
	for name, row := range rows.rows {
		copied[name] = row
	}
	return table[T]{kind: rows.kind, order: slices.Clone(rows.order), rows: copied}
}

func mustPanic(t *testing.T, want string, call func()) {
	t.Helper()
	defer func() {
		message, _ := recover().(string)
		if !strings.Contains(message, want) {
			t.Errorf("panic = %q, want one containing %q", message, want)
		}
	}()
	call()
}

func TestExtension_VerbRunsAndJoinsTheHelp(t *testing.T) {
	withCliTables(t)
	if strings.Contains(renderUsage(), "xverb") {
		t.Fatal("help must not list an extension verb before an extension adds it")
	}
	var got []string
	Main([]string{"xverb", "a", "b"}, Extension{Name: "ext-verb", Version: "1.0.0", Commands: []Command{
		{Name: "xverb", Help: "xverb       an extension verb", Run: func(args []string) { got = args }},
	}})
	if !slices.Equal(got, []string{"a", "b"}) {
		t.Fatalf("extension verb args = %v", got)
	}
	usage := renderUsage()
	if !strings.Contains(usage, "    api-types   build a types-only package") || !strings.HasSuffix(strings.Split(usage, "\nRun  mion")[0], "    xverb       an extension verb\n") {
		t.Fatalf("help must list mion's verbs, then the extension's:\n%s", usage)
	}
}

func TestExtension_VersionLine(t *testing.T) {
	if got, want := versionLine(nil), fmt.Sprintf("mion %s (tsgo %s)", constants.Version, constants.TsgoVersion); got != want {
		t.Fatalf("mion version = %q, want %q", got, want)
	}
	got := versionLine([]Extension{{Name: "mion-pro", Version: "dev"}})
	if want := fmt.Sprintf("mion-pro dev (mion %s, tsgo %s)", constants.Version, constants.TsgoVersion); got != want {
		t.Fatalf("extension version = %q, want %q", got, want)
	}
}

func TestExtension_DuplicateAndReplace(t *testing.T) {
	withCliTables(t)
	run := func([]string) {}
	mustPanic(t, "duplicate registration of command serve", func() { registerCommand(Command{Name: "serve", Run: run}) })
	mustPanic(t, "nothing to replace", func() { registerCommand(Command{Name: "xabsent", Run: run, Replace: true}) })
	registerCommand(Command{Name: "serve", Help: "serve       replaced", Run: run, Replace: true})
	if commandTable.rows["serve"].Help != "serve       replaced" || commandTable.order[0] != "serve" {
		t.Fatal("Replace must swap the row in place")
	}

	mustPanic(t, "duplicate registration of session flags enrich", func() { registerSessionFlags(SessionFlags{Name: "enrich"}) })
	mustPanic(t, "nothing to replace", func() { registerSessionFlags(SessionFlags{Name: "xabsent", Replace: true}) })

	mustPanic(t, "duplicate registration of plugin key genDir", func() { registerPluginKey(PluginKey{Name: "genDir"}) })
	registerPluginKey(PluginKey{Name: "genDir", Replace: true})
	registerPluginKey(PluginKey{Name: "xKey"})
	mustPanic(t, "duplicate registration of plugin key xKey", func() { registerPluginKey(PluginKey{Name: "xKey"}) })
	mustPanic(t, "nothing to replace", func() { registerPluginKey(PluginKey{Name: "xOther", Replace: true}) })
}

func TestExtension_SessionFlagsReachOptionsExt(t *testing.T) {
	withCliTables(t)
	registerSessionFlags(SessionFlags{Name: "xflags", Commands: []string{"xcmd"}, Register: func(fs *flag.FlagSet) func(cfg *SessionConfig) {
		value := fs.String("x-flag", "", "an extension flag")
		return func(cfg *SessionConfig) {
			if cfg.Opts.Ext == nil {
				cfg.Opts.Ext = map[string]any{}
			}
			cfg.Opts.Ext["xflags"] = *value
		}
	}})
	dir := canonicalTempDir(t)
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{"compilerOptions":{"plugins":[{"name":"mion","xKey":{"n":1}}]}}`)

	fs := flag.NewFlagSet("xcmd", flag.ContinueOnError)
	shared := RegisterSharedFlags("xcmd", fs)
	if err := fs.Parse([]string{"--cwd", dir, "--x-flag", "on"}); err != nil {
		t.Fatal(err)
	}
	cfg := ResolveSharedConfig(fs, shared, "", false)
	if cfg.Opts.Ext["xflags"] != "on" || string(cfg.Plugin["xKey"]) != `{"n":1}` {
		t.Fatalf("Opts.Ext = %v, Plugin = %v", cfg.Opts.Ext, cfg.Plugin)
	}
	other := flag.NewFlagSet("compile", flag.ContinueOnError)
	RegisterSharedFlags("compile", other)
	if other.Lookup("x-flag") != nil {
		t.Fatal("a row's flags exist only on its own commands")
	}
}

func TestExtension_PluginKeyIsNotUnknown(t *testing.T) {
	withCliTables(t)
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{"compilerOptions":{"plugins":[{"name":"mion","xProKey":true}]}}`)
	if got := unknownPluginKeys(dir, "tsconfig.json"); !slices.Equal(got, []string{"xProKey"}) {
		t.Fatalf("before registration = %v", got)
	}
	registerPluginKey(PluginKey{Name: "xProKey"})
	if got := unknownPluginKeys(dir, "tsconfig.json"); len(got) != 0 {
		t.Fatalf("a registered key must not be unknown: %v", got)
	}
}

func TestExtension_ServeRequestsCarriesExt(t *testing.T) {
	resolver.RegisterOp(resolver.Op{Name: "xEcho", Owner: "ext", Run: func(_ *resolver.Session, request protocol.Request, _ *protocol.Metrics) protocol.Response {
		var seen any
		_ = json.Unmarshal(request.Ext["in"], &seen)
		return protocol.Response{Ext: map[string]any{"seen": seen}}
	}})
	session := resolver.NewServer(resolver.Options{})
	t.Cleanup(session.Close)
	var out bytes.Buffer
	input := json.NewDecoder(strings.NewReader(`{"op":"xEcho","ext":{"in":{"b":2,"a":1}}}` + "\n"))
	serveRequests(session.Dispatch, input, json.NewEncoder(&out), func() error { return nil })
	if got := strings.TrimSpace(out.String()); got != `{"ext":{"seen":{"a":1,"b":2}}}` {
		t.Fatalf("response = %s", got)
	}
}

func TestReadPlugin(t *testing.T) {
	dir := t.TempDir()
	if entry, found, err := ReadPlugin(""); entry != nil || found || err != nil {
		t.Fatal("no tsconfig means no entry and no error")
	}
	path := filepath.Join(dir, "tsconfig.json")
	writeTestFile(t, path, `{"compilerOptions":{"plugins":[{"name":"other"}]}}`)
	if _, found, err := ReadPlugin(path); found || err != nil {
		t.Fatal("an entry naming another plugin is not ours")
	}
	if err := os.WriteFile(path, []byte(`{"compilerOptions": {`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ReadPlugin(path); err == nil {
		t.Fatal("a broken tsconfig is an error")
	}
}
