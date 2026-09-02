// Package diagnostics is the centralised catalog of every non-fatal diagnostic the
// Go binary can emit. Every diagnostic the resolver, pure-fn extractor, and
// RT compiler surface flows through one of the typed constructors in this
// package, so the full set of user-visible messages (codes, severities,
// templates) is auditable in one place.
//
// Wire format: severity and family are encoded as small unsigned integers
// (uint8) to minimise payload size; the TS side mirrors the same numeric
// values as `as const` literal-union enums. The full set of definitions is
// registered via the codes_*.go files via init() so consumers can look up
// any code's Family/Severity/Template at runtime.
package diagnostics

import (
	"fmt"
	"strings"
)

// Severity classifies a Diagnostic's impact. Numeric so the wire form stays
// compact (single digit) and the TS side maps trivially to a literal union.
//
// Severity is purely informational: it does not control runtime behavior.
// An Error-severity diagnostic still lets the build proceed; the runtime
// factory is still rendered (it may throw on first call, but that's the
// emitter's job, not the diagnostic's).
type Severity uint8

const (
	SeverityError   Severity = 1
	SeverityWarning Severity = 2
	SeverityInfo    Severity = 3
)

// SeverityLabel returns the canonical lowercase string used by `tsc
// --pretty=false` and VS Code's $tsc problem matcher.
func SeverityLabel(severity Severity) string {
	switch severity {
	case SeverityError:
		return "error"
	case SeverityWarning:
		return "warning"
	case SeverityInfo:
		return "info"
	}
	return "info"
}

// Family classifies a Diagnostic by which subsystem produced it. Same
// uint8-on-the-wire scheme as Severity. The TS-side reception loop
// branches on this when it needs subsystem-specific routing; today the
// Vite plugin just folds all families through `this.warn`.
type Family uint8

const (
	FamilyPureFn  Family = 1
	FamilyMarker  Family = 2
	FamilyRunType Family = 3
	// FamilyEnrich covers the enrichment-file health checks: tag hygiene
	// (@todo scaffolds, @rtOrphan/@rtOrphanChild carcasses), FriendlyText /
	// MockData content validity, and mirror breadcrumb drift. Emitted only
	// when a caller opts in (Request.CheckEnrich, `mion enrich --no-emit`).
	FamilyEnrich Family = 4
)

// Site is a 1-based source location. Start/End spans are populated by the
// scanner; runtype-family diagnostics (where the source location is the
// marker call site, not the type declaration) leave EndLine/EndCol zero,
// the wire shape preserves the fields for forward compatibility with
// range-aware diagnostics.
type Site struct {
	FilePath  string `json:"filePath"`
	StartLine int    `json:"startLine"`
	StartCol  int    `json:"startCol"`
	EndLine   int    `json:"endLine,omitempty"`
	EndCol    int    `json:"endCol,omitempty"`
}

// Related is a second source location attached to a Diagnostic, e.g. the
// "first registered here" pointer on a body-hash collision. Carries its
// own message because the relationship is asymmetric from the primary.
type Related struct {
	Site
	Message string `json:"message"`
}

// Diagnostic is the single wire shape for everything the Go binary
// emits. The Family discriminator carries which subsystem produced it
// (purefn extractor, marker scanner, runtype RT compiler); the Code is
// the stable identifier (PFE9001, MKR001, VL010, SJ001, …) and Severity
// classifies impact.
//
// The user-facing message is NOT carried on the wire. Per-code message
// templates live in the JS-side catalog (packages/run-types/src/
// runtypes/diagnosticCatalog.ts); the Go side only ships positional substitution
// values via Args (typically 0-2 strings: a property name, a type
// argument label, etc.). The Vite plugin resolves Code+Args → final
// rendered message at format time. This mirrors the runtime alwaysThrow
// pattern that already resolves error text JS-side from the diag code.
type Diagnostic struct {
	Code     string    `json:"code"`
	Family   Family    `json:"family"`
	Severity Severity  `json:"severity"`
	Args     []string  `json:"args,omitempty"`
	Site     Site      `json:"site"`
	Related  []Related `json:"related,omitempty"`
}

