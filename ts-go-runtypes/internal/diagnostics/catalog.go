// Package diagnostics is the one catalog of every diagnostic the Go binary emits, so codes, levels and messages
// are auditable in one place. Level, severity and family go on the wire as uint8, mirrored TS-side as literal
// unions; the codes_*.go files register through init().
package diagnostics

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Level is the one field a code author writes, picked by two questions asked in order:
//
//  1. If we let this through, does the build still produce the code for this?
//  2. If it does, is that code broken when it runs?
//
// No → LevelError. Yes and yes → LevelRuntimeError. Yes and no → LevelWarning, or LevelInfo for documented behaviour or advice.
//
// Question 1 is per-SITE, not per-build: only CFG001 stops a whole run, every other fatal code
// leaves one thing unbuilt while the build proceeds, which is what makes standing it down
// meaningless. Severity is DERIVED from it (severityOf): the level is the verdict, severity the
// word the printed line needs. Numeric to keep the wire compact.
type Level uint8

const (
	// LevelError: the build produced NO code for the thing this is about: a config that will not
	// load (CFG001, the one whole-run stop), a marker whose id could not be computed (MKR003,
	// MKR010, MKR014), an unreadable `batch()` (BAT001), a refused output path (CFG003).
	// NEVER downgradeable and NEVER silenceable: not halting would only ship a call that throws.
	LevelError Level = 1
	// LevelRuntimeError: output IS produced and it throws (an alwaysThrow factory, VL002) or is
	// wrong when called (a type that silently became `any`, so the validator accepts every value:
	// MKR007, MKR013, TMP001, CFG002). A type the author DID write as `any` is not this, the
	// permissive validator is what was asked for (VL021 / VE020 are LevelInfo).
	// Downgradeable and silenceable: emitting and exiting non-zero is legitimate for a consumer.
	LevelRuntimeError Level = 2
	// LevelWarning: worth knowing, nothing is wrong. A member with no data form left out of a
	// generated function, a no-op option, an unfilled scaffold, a suppression naming a wrong code.
	LevelWarning Level = 3
	// LevelInfo: documented behaviour (a method left out of a validator, a validator on a written `any`) or advice.
	// Hidden unless `levels: 'all'`; it never stops anything.
	LevelInfo Level = 4
)

// Severity is DERIVED from Level, never authored per code; both error levels read "error", so code that must
// tell them apart reads Level. It controls nothing, the consumer decides. Numeric to keep the wire compact.
type Severity uint8

const (
	SeverityError   Severity = 1
	SeverityWarning Severity = 2
	SeverityInfo    Severity = 3
)

// severityOf projects Level onto Severity; both error levels collapse to one word the problem
// matcher knows, and telling them apart is a Level question.
func severityOf(level Level) Severity {
	switch level {
	case LevelWarning:
		return SeverityWarning
	case LevelInfo:
		return SeverityInfo
	}
	return SeverityError
}

// LevelLabel returns a Level's stable spelling, the form the generated front-end catalog and the
// website carry. NOT a tsc word: our own level name, so it keeps the two error levels apart.
func LevelLabel(level Level) string {
	switch level {
	case LevelError:
		return "error"
	case LevelRuntimeError:
		return "runtimeError"
	case LevelWarning:
		return "warning"
	case LevelInfo:
		return "info"
	}
	return "error"
}

// SeverityLabel returns the lowercase word `tsc --pretty=false` prints.
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

// Family classifies a Diagnostic by which subsystem produced it, for TS-side routing; no consumer
// routes per family today. Same uint8-on-the-wire scheme as Severity.
type Family uint8

const (
	FamilyPureFn  Family = 1
	FamilyMarker  Family = 2
	FamilyRunType Family = 3
	// FamilyEnrich covers the enrichment-file health checks: tag hygiene, FriendlyText / MockData
	// content validity, mirror drift. Emitted only on opt-in (Request.CheckEnrich).
	FamilyEnrich Family = 4
	// FamilyMionRoute covers the mion route rules, run in the compiler so the checker sees a handler
	// however it is written. Emitted only on opt-in (Request.CheckRouterRules), so a build never
	// fails on a lint-only finding.
	FamilyMionRoute Family = 5
)

// Scope says where in a marker's type a code's trigger can sit, and is what the depth gate in
// internal/compiler/resolver/diag_examples_test.go reads. REQUIRED on every registered code
// (register panics on the zero value), because a whole-type rule keeps getting implemented for the
// root node only; a ScopeGraph code with an Example must also carry a NestedExample firing one
// object deeper. Not on the wire.
type Scope uint8

