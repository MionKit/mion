# @mionjs/drizzle-orm

Dialect-agnostic core of the mion drizzle packages: slim column and table recorders, flat model types and type-level refinement. The dialect packages (`@mionjs/drizzle-orm-pg-core`, `@mionjs/drizzle-orm-mysql-core`, `@mionjs/drizzle-orm-sqlite-core`) build their authoring surface on it; install this package alongside your dialect package and import the shared surface (InferSelectModel and friends, refineTableType, sql) from here.

Part of the mion framework, the sibling of the `RunTypes/*` packages. Full documentation lives at [mion.pages.dev](https://mion.pages.dev/) and [mion.pages.dev/runtypes](https://mion.pages.dev/runtypes).

Status: under active development. License: MIT.