// Definition is the catalog entry for a single diagnostic code. Title is
// the short headline used in tooling that wants to render a code list;
// Template is the message template (Go-style `%s` placeholders) the
// constructors substitute against. DocsAnchor is reserved for a future
// reference doc.
//
// Headline and Detail are the USER-FACING wording: Headline is the
// single-line message (mandatory for every code; `{0}`, `{1}` placeholders
// substitute against Diagnostic.Args), Detail the optional multi-line
// explanation + example fix. They are authored in messages.go and folded
// onto the Definition at init; `gen:diag-catalog` exports them into the
// GENERATED front-end dictionary (packages/devtools/src/
// diagnosticCatalog.generated.ts), so the wire keeps carrying only
// code + args while Go stays the single source of every message.
//
// Summary, Fix, and Example are the human-written docs prose for the
// website diagnostics page: Summary is a plain-language description of what
// triggers the code and how to fix it; Fix is an optional corrected
// snippet; Example is the TypeScript source that actually triggers the
// code. They are authored in prose.go and folded onto the Definition at
// init, so the gen-diag-catalog dump exports them alongside severity and
// the website needs no second prose source. Most codes leave them empty
// until written.
//
// Example is more than docs: the standardized suite in
// internal/compiler/resolver/diag_examples_test.go feeds every non-empty Example
// through the real scan pipeline and asserts this code fires, so a shipped
// example can never drift from the diagnostic it claims to demonstrate.
type Definition struct {
	Code     string
	Family   Family
	Severity Severity
	// Completeness marks a code as INCOMPLETE (not-yet-authored) enrichment rather
	// than WRONG content: the unfilled @todo scaffolds (FT020/MD020). It is a
	// gating-policy bit, ORTHOGONAL to Severity: these stay Severity-Error so the
	// editor still flags them, but the default `enrich <file> --no-emit` health
	// check ignores them (a freshly scaffolded mirror is expected to carry @todo
	// blanks). Only the completeness gate (`enrich --require-complete`) fails on
	// them.
	Completeness bool
	// Transient marks a verdict that depends on the machine the build ran on
	// (wall-clock load, a budget that expired) rather than on the type itself:
	// today only the pattern-evaluation timeout (FMT007). The disk cache never
	// persists an entry that emitted one, so the next build re-derives the
	// verdict instead of replaying a load spike as a permanent error. Like
	// Completeness it is orthogonal to Severity: the finding still fails the
	// build it was raised in.
	Transient  bool
	Title      string
	Template   string
	DocsAnchor string
	Headline   string
	Detail     string
	Summary    string
	Fix        string
	Example    string
}

// Definitions holds every registered diagnostic code keyed by Code. The
// codes_*.go files register themselves via init(); the map is read-only
// after init completes.
var Definitions = map[string]Definition{}

func register(definition Definition) {
	if _, exists := Definitions[definition.Code]; exists {
		panic("diag: duplicate registration of code " + definition.Code)
	}
	Definitions[definition.Code] = definition
}

// IsCompleteness reports whether a code marks INCOMPLETE (not-yet-authored)
// enrichment (an unfilled @todo scaffold, FT020/MD020) rather than wrong or
// stale content. The default enrichment health check excludes these from its
// exit-code gate; only the completeness gate (`enrich --require-complete`) fails
// on them. An unregistered code is not a completeness code (a zero-value
// Definition has Completeness false).
func IsCompleteness(code string) bool {
	return Definitions[code].Completeness
}

// IsTransient reports whether a code's verdict depends on the build host
// rather than on the type (see Definition.Transient). The disk cache refuses
// to persist an entry that emitted one. An unregistered code is not
// transient (a zero-value Definition has Transient false).
func IsTransient(code string) bool {
	return Definitions[code].Transient
}

// New builds a Diagnostic by looking up the code's Family/Severity from
// the catalog. Panics if the code is unknown: every code MUST be
// registered before use, so an unknown code is a programmer error.
//
// `args` are positional substitution values for the JS-side catalog
// template: `{0}`, `{1}`, … in headline/detail resolve to args[0], etc.
// Pass 0 args when the catalog entry has no placeholders.
func New(code string, site Site, args ...string) Diagnostic {
	definition, ok := Definitions[code]
	if !ok {
		panic("diag: unknown code " + code)
	}
	out := Diagnostic{
		Code:     code,
		Family:   definition.Family,
		Severity: definition.Severity,
		Site:     site,
	}
	if len(args) > 0 {
		out.Args = args
	}
	return out
}

// NewWithRelated is the variant of New that attaches Related call sites.
// Go can't combine variadic args + variadic related in one function
// signature, so the second variadic moves to a slice parameter here.
func NewWithRelated(code string, site Site, args []string, related ...Related) Diagnostic {
	definition, ok := Definitions[code]
	if !ok {
		panic("diag: unknown code " + code)
	}
	out := Diagnostic{
		Code:     code,
		Family:   definition.Family,
		Severity: definition.Severity,
		Site:     site,
	}
	if len(args) > 0 {
		out.Args = args
	}
	if len(related) > 0 {
		out.Related = related
	}
	return out
}

// FormatDebug renders a Diagnostic in a compact code+args+location form
// suitable for Go-side debug logs and test assertions. NOT the user-
// facing message: the JS-side catalog
// (packages/run-types/src/runtypes/diagnosticCatalog.ts) owns user
// wording; the Vite plugin renders the final tsc-style line.
//
//	<absPath>(<line>,<col>): <severity> <code>(<arg0>, <arg1>, …)
//	  Related: <absPath>(<line>,<col>): <message>
func FormatDebug(diagnostic Diagnostic) string {
	var builder strings.Builder
	fmt.Fprintf(&builder, "%s(%d,%d): %s %s",
		diagnostic.Site.FilePath,
		diagnostic.Site.StartLine,
		diagnostic.Site.StartCol,
		SeverityLabel(diagnostic.Severity),
		diagnostic.Code,
	)
	if len(diagnostic.Args) > 0 {
		fmt.Fprintf(&builder, "(%s)", strings.Join(diagnostic.Args, ", "))
	}
	for _, related := range diagnostic.Related {
		fmt.Fprintf(&builder, "\n  Related: %s(%d,%d): %s",
			related.FilePath,
			related.StartLine,
			related.StartCol,
			related.Message,
		)
	}
	return builder.String()
}
