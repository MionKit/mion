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
	RT                    string
	TF                    string
	InferType             string
	GetRunType            string
	TypeFormat            string
	RunTypeFromJSONSchema string
	EmbedType             string
	taken                 map[string]bool
}

// newNames seeds the table from the recognized declarations and the file's
// existing imports.
func newNames(decls []*declaration, imports *importScan) *nameTable {
	names := &nameTable{
		RT:                    "RT",
		TF:                    "TF",
		InferType:             "InferType",
		GetRunType:            "getRunType",
		TypeFormat:            "TypeFormat",
		RunTypeFromJSONSchema: "runTypeFromJsonSchema",
		EmbedType:             "embedType",
		taken:                 map[string]bool{},
	}
	for _, decl := range decls {
		if decl.Name != "" {
			names.taken[decl.Name] = true
		}
		if decl.ConstName != "" {
			names.taken[decl.ConstName] = true
		}
	}
	if imports != nil {
		for _, local := range imports.localNames() {
			names.taken[local] = true
		}
		if alias := imports.namespaceAlias(moduleBuilders); alias != "" {
			names.RT = alias
		}
		if alias := imports.namespaceAlias(moduleFormats); alias != "" {
			names.TF = alias
		}
		if local := imports.localFor(moduleCore, "InferType"); local != "" {
			names.InferType = local
		}
		if local := imports.localFor(moduleCore, "getRunType"); local != "" {
			names.GetRunType = local
		}
		if local := imports.localFor(moduleCore, "TypeFormat"); local != "" {
			names.TypeFormat = local
		}
		if local := imports.localFor(moduleJSONSchema, "runTypeFromJsonSchema"); local != "" {
			names.RunTypeFromJSONSchema = local
		}
		if local := imports.localFor(moduleJSONSchema, "embedType"); local != "" {
			names.EmbedType = local
		}
	}
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
