package main

import (
	"fmt"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// monorepoRoot is the repository root — three dirs up from this file (cmd/
// gen-fn-hashes → cmd → ts-go-runtypes → repo root). The `packages/` workspaces
// live here, NOT under the Go module: a past migration moved the Go tree into
// ts-go-runtypes/ but left packages/ at the repo root, so the output path is
// one level above the Go module.
func monorepoRoot() string {
	_, thisFile, _, _ := runtime.Caller(0)
	return filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", "..", ".."))
}

// fnHashesOutputPath is the absolute path of the TS file we emit.
func fnHashesOutputPath() string {
	return filepath.Join(monorepoRoot(), "packages", "run-types", "src", "go-generated", "fnHashes.generated.ts")
}

// jsStr renders a single-quoted JS/TS string literal, matching oxfmt's quote
// style so the generator's raw output is byte-identical to the committed
// (oxfmt-formatted) file — which lets gen_test.go compare them directly and keeps
// `pnpm rtx core codegen fnhashes --check` a no-op after formatting. The values
// here are operation keys / fnHashes / option letters (plain identifiers), so the
// escaping only ever matters defensively.
func jsStr(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('\'')
	for _, r := range s {
		if r == '\'' || r == '\\' {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	b.WriteByte('\'')
	return b.String()
}

// axisToken maps an operation Axis onto its TS discriminator string.
func axisToken(axis operations.Axis) string {
	switch axis {
	case operations.AxisValidateOptions:
		return "validateOptions"
	case operations.AxisJsonStrategy:
		return "jsonStrategy"
	case operations.AxisHasUnknownKeysOptions:
		return "hasUnknownKeysOptions"
	default:
		return "none"
	}
}

// fnHashEntry is one operation's rendered TS entry: its axis, the optional
// default variant (JSON strategy families only), whether it forks on the
// rejectCircular compile option, and every variant token → hash.
type fnHashEntry struct {
	fnKey           string
	axis            string
	defaultVariant  string
	circularGuarded bool
	variants        map[string]string
}

// circularVariantLetter is appended to a CircularGuarded op's base variant token
// for its armed (rejectCircularRefs) fork — the JS-side mirror of the Go
// operations.circularCanonicalSuffix. getFnHash appends the same letter.
const circularVariantLetter = "C"

// optionSubsets returns the power set of an option table's NAMES — every subset
// a call site can request. Mirrors operations.optionSubsets (kept local so the
// generator doesn't need an exported view of that internal helper). Shared by
// the validateOptions and hasUnknownKeysOptions axes.
func optionSubsets(table []constants.ValidateOption) [][]string {
	names := make([]string, 0, len(table))
	for _, opt := range table {
		names = append(names, opt.Name)
	}
	subsets := make([][]string, 0, 1<<len(names))
	for mask := 0; mask < (1 << len(names)); mask++ {
		var subset []string
		for i, name := range names {
			if mask&(1<<i) != 0 {
				subset = append(subset, name)
			}
		}
		subsets = append(subsets, subset)
	}
	return subsets
}

// collectEntries walks the operation registry and computes every (fnKey, variant
// token) → fnHash the runtime getFnHash resolver can be asked for. Skips any
// operation with no FnKey (none exist today, but the guard keeps the table keyed
// by the marker token the resolver receives).
func collectEntries() []fnHashEntry {
	entries := make([]fnHashEntry, 0, len(operations.All()))
	for _, op := range operations.All() {
		if op.FnKey == "" {
			continue
		}
		entry := fnHashEntry{fnKey: op.FnKey, axis: axisToken(op.Axis), circularGuarded: op.CircularGuarded, variants: map[string]string{}}
		// CircularGuarded ops emit each base variant twice: plain, and armed with
		// the "C" letter appended (getFnHash mirrors the append). Non-guarded ops
		// emit only the plain lane.
		circularForks := []bool{false}
		if op.CircularGuarded {
			circularForks = []bool{false, true}
		}
		addVariant := func(baseToken string, rejectCircular bool, hash string) {
			token := baseToken
			if rejectCircular {
				token += circularVariantLetter
			}
			entry.variants[token] = hash
		}
		for _, rejectCircular := range circularForks {
			switch op.Axis {
			case operations.AxisValidateOptions:
				for _, subset := range optionSubsets(constants.ValidateOptions) {
					addVariant(constants.ValidateVariantSuffix(subset), rejectCircular, operations.FnHashFor(op, subset, "", rejectCircular))
				}
			case operations.AxisHasUnknownKeysOptions:
				for _, subset := range optionSubsets(constants.HasUnknownKeysOptions) {
					addVariant(constants.HasUnknownKeysVariantSuffix(subset), rejectCircular, operations.FnHashFor(op, subset, "", rejectCircular))
				}
			case operations.AxisJsonStrategy:
				entry.defaultVariant = op.DefaultStrategy
				for _, strategy := range op.Strategies {
					addVariant(strategy, rejectCircular, operations.FnHashFor(op, nil, strategy, rejectCircular))
				}
			default:
				addVariant("", rejectCircular, operations.FnHashFor(op, nil, "", rejectCircular))
			}
		}
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].fnKey < entries[j].fnKey })
	return entries
}

// tsKey renders an object key, quoting it when it isn't a bare JS identifier
// (the empty-string variant token and any future non-identifier token).
func tsKey(key string) string {
	if key != "" && isIdent(key) {
		return key
	}
	return jsStr(key)
}

func isIdent(s string) bool {
	for i, char := range s {
		isLetter := char == '_' || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
		isDigit := char >= '0' && char <= '9'
		if i == 0 && !isLetter {
			return false
		}
		if !isLetter && !isDigit {
			return false
		}
	}
	return len(s) > 0
}

// renderVariants renders a `{token: 'hash', …}` object with tokens sorted for
// deterministic output.
func renderVariants(variants map[string]string) string {
	tokens := make([]string, 0, len(variants))
	for token := range variants {
		tokens = append(tokens, token)
	}
	sort.Strings(tokens)
	parts := make([]string, 0, len(tokens))
	for _, token := range tokens {
		parts = append(parts, fmt.Sprintf("%s: %s", tsKey(token), jsStr(variants[token])))
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

// Generate returns the full TS module body mirroring the operation registry's
// version-independent fnHashes. Deterministic: same registry → same bytes, so
// the committed file and gen_test.go stay in lockstep.
func Generate() string {
	out := &strings.Builder{}
	out.WriteString("// Code generated by cmd/gen-fn-hashes. DO NOT EDIT.\n")
	out.WriteString("// Source: internal/cachegen/operations (the registry + fnhash.go salt).\n")
	out.WriteString("// Regenerate via `pnpm rtx core codegen fnhashes` after changing an operation, a\n")
	out.WriteString("// validate option, a JSON strategy, or the fnHash salt.\n")
	out.WriteString("//\n")
	out.WriteString("// Every fnHash here is VERSION-INDEPENDENT (operations.fnHashSalt no longer\n")
	out.WriteString("// folds constants.Version), so the same table ships for every mion\n")
	out.WriteString("// release: a consumer resolves `fnKey (+ options) → fnHash` once and never\n")
	out.WriteString("// re-pins on a version bump. The runtime cache key is `<fnHash>_<typeId>`;\n")
	out.WriteString("// its typeId half (injected by the plugin) still carries the version.\n")
	out.WriteString("\n")

	out.WriteString("export type FnHashAxis = 'none' | 'validateOptions' | 'jsonStrategy' | 'hasUnknownKeysOptions';\n")
	out.WriteString("\n")
	out.WriteString("export interface FnHashEntry {\n")
	out.WriteString("  readonly axis: FnHashAxis;\n")
	out.WriteString("  /** jsonStrategy only: the strategy token applied when options omit `strategy`. */\n")
	out.WriteString("  readonly defaultVariant?: string;\n")
	out.WriteString("  /** CircularGuarded families (validate / validationErrors / toBinary /\n")
	out.WriteString("   *  jsonEncoder) fork on the rejectCircularRefs compile option: each base\n")
	out.WriteString("   *  variant token also has a 'C'-suffixed armed twin. getFnHash appends 'C'\n")
	out.WriteString("   *  when options.rejectCircularRefs is set on such a family. */\n")
	out.WriteString("  readonly circularGuarded?: true;\n")
	out.WriteString("  /** Variant token → fnHash. Token is '' for option-less families, the validate\n")
	out.WriteString("   *  variant suffix ('', 'NL', 'NA', 'NLA'), the hasUnknownKeys variant suffix\n")
	out.WriteString("   *  ('', 'OV'), or the JSON strategy name — each optionally with a trailing\n")
	out.WriteString("   *  'C' for the rejectCircularRefs fork on a CircularGuarded family. */\n")
	out.WriteString("  readonly variants: Readonly<Record<string, string>>;\n")
	out.WriteString("}\n")
	out.WriteString("\n")

	out.WriteString("export const FN_HASHES = {\n")
	for _, entry := range collectEntries() {
		fields := []string{"axis: " + jsStr(entry.axis)}
		if entry.defaultVariant != "" {
			fields = append(fields, "defaultVariant: "+jsStr(entry.defaultVariant))
		}
		if entry.circularGuarded {
			fields = append(fields, "circularGuarded: true")
		}
		fields = append(fields, "variants: "+renderVariants(entry.variants))
		out.WriteString(fmt.Sprintf("  %s: {%s},\n", tsKey(entry.fnKey), strings.Join(fields, ", ")))
	}
	out.WriteString("} as const satisfies Record<string, FnHashEntry>;\n")
	out.WriteString("\n")

	out.WriteString("/** ValidateOptions name → single-letter token, in Go declaration order\n")
	out.WriteString(" *  (constants.ValidateOptions). The validate variant suffix is 'N' followed by\n")
	out.WriteString(" *  the letters of the present options concatenated in THIS order. */\n")
	out.WriteString("export const VALIDATE_OPTION_LETTERS = [\n")
	for _, opt := range constants.ValidateOptions {
		out.WriteString(fmt.Sprintf("  [%s, %s],\n", jsStr(opt.Name), jsStr(opt.Letter)))
	}
	out.WriteString("] as const satisfies ReadonlyArray<readonly [string, string]>;\n")
	out.WriteString("\n")

	out.WriteString("/** HasUnknownKeysOptions name → single-letter token, in Go declaration order\n")
	out.WriteString(" *  (constants.HasUnknownKeysOptions). The hasUnknownKeys variant suffix is 'O'\n")
	out.WriteString(" *  followed by the letters of the present options concatenated in THIS order. */\n")
	out.WriteString("export const HAS_UNKNOWN_KEYS_OPTION_LETTERS = [\n")
	for _, opt := range constants.HasUnknownKeysOptions {
		out.WriteString(fmt.Sprintf("  [%s, %s],\n", jsStr(opt.Name), jsStr(opt.Letter)))
	}
	out.WriteString("] as const satisfies ReadonlyArray<readonly [string, string]>;\n")

	return out.String()
}
