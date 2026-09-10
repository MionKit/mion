// Package diagnostics is the centralised catalog of every non-fatal diagnostic the
// Go binary can emit. Every diagnostic the resolver, pure-fn extractor, and
// RT compiler surface flows through one of the typed constructors in this
// package, so the full set of user-visible messages (codes, levels,
// templates) is auditable in one place.
//
// Every code declares a Level, the three-way answer to "can the build still
// produce code": LevelError (no), LevelRuntimeError (yes, and it is broken when
// called), LevelWarning (yes, and nothing is wrong). That is the field a code
// author writes; Severity is derived from it.
//
// Wire format: level, severity and family are encoded as small unsigned
// integers (uint8) to minimise payload size; the TS side mirrors the same
// numeric values as `as const` literal-union enums. The full set of definitions
// is registered via the codes_*.go files via init() so consumers can look up
// any code's Family/Level/Template at runtime.
package diagnostics

import (
	"fmt"
	"strings"
)

// Level is a code's THREE-WAY classification, and the one field a code author
// writes. It answers the only question a consumer needs: can the build still
// produce code. Two questions pick it, asked in order:
//
//  1. If we let this through, does the build still produce the code for this?
//  2. If it does, is that code broken when it runs?
//
// No → LevelError. Yes and yes → LevelRuntimeError. Yes and no → LevelWarning.
//
// Question 1 is per-SITE, not per-build. Only CFG001 stops a whole run; the
// other fatal codes each leave one thing unbuilt (no cache entry, no injected
// id, no extracted body) while the rest of the build proceeds. That is still
// "no output" for the thing the finding is about, which is what makes standing
// it down meaningless: not halting buys a call that throws either way.
//
// Numeric so the wire form stays compact and the TS side maps trivially to a
// literal union. Severity is DERIVED from it (see severityOf): the level is the
// verdict, severity is the word a tsc-shaped line and an editor's problem
// matcher need.
type Level uint8

const (
	// LevelError: the build produced NO code for the thing this is about. A
	// project config that will not load (CFG001, the one whole-run stop), a
	// marker whose id could not be computed so no site and no injected id ship
	// (MKR003, MKR010, MKR014), a `batch()` the extractor could not read so no
	// batch id is spliced (BAT001), an output path refused so the file the
	// importer names never lands (CFG003).
	// NEVER downgradeable and NEVER silenceable: there is nothing to accept, so
	// not halting would only ship a call that throws anyway.
	LevelError Level = 1
	// LevelRuntimeError: output IS produced, and it throws or is wrong when
	// called. Two shapes, both on this level. The loud one is an entry rendered
	// as an alwaysThrow factory (VL002). The quiet one is a type that was read
	// wrongly or could not be resolved, so it silently became `any` and the
	// generated validator accepts every value (MKR007, MKR013, TMP001, CFG002) —
	// a type the author DID write as `any` is not this, the permissive validator
	// is then exactly what was asked for (VL021 / VE020 stay warnings).
	// Downgradeable and silenceable: emitting and exiting non-zero is a
	// legitimate thing for a consumer to do with one.
	LevelRuntimeError Level = 2
	// LevelWarning: worth knowing, nothing is wrong. A member with no data form
	// left out of a generated function, an option that is a no-op on this type,
	// an unfilled enrichment scaffold, a suppression comment that named the
	// wrong code.
	LevelWarning Level = 3
)

// Severity classifies a Diagnostic's impact. Numeric so the wire form stays
// compact (single digit) and the TS side maps trivially to a literal union.
//
// Severity is DERIVED from Level and is not authored per code: it is the
// two-way label form the tsc-shaped output line and VS Code's problem matcher
// need, so both LevelError and LevelRuntimeError read as "error" there. Code
// that must tell the two apart reads Level, never Severity.
//
// Severity does not itself control runtime behavior: what acts on a finding is
// the consumer.
type Severity uint8

const (
	SeverityError   Severity = 1
	SeverityWarning Severity = 2
	SeverityInfo    Severity = 3
)

// severityOf is the Level → Severity projection. Both error levels collapse to
// one word because the problem matcher only knows three, and "the build stopped"
// versus "the build emitted something broken" is a Level question.
func severityOf(level Level) Severity {
	if level == LevelWarning {
		return SeverityWarning
	}
	return SeverityError
}

// LevelLabel returns the stable string spelling of a Level, the form the
// generated front-end catalog and the website diagnostics page carry. Unlike
// SeverityLabel this is NOT a tsc word: it is our own three-way name, so it
// keeps the two error levels apart.
func LevelLabel(level Level) string {
	switch level {
	case LevelError:
		return "error"
	case LevelRuntimeError:
		return "runtimeError"
	case LevelWarning:
		return "warning"
	}
	return "error"
}

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
	// FamilyMionRoute covers the mion route rules: the checks that used to
	// ship as hand-written `@mionjs/*` ESLint rules and now run in the
	// compiler, where the checker can see a handler however it is written.
	// Emitted only when a caller opts in (Request.CheckRouterRules), so a
	// build never fails on a lint-only finding.
	FamilyMionRoute Family = 5
)

