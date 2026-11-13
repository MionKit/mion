package diagnostics

const (
	CodeDrizzlePublicType       = "drizzle-type-not-allowed"
	CodeDrizzleSchemaDependency = "drizzle-mixed-types"
)

func init() {
	Register(Definition{Code: CodeDrizzlePublicType, Family: FamilyDrizzle, Level: LevelWarning, Scope: ScopeGraph, Title: "Public handler type depends on Drizzle",
		// Resolved router and Drizzle packages are required; frontend fixtures cover nested public types.
		Headline: "Public handler {position} uses a Drizzle ORM type. Use a slim @mionjs/drizzle-orm model or a plain public type to keep client type checking small.",
		Summary:  "A written public parameter or return type uses a Drizzle ORM type, including nested models and model projections. Client type checking must expand those database types. Use a slim model from @mionjs/drizzle-orm or a plain public type. Drizzle queries and internal types inside the handler are allowed.",
		Fix:      "import type {User} from './schema.ts';\nconst list = mion.query(async (_ctx): Promise<User[]> => db.select().from(usersDb));",
	})
	Register(Definition{Code: CodeDrizzleSchemaDependency, Family: FamilyDrizzle, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Slim schema file depends on Drizzle",
		Headline: "This file defines a slim Mion schema or model and imports heavy Drizzle types or toDrizzle. A client importing a model from this file also type-checks its toDrizzle and query code in a full check, and bundles drizzle-orm on a value import. Move toDrizzle and heavy Drizzle imports to a separate query or database file.",
		Summary:  "A file that defines slim schemas or models also imports Drizzle types or the toDrizzle bridge. The editor checks a client lazily, so its cost there does not change. But a full type check (tsc or tsgo, as in CI) of a client importing one model from this file also checks every toDrizzle call, relation and query in it, and loads Drizzle's declarations: measured 5 to 20 times more type work. A value import also bundles drizzle-orm into the client. Keep schemas and models in their own file. Import them into a companion file for toDrizzle, database setup, relations and queries. A query or router file may import both kinds of types when it does not define slim schemas or models.",
		Fix:      "// schema.ts: define slim tables and models\n// db.ts: import the slim tables, then call toDrizzle",
	})
}
