package typefunctions

import "strings"

// pureFnAliases maps a pure-fn name to the short alias used in emitted
// factory bodies. The alias becomes the local variable name bound to
// utl.getPureFn('<ns>::<fnName>'); shortening it cuts bytes per occurrence
// in both the body STRING and the createRTFn closure. The getPureFn key
// itself is always fully quoted — factory bodies must stay self-contained
// (they are rebuilt via `new Function('utl', code)`), and per-entry tuple
// args evaluate in their own module scope, so there is no shared-skeleton
// const to reference (the pre-migration `k_<alias>` scheme).
var pureFnAliases = map[string]string{
	"newRunTypeErr":           "nRT",
	"getUnknownKeysFromArray": "gUKFA",
	"hasUnknownKeysFromArray": "hUKFA",
	"countEnumKeys":           "cntEK",
	"findCycle":               "fc",
}

// pureFnAlias returns the emitter-side alias for a registered pure-fn
// name, or the full name when no alias is registered (no savings, no
// break — falls back to the longer identifier without breaking the
// emitted code).
func pureFnAlias(fnName string) string {
	if alias, ok := pureFnAliases[fnName]; ok {
		return alias
	}
	return fnName
}

// pureFnAliasFor returns the emitter-side local-variable alias for a
// pure-fn reference in `namespace`. The `rtFormats` namespace keeps the
// `pf_<fnName>` convention its format emitters have always used; every
// other namespace (the `rt` core built-ins) uses the short-alias table.
// UsePureFn hoists `const <alias> = utl.getPureFn('<ns>::<fnName>')` under
// this alias, so pureFnAliasFor MUST reproduce the exact byte the
// pre-migration sites emitted — the choke point is a refactor, never a
// body-byte change (mode parity).
func pureFnAliasFor(namespace, fnName string) string {
	if namespace == formatsPureFnNamespace {
		return "pf_" + fnName
	}
	return pureFnAlias(fnName)
}

// formatsPureFnNamespace / corePureFnNamespace name the two built-in
// pure-fn namespaces the emitters reference. Mirrors the resolver-side
// builtinPureFnNamespaces set (purefunctions/index.go).
const (
	corePureFnNamespace    = "rt"
	formatsPureFnNamespace = "rtFormats"
)

// isBuiltinPureFnDep reports whether a soft-dep key names a package-owned
// pure fn (`rt::…` / `rtFormats::…`) rather than a fn cache entry
// (`<fnHash>_<typeId>` — no `::`). Mirrors the resolver's isBuiltinPureFnKey.
func isBuiltinPureFnDep(dep string) bool {
	return strings.HasPrefix(dep, corePureFnNamespace+"::") || strings.HasPrefix(dep, formatsPureFnNamespace+"::")
}
