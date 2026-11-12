package typeid

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
)

// StableMemberName drops the checker's symbol id ("\xFE@foo@5" → "\xFE@foo"), so ids never embed
// which checker made it. The platform's own symbol reads "\xFE@Symbol.iterator", apart from a user `iterator`.
// Two same-name user symbols in one parent stay apart by their property index (the `_pr_` scheme).
func StableMemberName(typeChecker *checker.Checker, name string) string {
	if len(name) < 2 || name[0] != 0xFE || name[1] != '@' {
		return name
	}
	at := strings.LastIndexByte(name, '@')
	if at <= 1 || at == len(name)-1 {
		return name
	}
	for i := at + 1; i < len(name); i++ {
		if name[i] < '0' || name[i] > '9' {
			return name
		}
	}
	if platform, ok := platformSymbolName(typeChecker, name[2:at], name); ok {
		return "\xFE@" + platform
	}
	return name[:at]
}

// UniqueSymbolName names a unique symbol type: `Symbol.<name>` for the platform's own, else its declared name.
func UniqueSymbolName(typeChecker *checker.Checker, tsType *checker.Type) string {
	symbol := tsType.Symbol()
	if symbol == nil {
		return ""
	}
	if platform, ok := platformSymbolName(typeChecker, symbol.Name, checker.GetPropertyNameFromType(tsType)); ok {
		return platform
	}
	return symbol.Name
}

// platformSymbolName: key is the checker's key for the `SymbolConstructor` property name, not a user symbol named like it.
func platformSymbolName(typeChecker *checker.Checker, name, key string) (string, bool) {
	if checker.Checker_getPropertyNameForKnownSymbolName(typeChecker, name) != key {
		return "", false
	}
	return "Symbol." + name, true
}
