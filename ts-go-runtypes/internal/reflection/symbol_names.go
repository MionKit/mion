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

// Member / class flags the projection sets on a user class (cachegen/runtype/serialize.go), folded into the typeid too.
const (
	// FlagAccessor marks a get / set accessor: it lives on the prototype, so an instance has no own value for it.
	FlagAccessor = "accessor"
	// FlagField marks a function-typed class PROPERTY (`fn = () => 1`): an own value, not a prototype method.
	FlagField = "field"
	// FlagPrivateFields marks a class with `#name` fields, which only its constructor can create.
	FlagPrivateFields = "privateFields"
)
