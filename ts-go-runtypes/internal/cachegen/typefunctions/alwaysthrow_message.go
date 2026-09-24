package typefunctions

import "github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"

// Runtime alwaysThrow message wording: the Go emitter writes the COMPLETE message into the entry (see
// buildAlwaysThrowMessage), so the shipped marker package throws it carrying no diagnostic catalog of its
// own. This is the only user-facing wording the Go binary owns, and it stays tiny: the root-throw families
// share one formulaic headline, byte-identical to the build-time one in internal/diagnostics/messages.go so
// build log and runtime throw agree. The full catalog lives once in the @mionjs/devtools plugin, and the
// Go↔plugin wire carries only the code.

// rootThrowWording maps each root-throw diag code to the (participle, suffix) of its runtime throw headline.
// Only these codes ever become alwaysThrow entries: child-drop (010+), marker and pure-fn codes are
// build-time only and never reach the runtime throw path.
var rootThrowWording = map[string][2]string{}

func registerRootThrow(participle, suffix string, codes ...string) {
	for _, code := range codes {
		rootThrowWording[code] = [2]string{participle, suffix}
	}
}

func init() {
	registerRootThrow("encoded", "to JSON",
		diagnostics.CodePJNeverRoot, diagnostics.CodePJNonSerializableRoot, diagnostics.CodePJFunctionRoot, diagnostics.CodePJSymbolRoot,
		diagnostics.CodePJSNeverRoot, diagnostics.CodePJSNonSerializableRoot, diagnostics.CodePJSFunctionRoot, diagnostics.CodePJSSymbolRoot)
	registerRootThrow("decoded", "from JSON",
		diagnostics.CodeRJNeverRoot, diagnostics.CodeRJNonSerializableRoot, diagnostics.CodeRJFunctionRoot, diagnostics.CodeRJSymbolRoot)
	registerRootThrow("validated", "",
		diagnostics.CodeVLNonSerializableRoot, diagnostics.CodeVLSymbolRoot, diagnostics.CodeVENonSerializableRoot, diagnostics.CodeVESymbolRoot)
}

// alwaysFailSuffix is the shared consequence clause: the type can NEVER work with this family.
const alwaysFailSuffix = " — the generated function will always fail."

// rootThrowHeadline renders the runtime throw headline for a root-throw code. kindLabel (Never / Symbol /
// Function / NonSerializableClass / …) comes from leafKindLabel. The generic fallback line should never be
// reached: every alwaysThrow code is registered above.
func rootThrowHeadline(code, kindLabel string) string {
	if code == diagnostics.CodeUnsafePropertyName {
		return "Property `" + kindLabel + "` is named after a prototype slot and can never be data" + alwaysFailSuffix
	}
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
