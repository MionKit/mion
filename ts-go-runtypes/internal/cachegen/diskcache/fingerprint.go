package diskcache

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
)

// FingerprintInputs are the build-option knobs that change emitted JS output, plus the BINARY IDENTITY.
// constants.Version alone is not enough: release builds already split by the version-folded typeID directory, but two DEV builds share
// the version while their emitters differ, and the shared fingerprint served stale bodies. BinaryStamp (the executable's mtime + size)
// moves on every real rebuild, and `go build` leaves an unchanged binary untouched, so a no-op rebuild keeps its cache.
// Add a field here whenever a new option starts affecting cache bodies; the fingerprint then moves and orphans the previous cache.
type FingerprintInputs struct {
	// BinaryVersion is constants.Version, BinaryStamp the executable's mtime+size, empty when undeterminable (the WASM twin has no disk cache).
	BinaryVersion string
	BinaryStamp   string
	HashLength    int
	// EmitMode mirrors typefns.RenderOpts.EmitMode ("code" / "functions" / "both"); each renders different slots, so the three never share entries.
	EmitMode string
	// InlineMode mirrors typefns.RenderOpts.InlineMode; the modes emit different bodies AND different entry sets (allInternal absorbs
	// unnamed compounds into their parents), so they must never share cache entries.
	InlineMode string
	// SizeBias / SizeItems / SizeStringBytes / SizeMaxBytes mirror RenderOpts.SizeEstimate; they change the size literal baked into
	// every `tb` entry's argsText, so every cached binary entry has to be re-derived when one moves.
	SizeBias        float64
	SizeItems       int
	SizeStringBytes int
	SizeMaxBytes    int
	// PatternSampleCount / PatternSampleRetries drive mockSample auto-generation; the samples land in emitted formatAnnotations but
	// never in typeIDs (generation is post-intern), so only the fingerprint can re-derive the entries a sample-less pattern reaches.
	PatternSampleCount   int
	PatternSampleRetries int
	// JSONMaxBytes is the root-row slot 21 switch: on and off render different root rows, so they never share cache entries.
	JSONMaxBytes bool
}

// Fingerprint hashes inputs into a stable 12-hex-char prefix, the per-build-options cache directory: short enough to keep paths
// human-friendly, wide enough that collisions are not a practical concern.
// The version tag below bumps whenever an input is dropped or changes shape, so older binaries' caches land under another prefix.
//
// v2 dropped the MarkerName / MarkerModule inputs (marker migration).
// v3 dropped LiteralHashLength (literal ids merged into the single hash dictionary).
// v4 replaced the EmitCreateRTFn bool with the EmitMode tri-state string.
// v5 added InlineMode.
// v6 redefined what InlineMode "default" MEANS (unnamed compounds now inline): same token, different bytes, so the dirs must move.
// v7 added the binary cold-start size-estimate inputs and the estimate slot they bake into every `tb` entry.
// v8 renders default-valued INTERIOR fn-entry slots as JS array holes instead of spelled-out literals, so every argsText differs.
// v9 inlines a union encoder's simple leaf-atomic member checks into the dispatch instead of a cross-family `val_<member>?.fn(v)` call.
// v10 added the mockSample auto-generation knobs, whose values shape the samples baked into emitted formatAnnotations.
// v11 added the binary identity, so a rebuilt DEV binary with changed emitters stops serving the previous build's function bodies.
// v12 added the JSONMaxBytes switch.
func Fingerprint(inputs FingerprintInputs) string {
	var sb strings.Builder
	sb.WriteString("v12\n")
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
	sb.WriteString(strconv.FormatBool(inputs.JSONMaxBytes))
	sb.WriteByte('\n')
	sum := sha256.Sum256([]byte(sb.String()))
	return hex.EncodeToString(sum[:])[:12]
}
