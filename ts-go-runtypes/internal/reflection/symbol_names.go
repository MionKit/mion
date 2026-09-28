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

// SymbolKeyLabel names a symbol-keyed member in messages by its symbol: `[Symbol.iterator]` reads `[iterator]`.
func SymbolKeyLabel(name string) string {
	if IsSymbolKeyedName(name) {
		return "[" + name[2:] + "]"
	}
	return name
}
