package diskcache

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
)

// FingerprintInputs are the build-option knobs that change emitted JS
// output, plus the BINARY IDENTITY. constants.Version alone is NOT enough
// for the binary: it lives inside every typeID hash, so RELEASE builds
// already land in distinct typeID directories — but two DEV builds share
// the version while their emitters differ, and the shared fingerprint
// served stale function bodies (the reason every emitter change used to
// need a manual `rm -rf node_modules/.cache/ts-runtypes`). BinaryStamp
// (the executable's mtime + size) moves on every real rebuild — `go build`
// leaves an unchanged binary untouched, so a no-op rebuild keeps the
// cache — and release installs move it once per install, which the
// version fold already forces anyway.
//
// Add a field here whenever a new option starts affecting cache bodies;
// the resulting fingerprint moves and the previous cache is naturally
// orphaned.
type FingerprintInputs struct {
	// BinaryVersion is constants.Version (belt) and BinaryStamp the
	// executable's mtime+size (suspenders, empty when undeterminable —
	// e.g. the WASM twin, where no disk cache exists to protect).
	BinaryVersion string
	BinaryStamp   string
	HashLength    int
	// EmitMode mirrors typefns.RenderOpts.EmitMode ("code" / "functions" /
	// "both") — each mode renders different code/factory slots, so folding it
	// into the fingerprint keeps the three modes in distinct cache subdirs and
	// switching modes never reads a stale entry from another.
	EmitMode string
	// InlineMode mirrors typefns.RenderOpts.InlineMode ("default" /
	// "allInternal") — the modes emit structurally different bodies AND
	// different entry sets (allInternal absorbs unnamed compounds into their
	// parents), so they must never share cache entries.
	InlineMode string
	// SizeBias / SizeItems / SizeStringBytes / SizeMaxBytes mirror the
	// binary cold-start estimate config (RenderOpts.SizeEstimate). They change
	// the size literal baked into every `tb` entry's argsText, so a change must
	// re-derive every cached binary entry — fold them in so the cache moves.
	SizeBias        float64
	SizeItems       int
	SizeStringBytes int
	SizeMaxBytes    int
	// PatternSampleCount / PatternSampleRetries drive pattern mockSample
	// auto-generation. Generated samples land in emitted formatAnnotations
	// (never in typeIDs — generation is post-intern), so a knob change must
	// re-derive every cached entry a sample-less pattern reaches.
	PatternSampleCount   int
	PatternSampleRetries int
}

// Fingerprint hashes inputs into a stable 12-hex-char prefix used as the
// per-build-options cache directory. Short enough to keep paths
// human-friendly, wide enough that collisions are not a practical
// concern.
//
// The version tag bumps whenever an input is dropped or changes shape, so
// caches written by older binaries land under a different prefix: "v1"→"v2"
// dropped the MarkerName / MarkerModule inputs (marker migration), "v2"→"v3"
// dropped LiteralHashLength (literal ids merged into the single hash
// dictionary), "v3"→"v4" replaced the EmitCreateRTFn bool with the EmitMode
// tri-state string, "v4"→"v5" added InlineMode, "v5"→"v6" redefined what
// the InlineMode "default" token MEANS (unnamed compounds now inline; the
// old everything-external layout is gone) — same token, different bytes,
// so the option-dirs must move. "v6"→"v7" added the binary cold-start
// size-estimate inputs (and the estimate slot they bake into every `tb`
// entry), so every prior cache is stale. "v7"→"v8" changed the fn-entry tail
// encoding: default-valued INTERIOR slots (code=undefined, isNoop=false, the
// dep-list `[]`s) now render as JS array holes instead of spelled-out
// literals, so every cached argsText is byte-different. "v8"->"v9" inlines a
// union encoder's simple leaf-atomic member checks (typeof v === 'string', …)
// directly into the dispatch instead of a cross-family `val_<member>?.fn(v)`
// call, so every union-encoder body (and its cross-family edge set) changed.
// "v9"->"v10" added the pattern mockSample auto-generation knobs
// (PatternSampleCount / PatternSampleRetries) whose values shape the
// generated samples baked into emitted formatAnnotations. "v10"->"v11"
// added the binary identity (BinaryVersion + BinaryStamp) so a rebuilt
// DEV binary with changed emitters stops serving the previous build's
// cached function bodies.
func Fingerprint(inputs FingerprintInputs) string {
	var sb strings.Builder
	sb.WriteString("v11\n")
	sb.WriteString(inputs.BinaryVersion)
	sb.WriteByte('\n')
	sb.WriteString(inputs.BinaryStamp)
	sb.WriteByte('\n')
	sb.WriteString(strconv.Itoa(inputs.HashLength))
	sb.WriteByte('\n')
	sb.WriteString(inputs.EmitMode)
	sb.WriteByte('\n')
	sb.WriteString(inputs.InlineMode)
	sb.WriteByte('\n')
	sb.WriteString(strconv.FormatFloat(inputs.SizeBias, 'g', -1, 64))
	sb.WriteByte('\n')
	sb.WriteString(strconv.Itoa(inputs.SizeItems))
	sb.WriteByte('\n')
	sb.WriteString(strconv.Itoa(inputs.SizeStringBytes))
	sb.WriteByte('\n')
	sb.WriteString(strconv.Itoa(inputs.SizeMaxBytes))
	sb.WriteByte('\n')
	sb.WriteString(strconv.Itoa(inputs.PatternSampleCount))
	sb.WriteByte('\n')
	sb.WriteString(strconv.Itoa(inputs.PatternSampleRetries))
	sb.WriteByte('\n')
	sum := sha256.Sum256([]byte(sb.String()))
	return hex.EncodeToString(sum[:])[:12]
}
