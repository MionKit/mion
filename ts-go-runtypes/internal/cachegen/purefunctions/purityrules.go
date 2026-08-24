package purefunctions

// Source of truth for the allow/forbid sets. These maps ARE the source of
// truth — purity is enforced Go-side only, and the JS lint side merely routes
// the diagnostics this checker produces (see
// packages/ts-runtypes-devtools/src/eslint/diagnosticRouting.ts). There is no
// JS twin of these sets to keep in sync.
//
// Three project-specific deltas applied per user instruction:
//   - globalThis MOVED from allowedGlobals to forbiddenIdentifiers
//     (it's a backdoor to every host global)
//   - Temporal ADDED to allowedGlobals (Temporal proposal API is pure
//     and safe to reference)
//   - Binary / text-encoding built-ins + crypto ADDED to allowedGlobals
//     (ArrayBuffer / DataView / the typed arrays / TextEncoder|Decoder /
//     btoa|atob / crypto) so hashing, binary-codec, and encoding algorithms
//     can be ported inline into a factory. The forbidden line is I/O,
//     side-effect channels, code-eval, and host objects — NOT non-determinism
//     (crypto reads a host value like Math.random / Date.now, all allowed) and
//     NOT sync-vs-async by itself (localStorage is sync yet forbidden). The
//     orthogonal hard rule, enforced syntactically, is synchronous-only: no
//     await / yield / dynamic import. SharedArrayBuffer stays out — a
//     shared-mutation channel, like the forbidden storage APIs.
//
// When syncing future tweaks from the reference rules, the diff is
// intentionally small and easy to review.

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

	// Binary data — ArrayBuffer, DataView, and the typed-array views.
	// These are pure value transforms over bytes: the building blocks for
	// porting a hashing / binary-codec / text-encoding algorithm INLINE into
	// a factory body (the purity rules forbid importing one, so the algorithm
	// must be reimplemented in place). A typed array is only ever a local
	// inside the factory — it never reaches the validated data type — so this
	// is fully decoupled from the DataOnly projection on the JS side.
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

	// crypto (Web Crypto). Allowed for the same reason as Math / Date: a
	// computation namespace that reads a benign host-provided VALUE, not a
	// side-effect channel. crypto.randomUUID / getRandomValues are SYNC and
	// non-deterministic — exactly like Math.random / Date.now (also allowed,
	// and which mock-generator pure-fns legitimately want). Non-determinism is
	// NOT the forbidden line; I/O + side-effect channels + async are. The async
	// crypto.subtle.* API is self-limiting: it can only be consumed with await,
	// which trips PFE9007, so an async hash never fits — port the hash inline
	// over the typed arrays above instead.
	"crypto": true,
	// NOTE: SharedArrayBuffer is intentionally ABSENT. Unlike ArrayBuffer (a
	// private buffer) it is a cross-context shared-MUTATION channel — the same
	// category as the storage APIs in forbiddenIdentifiers below (localStorage
	// et al. are SYNC yet forbidden, because being synchronous was never the
	// test — being free of side-effect channels is). A self-contained pure-fn
	// has nothing to share it with, so it has no legitimate use here.

	// Temporal API (Stage 3 / shipping). Pure constructors + arithmetic;
	// safe inside factory bodies.
	"Temporal": true,
	// NOTE: globalThis intentionally absent — it lives in forbiddenIdentifiers.
}

// forbiddenIdentifiers are identifiers we actively reject even though
// they're globally available. Reaching for any of these from a "pure"
// function is a strong smell — they expose I/O, host state, or runtime
// metaprogramming.
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

	// globalThis exposes every host global indirectly — a backdoor for
	// the entire forbidden set. User-requested addition to this map.
	"globalThis": true,

	// Network primitives.
	"XMLHttpRequest": true,
	"WebSocket":      true,

	// Persistent storage.
	"localStorage":   true,
	"sessionStorage": true,
	"indexedDB":      true,
}
