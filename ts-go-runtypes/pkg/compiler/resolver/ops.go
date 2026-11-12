package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/pkg/protocol"
)

// Op is one protocol op; it runs on the session goroutine like a built-in. metrics may be nil.
type Op struct {
	Name  string
	Run   func(sess *Session, request protocol.Request, metrics *protocol.Metrics) protocol.Response
	Owner string // "" for mion, else the extension name (cli.Main sets it)
	// Replace swaps a registered op of the same name; on an absent name it panics.
	Replace bool
}

// ScanCheck is an opt-in diagnostics pass over a scanFiles request's Files, run after the HMR signals are read.
type ScanCheck struct {
	Name   string
	Family diagnostics.Family
	// Probe is JS regex source (compiled with `m`): a file it matches needs the resolver pass in lint.
	Probe string
	// Enabled picks the requests the check runs on; nil means protocol.ExtFlag(Name).
	Enabled func(protocol.Request) bool
	Run     func(sess *Session, files []string) []diagnostics.Diagnostic
	Owner   string // "" for mion, else the extension name (cli.Main sets it)
	Replace bool
}

// registry is one extension table: rows by name in registration order. A name already present panics unless the
// row replaces it, and replacing an absent name panics, so the bump that deletes a built-in forces a plain row.
type registry[T any] struct {
	kind  string
	order []string
	rows  map[string]T
}

func newRegistry[T any](kind string) *registry[T] {
	return &registry[T]{kind: kind, rows: map[string]T{}}
}

func (table *registry[T]) add(name string, row T, replace bool) {
	if name == "" {
		panic("resolver: " + table.kind + " registered without a name")
	}
	_, exists := table.rows[name]
	switch {
	case exists && !replace:
		panic("resolver: duplicate registration of " + table.kind + " " + name)
	case !exists && replace:
		panic("resolver: " + table.kind + " " + name + " is not registered, so there is nothing to replace")
	case !exists:
		table.order = append(table.order, name)
	}
	table.rows[name] = row
}

// list returns the rows in registration order; a replaced row keeps its slot.
func (table *registry[T]) list() []T {
	out := make([]T, 0, len(table.order))
	for _, name := range table.order {
		out = append(out, table.rows[name])
	}
	return out
}

var (
	opTable        = newRegistry[Op]("op")
	scanCheckTable = newRegistry[ScanCheck]("scan check")
)

// RegisterOp adds an op to the table dispatch looks every request up in.
func RegisterOp(op Op) {
	opTable.add(op.Name, op, op.Replace)
}

// RegisterScanCheck adds a pass to every scanFiles request it is enabled on.
func RegisterScanCheck(check ScanCheck) {
	if check.Enabled == nil {
		check.Enabled = protocol.ExtFlag(check.Name)
	}
	scanCheckTable.add(check.Name, check, check.Replace)
}

// mion's own ops and checks are rows of the same tables, so a built-in and an extension take one code path.
func init() {
	for _, op := range []Op{
		{Name: protocol.OpScanFiles, Run: (*Session).opScanFiles},
		{Name: protocol.OpDump, Run: (*Session).opDump},
		{Name: protocol.OpGenerate, Run: (*Session).opGenerate},
		{Name: protocol.OpSetSources, Run: (*Session).opSetSources},
		{Name: protocol.OpReset, Run: (*Session).opReset},
		{Name: protocol.OpEnrich, Run: func(sess *Session, request protocol.Request, _ *protocol.Metrics) protocol.Response {
			return sess.dispatchEnrich(request)
		}},
		{Name: protocol.OpTsCompile, Run: (*Session).opTsCompile},
		{Name: protocol.OpTransform, Run: (*Session).opTransform},
		{Name: protocol.OpCapabilities, Run: (*Session).opCapabilities},
	} {
		RegisterOp(op)
	}
	RegisterScanCheck(ScanCheck{
		Name:    "checkEnrich",
		Family:  diagnostics.FamilyEnrich,
		Enabled: func(request protocol.Request) bool { return request.CheckEnrich },
		Run:     (*Session).checkEnrichFiles,
	})
	RegisterScanCheck(ScanCheck{
		Name:    "checkRouterRules",
		Family:  diagnostics.FamilyMionRoute,
		Enabled: func(request protocol.Request) bool { return request.CheckRouterRules },
		Run:     (*Session).checkRouterRuleFiles,
	})
}

// Options returns the session's spawn-time configuration.
func (sess *Session) Options() Options { return sess.opts }

// SourceFile returns the Program's source file for a requested path (relative to the session cwd, or absolute).
func (sess *Session) SourceFile(file string) (*ast.SourceFile, error) { return sess.sourceFile(file) }

// AbsPath resolves a path against the session's working directory.
func (sess *Session) AbsPath(file string) string { return sess.absPath(file) }

// ResolveOutDir is the session's absolute output root: --gen-dir, else the tsconfig genDir, else <srcDir>/.mion.
func (sess *Session) ResolveOutDir() string { return sess.resolveOutDir() }

// InferredConfig is the project tsconfig parsed once per session; nil with no error means none was named.
func (sess *Session) InferredConfig() (*program.InferredConfig, error) {
	return sess.ensureInferredConfig(sess.workingDir())
}

// ProgramSourceFiles lists the Program's non-declaration files.
func (sess *Session) ProgramSourceFiles() []string { return sess.programSourceFiles() }
