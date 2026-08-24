package mirror

// Tag literals shared by the emitters (this package WRITES them into mirror
// files) and every detector that must find them again — the hygiene scan
// (hygiene.go), the prune regex (reconcile.go), and, via cmd/gen-ts-constants,
// the JS-side lint pre-filter in ts-runtypes-devtools. Deriving every emit and
// every match from these constants is what makes emitter/detector drift
// impossible; never inline a tag string elsewhere.
const (
	// RtTypeTag / RtIdsTag lead a live const's reconcile marker
	// (`/** @rtType <Name>#<id> @rtIds {field: id, …} */`). Legitimate on
	// every generated const — the hygiene scan must NEVER flag them.
	RtTypeTag = "@rtType"
	RtIdsTag  = "@rtIds"
	// TodoTag flags a freshly-scaffolded const that still needs real data.
	// DELIBERATELY outside the @rt namespace — see todoComment in helpers.go.
	TodoTag = "@todo"
	// OrphanTag wraps a whole-const carcass (`/* @rtOrphan … */`) whose
	// source type disappeared; OrphanChildTag wraps a single dropped field
	// (`/* @rtOrphanChild … */`). Both are removed only by `gen --prune`.
	OrphanTag      = "@rtOrphan"
	OrphanChildTag = OrphanTag + "Child"
)

// TodoLine is the exact scaffold line ConstBlock stamps on a new const
// (without its trailing newline).
const TodoLine = "// " + TodoTag + ": generated skeleton — fill in real data, then delete this line"

// MarkerCommentPrefix opens every reconcile marker MarkerComment emits
// (`/** @rtType <Name>#<id> … */`). The enrichment-file guard keys on this
// EMIT form rather than the bare tag, so source files that merely mention
// "@rtType" in a string or comment never read as mirrors.
const MarkerCommentPrefix = "/** " + RtTypeTag + " "

// OrphanBlockPatternSource is the regex body matching both orphan-block forms
// (`/* @rtOrphan … */` and `/* @rtOrphanChild … */`, non-greedy to the first
// ` */`). Kept free of the `(?s)` prefix so the SAME source compiles on both
// halves: Go prepends `(?s)` (reconcile.go), JS constructs it with the `s`
// flag (ts-runtypes-devtools lint entry, synced via gen:ts-constants).
const OrphanBlockPatternSource = `/\* ` + OrphanTag + `(?:Child)? .*? \*/`