// Scope says where in a marker's type a code's trigger can sit, and is what
// the depth gate in internal/compiler/resolver/diag_examples_test.go reads. It
// is REQUIRED on every registered code (register panics on the zero value):
// a rule that should hold for the whole type keeps getting implemented for
// the root node only, so every new code has to say which it is, and a graph
// code with an Example must also carry a NestedExample that fires one object
// deeper. Not on the wire.
type Scope uint8

const (
	// ScopeRoot fires for the marker's root type by design (a bare `symbol`,
	// `unknown` at the root, an unresolved type parameter as the whole type
	// argument): moving the trigger inside a property is a different code.
	ScopeRoot Scope = 1
	// ScopeGraph fires wherever its trigger sits in the type: a member one
	// object deeper, an array element, a Map value, a union arm. The trigger
	// is found by a walk (the emit walker, reflection.WalkGraph, or the
	// resolver's checker-type walk), never by a look at the root alone.
	ScopeGraph Scope = 2
	// ScopeNotSource is not raised from a marker's type at all: the call
	// shape, an option, a pure-fn body, the project config, or an enrichment
	// mirror file. There is no "deeper" for it.
	ScopeNotSource Scope = 3
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
// Level rides the wire next to Severity because the fatal-versus-emitted split
// is what the downgrade and suppression rules key on, and a build-halt decision
// must not depend on the GENERATED front-end catalog being in sync: a locally
// built binary can run ahead of it. Severity stays for the label and the lint
// tier.
type Diagnostic struct {
	Code     string    `json:"code"`
	Family   Family    `json:"family"`
	Severity Severity  `json:"severity"`
	Level    Level     `json:"level"`
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
// onto the Definition at init; `miondevx core codegen diag` exports them into the
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
	Code   string
	Family Family
	// Level is the code's three-way classification and the field a code author
	// WRITES (see Level). Required: register panics on the zero value.
	Level Level
	// Severity is DERIVED from Level by register; never write it in a codes_*.go
	// literal. It is the label form the tsc-shaped line needs.
	Severity Severity
	// Completeness marks a code as INCOMPLETE (not-yet-authored) enrichment rather
	// than WRONG content: the unfilled @todo scaffolds and blank values
	// (FT020/FT023, MD020/MD023). It is a gating-policy bit, ORTHOGONAL to Level:
	// the codes are LevelWarning (a mirror with blank labels still runs), so the
	// default `enrich <file> --no-emit` health check reports and exits 0, and this
	// bit is what the completeness gate (`enrich --require-complete`) and the
	// bundler's production enrichment gate PROMOTE to a failure. Those two gates
	// must key on this bit, never on the level, or they stop working.
	Completeness bool
	// Transient marks a verdict that depends on the machine the build ran on
	// (wall-clock load, a budget that expired) rather than on the type itself:
	// today only the pattern-evaluation timeout (FMT007). The disk cache never
	// persists an entry that emitted one, so the next build re-derives the
	// verdict instead of replaying a load spike as a permanent error. Like
	// Completeness it is orthogonal to Severity: the finding still fails the
	// build it was raised in.
	Transient bool
	// Scope is where the trigger can sit in the marker's type (see Scope).
	// Required: register panics without it.
	Scope      Scope
	Title      string
	Template   string
	DocsAnchor string
	Headline   string
	Detail     string
	Summary    string
	Fix        string
	Example    string
	// NestedExample is the Example with its trigger moved one object deeper
	// (the same member inside a nested object literal, array, Map or union).
	// Required for a ScopeGraph code that carries an Example; the depth gate
	// feeds it through the scan and asserts the code still fires.
	NestedExample string
}

// Definitions holds every registered diagnostic code keyed by Code. The
// codes_*.go files register themselves via init(); the map is read-only
// after init completes.
var Definitions = map[string]Definition{}

func register(definition Definition) {
	if _, exists := Definitions[definition.Code]; exists {
		panic("diag: duplicate registration of code " + definition.Code)
	}
	if definition.Scope == 0 {
		panic("diag: code " + definition.Code + " declares no Scope (ScopeRoot / ScopeGraph / ScopeNotSource)")
	}
	if definition.Level == 0 {
		panic("diag: code " + definition.Code + " declares no Level (LevelError / LevelRuntimeError / LevelWarning)")
	}
	if definition.Severity != 0 {
		panic("diag: code " + definition.Code + " writes Severity; it is derived from Level")
	}
	definition.Severity = severityOf(definition.Level)
	Definitions[definition.Code] = definition
}

// LevelOf returns a code's Level. An unregistered code reads as LevelError:
// nothing may downgrade or silence a finding the catalog cannot vouch for, so
// the unknown case fails closed.
func LevelOf(code string) Level {
	definition, registered := Definitions[code]
	if !registered {
		return LevelError
	}
	return definition.Level
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
		Level:    definition.Level,
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
		Level:    definition.Level,
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
