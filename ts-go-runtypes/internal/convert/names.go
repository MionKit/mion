// names.go owns identifier decisions: the local names the printers spell
// (namespace aliases, imported helpers) and the derived declaration names
// (`MyType` → `myTypeRT` and back), collision-checked against everything
// already named at the file's top level.
package convert

import (
	"strings"
	"unicode"
)

// nameTable carries the local spellings the printers use plus the taken-name
// set for collision-free derivation.
type nameTable struct {
	// Namespace aliases / helper locals, honoring existing imports so a file
	// that already says `import * as B from '…/builders'` keeps its alias.
	RT         string
	TF         string
	TFT        string
	InferType  string
	GetRunType string
	TypeFormat string
	taken      map[string]bool
}

// newNames seeds the table from the recognized declarations, the file's
// existing imports and EVERY other top-level name in scope (a `const RT = 5`
// must push the builders namespace onto a suffixed alias). Helper spellings
// resolve in order: an existing named binding, an existing namespace import
// of the module (qualified member spelling — no import edit needed), else
// the default name claimed against the taken set.
func newNames(decls []*declaration, imports *importScan, inScope map[string]bool) *nameTable {
	names := &nameTable{taken: map[string]bool{}}
	for _, decl := range decls {
		if decl.Name != "" {
			names.taken[decl.Name] = true
		}
		if decl.ConstName != "" {
			names.taken[decl.ConstName] = true
		}
	}
	for name := range inScope {
		names.taken[name] = true
	}
	var coreNS string
	if imports != nil {
		for _, local := range imports.localNames() {
			names.taken[local] = true
		}
		coreNS = imports.namespaceAlias(moduleCore)
	}
	namespaceOf := func(module string) string {
		if imports == nil {
			return ""
		}
		return imports.namespaceAlias(module)
	}
	localOf := func(module, imported string) string {
		if imports == nil {
			return ""
		}
		return imports.localFor(module, imported)
	}
	helper := func(module, imported, fallback string, memberNS string) string {
		if local := localOf(module, imported); local != "" {
			return local
		}
		if memberNS != "" {
			return memberNS + "." + imported
		}
		return names.claim(fallback)
	}
	if alias := namespaceOf(moduleBuilders); alias != "" {
		names.RT = alias
	} else {
		names.RT = names.claim("RT")
	}
	if alias := namespaceOf(moduleFormats); alias != "" {
		names.TF = alias
	} else {
		names.TF = names.claim("TF")
	}
	if alias := namespaceOf(moduleTemporal); alias != "" {
		names.TFT = alias
	} else {
		names.TFT = names.claim("TFT")
	}
	names.InferType = helper(moduleCore, "InferType", "InferType", coreNS)
	names.GetRunType = helper(moduleCore, "getRunType", "getRunType", coreNS)
	names.TypeFormat = helper(moduleCore, "TypeFormat", "TypeFormat", coreNS)
	return names
}

// deriveConstName maps a type name onto its runtype const (`MyType` →
// `myTypeRT`), suffixing digits on collision. Returns "" when no free name
// exists within the suffix budget.
func (names *nameTable) deriveConstName(typeName string) string {
	base := lowerFirst(typeName) + "RT"
	return names.claim(base)
}

// deriveTypeName maps a const name back onto a type name (`myTypeRT` →
// `MyType`) for consts that never had an InferType alias.
func (names *nameTable) deriveTypeName(constName string) string {
	base := strings.TrimSuffix(constName, "RT")
	if base == constName || base == "" {
		base = constName + "Type"
	}
	return names.claim(upperFirst(base))
}

// claim returns base or a digit-suffixed variant, registering the result;
// "" when 1–9 are all taken.
func (names *nameTable) claim(base string) string {
	if !names.taken[base] {
		names.taken[base] = true
		return base
	}
	for suffix := 2; suffix <= 9; suffix++ {
		candidate := base + string(rune('0'+suffix))
		if !names.taken[candidate] {
			names.taken[candidate] = true
			return candidate
		}
	}
	return ""
}

func lowerFirst(name string) string {
	if name == "" {
		return name
	}
	runes := []rune(name)
	runes[0] = unicode.ToLower(runes[0])
	return string(runes)
}

func upperFirst(name string) string {
	if name == "" {
		return name
	}
	runes := []rune(name)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}
