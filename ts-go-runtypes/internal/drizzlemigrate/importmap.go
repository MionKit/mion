// importmap.go — the generated boundary this arm rewrites by.
//
// importmap.json is emitted by `pnpm miondevx core drizzle-manifest` from
// drizzle-dialects.json plus the four per-dialect manifests, and embedded here
// because the shipped binary has no repo to read them from: the drizzle-e2e lane
// runs the published @mionjs/bin launcher inside a container. A `migrated`
// export is guaranteed by the generator's validate() to be exported from the
// wrapping package under the SAME name, which is what makes moving it a rename
// of the module specifier and nothing else.
package drizzlemigrate

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"
)

//go:embed importmap.json
var importMapJSON []byte

// ModuleRule is one drizzle module's rewrite rule.
type ModuleRule struct {
	Dialect string `json:"dialect"`
	// From is the drizzle module specifier the source imports from.
	From string `json:"from"`
	// To is the wrapping package a migrated name moves to.
	To string `json:"to"`
	// ToDrizzle is the subpath exporting toDrizzle(); empty for the
	// dialect-agnostic root package, which materializes nothing.
	ToDrizzle string   `json:"toDrizzle"`
	Migrated  []string `json:"migrated"`
	// Columns are the migrated exports that build a column: never a declaration
	// of their own, so the vocabulary gate has nothing to ask about them.
	Columns []string `json:"columns"`
	// Alias renames a moved export's local because the drizzle spelling stays in
	// use in the same file (`sql` -> `rtSql`).
	Alias map[string]string `json:"alias"`

	migrated map[string]bool
}

// Migrates reports whether this module's `imported` export moves to To.
func (rule *ModuleRule) Migrates(imported string) bool { return rule.migrated[imported] }

// LocalFor is the local name a moved export binds to: its alias when the drizzle
// spelling must stay available, else its own name.
func (rule *ModuleRule) LocalFor(imported string) string {
	if alias, ok := rule.Alias[imported]; ok {
		return alias
	}
	return imported
}

// ImportMap is the whole generated map.
type ImportMap struct {
	DrizzleOrm string       `json:"drizzleOrm"`
	Modules    []ModuleRule `json:"modules"`

	byModule map[string]*ModuleRule
}

// RuleFor returns the rule for a drizzle module specifier, or nil when the
// module is none of ours (`drizzle-orm/neon`, `drizzle-orm/node-postgres`, ...).
func (importMap *ImportMap) RuleFor(module string) *ModuleRule { return importMap.byModule[module] }

var (
	loadedMap  *ImportMap
	loadMapErr error
	loadOnce   sync.Once
)

// LoadImportMap parses the embedded map once. A parse failure is a build bug
// (the file is generator-owned and committed), so it surfaces as an error the
// CLI reports rather than a silent empty map that would translate nothing.
func LoadImportMap() (*ImportMap, error) {
	loadOnce.Do(func() {
		parsed := &ImportMap{}
		if err := json.Unmarshal(importMapJSON, parsed); err != nil {
			loadMapErr = fmt.Errorf("drizzle-migrate: parse embedded importmap.json: %w", err)
			return
		}
		parsed.byModule = make(map[string]*ModuleRule, len(parsed.Modules))
		for index := range parsed.Modules {
			rule := &parsed.Modules[index]
			rule.migrated = make(map[string]bool, len(rule.Migrated))
			for _, name := range rule.Migrated {
				rule.migrated[name] = true
			}
			parsed.byModule[rule.From] = rule
		}
		if len(parsed.Modules) == 0 {
			loadMapErr = fmt.Errorf("drizzle-migrate: embedded importmap.json has no modules - run `pnpm miondevx core drizzle-manifest`")
			return
		}
		loadedMap = parsed
	})
	return loadedMap, loadMapErr
}
