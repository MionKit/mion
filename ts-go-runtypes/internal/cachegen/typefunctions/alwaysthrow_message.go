package typefunctions

import "github.com/mionkit/ts-runtypes/internal/diagnostics"

// Runtime alwaysThrow message wording.
//
// When a type is unsupported at a propagating/root position (never, a
// non-serializable class, a function, a symbol, …) the emitter renders an
// alwaysThrow entry whose runtime factory throws an Error. The Go emitter
// writes the COMPLETE message into the entry (see buildAlwaysThrowMessage),
// so the shipped marker package throws it WITHOUT carrying any diagnostic
// catalog of its own.
//
// This is the only user-facing diagnostic wording the Go binary owns, and it
// is intentionally tiny: the eight root-throw families share one formulaic
// headline, "Type `<kind>` can never be <participle> <suffix> — the generated
// function will always fail." (byte-identical to the build-time headline in
// internal/diagnostics/messages.go, so build log and runtime throw agree). The
// full build-time diagnostic catalog (every code, headline + example, shown in
// the build log and IDE) lives once in the ts-runtypes-devtools plugin; the
// Go↔plugin wire carries only the diagnostic code.

// rootThrowWording maps each root-throw diag code to the (participle, suffix)
// of its runtime throw headline. Only these codes ever become alwaysThrow
// entries — child-drop (010+), marker, and pure-fn codes are build-time-only
// diagnostics and never reach the runtime throw path.
var rootThrowWording = map[string][2]string{}

func registerRootThrow(participle, suffix string, codes ...string) {
	for _, code := range codes {
		rootThrowWording[code] = [2]string{participle, suffix}
	}
}

func init() {
	registerRootThrow("encoded", "to JSON",
		diagnostics.CodePJNeverRoot, diagnostics.CodePJNonSerializableRoot, diagnostics.CodePJFunctionRoot, diagnostics.CodePJArrayElement, diagnostics.CodePJSymbolRoot,
		diagnostics.CodePJSNeverRoot, diagnostics.CodePJSNonSerializableRoot, diagnostics.CodePJSFunctionRoot, diagnostics.CodePJSArrayElement, diagnostics.CodePJSSymbolRoot)
	registerRootThrow("decoded", "from JSON",
		diagnostics.CodeRJNeverRoot, diagnostics.CodeRJNonSerializableRoot, diagnostics.CodeRJFunctionRoot, diagnostics.CodeRJArrayElement, diagnostics.CodeRJSymbolRoot)
	registerRootThrow("stringified", "to JSON",
		diagnostics.CodeSJNeverRoot, diagnostics.CodeSJNonSerializableRoot, diagnostics.CodeSJFunctionRoot, diagnostics.CodeSJArrayElement, diagnostics.CodeSJSymbolRoot)
	registerRootThrow("serialised", "to binary",
		diagnostics.CodeTBNeverRoot, diagnostics.CodeTBNonSerializableRoot, diagnostics.CodeTBFunctionRoot, diagnostics.CodeTBArrayElement, diagnostics.CodeTBNonSerializableElem, diagnostics.CodeTBSymbolRoot)
	registerRootThrow("deserialised", "from binary",
		diagnostics.CodeFBNeverRoot, diagnostics.CodeFBNonSerializableRoot, diagnostics.CodeFBFunctionRoot, diagnostics.CodeFBArrayElement, diagnostics.CodeFBNonSerializableElem, diagnostics.CodeFBSymbolRoot)
	registerRootThrow("validated", "",
		diagnostics.CodeVLNonSerializableRoot, diagnostics.CodeVLSymbolRoot, diagnostics.CodeVENonSerializableRoot, diagnostics.CodeVESymbolRoot)
}

// alwaysFailSuffix is the shared consequence clause: the type can NEVER work
// with this family, so every call to the generated function fails.
const alwaysFailSuffix = " — the generated function will always fail."

// rootThrowHeadline renders the runtime throw headline for a root-throw code:
// "Type `<kindLabel>` can never be <participle> <suffix> — the generated
// function will always fail." The kind label (Never / Symbol / Function /
// NonSerializableClass / …) comes from leafKindLabel. Falls back to a generic
// line for an unmapped code — should never happen, every alwaysThrow code is
// registered above.
func rootThrowHeadline(code, kindLabel string) string {
	wording, ok := rootThrowWording[code]
	if !ok {
		return "Type `" + kindLabel + "` is not supported here" + alwaysFailSuffix
	}
	participle, suffix := wording[0], wording[1]
	if suffix == "" {
		return "Type `" + kindLabel + "` can never be " + participle + alwaysFailSuffix
	}
	return "Type `" + kindLabel + "` can never be " + participle + " " + suffix + alwaysFailSuffix
}