const (
	// ScopeRoot fires for the marker's root type by design: the same trigger inside a property is a
	// different code.
	ScopeRoot Scope = 1
	// ScopeGraph fires wherever its trigger sits: a member one object deeper, an array element, a
	// Map value, a union arm. Found by a walk, never by a look at the root alone.
	ScopeGraph Scope = 2
	// ScopeNotSource is not raised from a marker's type at all (the call shape, an option, a pure-fn
	// body, the config, a mirror file), so there is no "deeper" for it.
	ScopeNotSource Scope = 3
)

// Site is a 1-based source location. Runtype-family diagnostics point at the marker call site, not
// the type declaration, and leave EndLine/EndCol zero.
type Site struct {
	FilePath  string `json:"filePath"`
	StartLine int    `json:"startLine"`
	StartCol  int    `json:"startCol"`
	EndLine   int    `json:"endLine,omitempty"`
	EndCol    int    `json:"endCol,omitempty"`
}

// Related is a second location on a Diagnostic (the "first registered here" pointer on a body-hash
// collision); it carries its own message because the relationship is asymmetric from the primary.
type Related struct {
	Site
	Message string `json:"message"`
}

// Diagnostic is the single wire shape for everything the Go binary emits; Code is the stable id (PJ001, MKR001, …).
// Messages are NOT on the wire: templates live in packages/devtools/src/core/diagnosticCatalog.ts and Args carries
// 0-2 values; runtime alwaysThrow text is the exception, rendered whole by Go. Level rides beside Severity because
// downgrade and suppression key on it, and a halt decision must not trust the generated front-end catalog, which a
// locally built binary can run ahead of. Severity stays for the label and the lint tier.
type Diagnostic struct {
	Code     string    `json:"code"`
	Family   Family    `json:"family"`
	Severity Severity  `json:"severity"`
	Level    Level     `json:"level"`
	Args     []string  `json:"args,omitempty"`
	Site     Site      `json:"site"`
	Related  []Related `json:"related,omitempty"`
	// Downgraded is set when a source-level `@mion-downgrade-error` comment claimed this finding.
	// Level and Severity stay whatever the catalog says, so a consumer deciding whether to halt reads
	// this flag alongside its own `downgradeErrors` setting.
	Downgraded bool `json:"downgraded,omitempty"`
}

// Definition is one code's catalog entry; messages.go folds on Headline, prose.go the website text (Summary mandatory).
// `{0}`, `{1}` in Headline substitute against Diagnostic.Args, so the wire carries only code + args.
// internal/compiler/resolver/diag_examples_test.go asserts every non-empty Example really fires this code.
type Definition struct {
	Code   string
	Family Family
	// Level is the code's level and the field a code author
	// WRITES (see Level). Required: register panics on the zero value.
	Level Level
	// Severity is DERIVED from Level by register; never write it in a codes_*.go
	// literal. It is the label form the tsc-shaped line needs.
	Severity Severity
	// Completeness marks INCOMPLETE (not-yet-authored) enrichment rather than WRONG content
	// (FT020/FT023, MD020/MD023). A gating bit ORTHOGONAL to Level: those codes are LevelWarning, so
	// the default health check exits 0, and `enrich --require-complete` plus the bundler's production
	// gate PROMOTE this bit to a failure. Both must key on the bit, never on the level.
	Completeness bool
	// Transient marks a verdict that depends on the build host rather than the type: today only the
	// pattern-evaluation timeout (FMT007). The disk cache never persists an entry that emitted one,
	// so the next build re-derives it instead of replaying a load spike as a permanent error. The
	// finding still fails the build it was raised in.
	Transient bool
	// Internal marks a code that only a bug in mion can raise; the website lists it with an "internal error" badge.
	Internal bool
	// Scope is where the trigger can sit in the marker's type (see Scope).
	// Required: register panics without it.
	Scope Scope
	// Raised narrows which passes can raise the code; the zero value is every pass. A directive naming a code
	// the pass cannot raise is never judged unused there (see PassScope).
	Raised     Raised
	Title      string
	Template   string
	DocsAnchor string
	Headline   string
	Summary    string
	Fix        string
	Example    string
	// NestedExample is the Example with its trigger moved one object deeper
	// (the same member inside a nested object literal, array, Map or union).
	// Required for a ScopeGraph code that carries an Example; the depth gate
	// feeds it through the scan and asserts the code still fires.
	NestedExample string
}

