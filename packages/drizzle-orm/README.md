# @mionjs/drizzle-orm

Dialect-agnostic core of the mion drizzle packages: slim column and table recorders, flat model types and type-level refinement. The dialect packages (`@mionjs/drizzle-orm-pg-core`, `@mionjs/drizzle-orm-mysql-core`, `@mionjs/drizzle-orm-sqlite-core`) build their authoring surface on it; install this package alongside your dialect package and import the shared surface (InferSelectModel and friends, refineTableType, sql) from here.

Part of the mion framework, the sibling of the `RunTypes/*` packages. Full documentation lives at [mion.io/runtypes/drizzle-orm](https://mion.io/runtypes/drizzle-orm/drizzle-overview).

Status: under active development. License: MIT.
