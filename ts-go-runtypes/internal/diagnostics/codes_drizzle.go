package diagnostics

const (
	CodeDrizzlePublicType       = "drizzle-type-not-allowed"
	CodeDrizzleSchemaDependency = "drizzle-mixed-types"
)

func init() {
	register(Definition{Code: CodeDrizzlePublicType, Family: FamilyDrizzle, Level: LevelWarning, Scope: ScopeGraph, Title: "Public handler type depends on Drizzle"})
	register(Definition{Code: CodeDrizzleSchemaDependency, Family: FamilyDrizzle, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Slim schema file depends on Drizzle"})
}
