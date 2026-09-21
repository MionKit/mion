package purefunctions

// These maps ARE the source of truth for the allow / forbid sets: purity is enforced Go-side only
// and the JS lint side merely routes the diagnostics this checker produces (see
// packages/devtools/src/lint/diagnosticRouting.ts), so there is no JS twin to keep in sync.
// The forbidden line is I/O, side-effect channels, code-eval and host objects, NOT non-determinism
// (crypto reads a host value like Math.random / Date.now, all allowed) and NOT sync-vs-async by
// itself (localStorage is sync yet forbidden). Synchronous-only is the orthogonal hard rule,
// enforced syntactically: no await / yield / dynamic import.

// allowedGlobals are the identifiers a pure-function factory may
// reference without being either in its own lexical scope or considered
// a closure violation.
var allowedGlobals = map[string]bool{
	// Primitive sentinels and constructors.
	"undefined": true,
	"null":      true,
	"NaN":       true,
	"Infinity":  true,
	"true":      true,
	"false":     true,

	// Built-in object / collection constructors.
	"Object":  true,
	"Array":   true,
	"String":  true,
	"Number":  true,
	"Boolean": true,
	"Math":    true,
	"JSON":    true,
	"Date":    true,
	"RegExp":  true,
	"Map":     true,
	"Set":     true,
	"WeakMap": true,
	"WeakSet": true,
	"Symbol":  true,
	"BigInt":  true,
	"Promise": true,

	// Errors.
	"Error":      true,
	"TypeError":  true,
	"RangeError": true,

	// Coercion + introspection.
	"parseInt":           true,
	"parseFloat":         true,
	"isNaN":              true,
	"isFinite":           true,
	"encodeURIComponent": true,
	"decodeURIComponent": true,
	"encodeURI":          true,
	"decodeURI":          true,

	// Console + runtime hints.
	"console": true,
	"Bun":     true,

	// Binary data: the building blocks for porting a hashing / binary-codec / text-encoding
	// algorithm INLINE into a factory body, importing one being forbidden. A typed array is
	// only ever a local inside the factory, so the JS-side DataOnly projection is unaffected.
	"ArrayBuffer":       true,
	"DataView":          true,
	"Int8Array":         true,
	"Uint8Array":        true,
	"Uint8ClampedArray": true,
	"Int16Array":        true,
	"Uint16Array":       true,
	"Int32Array":        true,
	"Uint32Array":       true,
	"Float32Array":      true,
	"Float64Array":      true,
	"BigInt64Array":     true,
	"BigUint64Array":    true,

	// Text <-> bytes and base64. Deterministic, no I/O, no host state.
	"TextEncoder": true,
	"TextDecoder": true,
	"btoa":        true,
	"atob":        true,

	// crypto (Web Crypto), allowed for the same reason as Math / Date: a computation namespace
	// reading a benign host-provided VALUE, not a side-effect channel. randomUUID and
	// getRandomValues are sync and non-deterministic, which mock-generator pure fns want. The
	// async crypto.subtle.* is self-limiting: consuming it needs await, which trips PFE9007, so
	// an async hash never fits; port the hash inline over the typed arrays above instead.
	"crypto": true,
	// NOTE: SharedArrayBuffer is intentionally ABSENT, a cross-context shared-MUTATION channel
	// unlike ArrayBuffer's private buffer, and a self-contained pure fn has nothing to share with.

	// Temporal: pure constructors and arithmetic.
	"Temporal": true,
	// NOTE: globalThis intentionally absent, it lives in forbiddenIdentifiers.
}

// forbiddenIdentifiers are rejected though globally available: they expose I/O, host state or
// runtime metaprogramming.
var forbiddenIdentifiers = map[string]bool{
	// Code-eval escape hatches.
	"eval":     true,
	"Function": true,

	// Network / timing — side-effectful by definition.
	"fetch":         true,
	"setTimeout":    true,
	"setInterval":   true,
	"clearTimeout":  true,
	"clearInterval": true,

	// Host / environment objects.
	"process":  true,
	"window":   true,
	"document": true,
	"global":   true,
	"require":  true,

	// globalThis reaches every host global indirectly, a backdoor for the entire forbidden set.
	"globalThis": true,

	// Network primitives.
	"XMLHttpRequest": true,
	"WebSocket":      true,

	// Persistent storage.
	"localStorage":   true,
	"sessionStorage": true,
	"indexedDB":      true,
}