// Raised is a bit set of the conditions a code needs before a pass can raise it.
type Raised uint8

const (
	// RaisedWholeProgram: only a whole-program pass (generate, dump) sees it, never a per-file scan.
	RaisedWholeProgram Raised = 1 << iota
	// RaisedBundleApi: a per-file scan raises it only with the bundleApi lane on (the linter runs with it off).
	RaisedBundleApi
)

// Definitions holds every registered code, keyed by Code; the codes_*.go files fill it from init()
// and it is read-only afterwards.
var Definitions = map[string]Definition{}

func register(definition Definition) {
	if _, exists := Definitions[definition.Code]; exists {
		panic("diag: duplicate registration of code " + definition.Code)
	}
	if definition.Scope == 0 {
		panic("diag: code " + definition.Code + " declares no Scope (ScopeRoot / ScopeGraph / ScopeNotSource)")
	}
	if definition.Level == 0 {
		panic("diag: code " + definition.Code + " declares no Level (LevelError / LevelRuntimeError / LevelWarning / LevelInfo)")
	}
	if definition.Severity != 0 {
		panic("diag: code " + definition.Code + " writes Severity; it is derived from Level")
	}
	definition.Severity = severityOf(definition.Level)
	Definitions[definition.Code] = definition
}

// LevelOf returns a code's Level. An unregistered code fails closed as LevelError: nothing may
// downgrade or silence a finding the catalog cannot vouch for.
func LevelOf(code string) Level {
	definition, registered := Definitions[code]
	if !registered {
		return LevelError
	}
	return definition.Level
}

// ScopeOf returns a code's Scope. An unregistered code reads as the widest answer, ScopeGraph:
// narrowing one the catalog cannot vouch for would drop the finding silently.
func ScopeOf(code string) Scope {
	definition, registered := Definitions[code]
	if !registered {
		return ScopeGraph
	}
	return definition.Scope
}

// IsCompleteness reports whether a code marks INCOMPLETE enrichment rather than wrong content. The
// default health check excludes these from its exit-code gate; only `enrich --require-complete`
// fails on them. An unregistered code answers false.
func IsCompleteness(code string) bool {
	return Definitions[code].Completeness
}

// IsTransient reports whether a code's verdict depends on the build host rather than on the type
// (see Definition.Transient). The disk cache refuses to persist an entry that emitted one.
func IsTransient(code string) bool {
	return Definitions[code].Transient
}

// New builds a Diagnostic from the catalog entry, and panics on an unknown code: every code MUST be
// registered before use. `args` are the positional values `{0}`, `{1}`, … resolve to.
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

// NewWithRelated is New with Related sites attached; args turns into a slice because Go allows only
// one variadic parameter.
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

var headlineArgRE = regexp.MustCompile(`\{(\d+)\}`)

// renderHeadline is the Go twin of renderHeadline in packages/devtools/src/core/diagnosticCatalog.ts.
func renderHeadline(code string, args []string) string {
	definition, ok := Definitions[code]
	if !ok {
		return "Unrecognised diagnostic code (" + code + ") — please file an issue."
	}
	return headlineArgRE.ReplaceAllStringFunc(definition.Headline, func(placeholder string) string {
		index, _ := strconv.Atoi(placeholder[1 : len(placeholder)-1])
		if index < len(args) {
			return args[index]
		}
		return ""
	})
}

// Format renders the line `mion compile` prints, the same shape as formatTscDiagnostic in the bundler plugin.
func Format(diagnostic Diagnostic, downgraded bool) string {
	severity, suffix := diagnostic.Severity, ""
	if downgraded {
		severity, suffix = SeverityWarning, " "+DowngradedNote
	}
	var builder strings.Builder
	fmt.Fprintf(&builder, "%s(%d,%d): %s %s: %s%s",
		diagnostic.Site.FilePath,
		diagnostic.Site.StartLine,
		diagnostic.Site.StartCol,
		SeverityLabel(severity),
		diagnostic.Code,
		renderHeadline(diagnostic.Code, diagnostic.Args),
		suffix,
	)
	for _, related := range diagnostic.Related {
		fmt.Fprintf(&builder, "\n  Related: %s(%d,%d): %s", related.FilePath, related.StartLine, related.StartCol, related.Message)
	}
	return builder.String()
}

// FormatDebug renders a Diagnostic for Go-side debug logs and test assertions.
// NOT the user-facing message: packages/devtools/src/core/diagnosticCatalog.ts owns user wording.
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
