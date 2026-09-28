package reflection

import "strings"

// IsSymbolKeyedName reports a SYMBOL key: tsgo's `\xFE@<name>` (cachegen/runtype/serialize.go stableMemberName keeps it) or `@@name`.
// A symbol key is never data (JSON keys are strings), so every family drops the member, as `DataOnly<T>` does.
func IsSymbolKeyedName(name string) bool {
	if strings.HasPrefix(name, "@@") {
		return true
	}
	return len(name) >= 2 && name[0] == 0xFE && name[1] == '@'
}

// SymbolKeyLabel is the name a message shows for a symbol-keyed member: `[tag]`, as it is written in source.
func SymbolKeyLabel(name string) string {
	if IsSymbolKeyedName(name) {
		return "[" + name[2:] + "]"
	}
	return name
}
