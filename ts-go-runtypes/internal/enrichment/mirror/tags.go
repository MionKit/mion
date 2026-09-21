package mirror

// Tag literals shared by the emitters that WRITE them and every detector that must find them again, the JS-side lint
// pre-filter included (via cmd/gen-ts-constants). Never inline a tag string elsewhere, or emitter and detector can drift.
const (
	// RtTypeTag / RtIdsTag lead a live const's reconcile marker, legitimate on every generated const: hygiene never flags them.
	RtTypeTag = "@rtType"
	RtIdsTag  = "@rtIds"
	// TodoTag flags a freshly-scaffolded const that still needs real data, DELIBERATELY outside the @rt namespace.
	TodoTag = "@todo"
	// OrphanTag wraps a whole-const carcass whose source type disappeared, OrphanChildTag one dropped field.
	// Both are removed only by `enrich --prune`.
	OrphanTag      = "@rtOrphan"
	OrphanChildTag = OrphanTag + "Child"
)

// TodoLine is the exact scaffold line ConstBlock stamps on a new const, without its trailing newline.
const TodoLine = "// " + TodoTag + ": generated skeleton — fill in real data, then delete this line"

// MarkerCommentPrefix opens every reconcile marker MarkerComment emits.
// The enrichment-file guard keys on this EMIT form, so a source merely mentioning "@rtType" never reads as a mirror.
const MarkerCommentPrefix = "/** " + RtTypeTag + " "

// OrphanBlockPatternSource matches both orphan-block forms, non-greedy to the first ` */`.
// It carries no `(?s)` prefix so the SAME source compiles on both halves: Go prepends it, JS passes the `s` flag.
const OrphanBlockPatternSource = `/\* ` + OrphanTag + `(?:Child)? .*? \*/`
