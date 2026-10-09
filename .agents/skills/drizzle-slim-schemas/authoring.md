# Authoring recorders

How to wrap one manifest entry in a dialect package, and how to test it.

## Column builder

One block per column function:

1. **Config, data and bag** in `src/types.ts`:
   - local config interface mirroring drizzle's param shape. Manifest `params` strings are the contract;
     the drift gate re-opens the entry when drizzle changes them. Never import drizzle types.
   - the data computation (`VarcharData<C>`);
   - the `*ColMods` bag of the modifiers this builder kind takes.
   - Formats live in `@mionjs/run-types/formats`. Pick per the drizzle column's VALUE semantics
     (length/width bounds, uuid, ip, date/time string shapes).
   - No matching format → plain data type (boolean, string, unknown for json).
2. **Column type** in `src/columns.ts`: PascalCase of the fn name (upperFirst; manifest records it as `typeAlias`):
   `type Varchar<P extends Only<P, XConfig & XColMods> = NoProps> = Column<'varchar', P, VarcharData<P>>`.
   `Only` rejects a stray key. Serial-likes pass their base flags as the 4th argument.
3. **Builder overloads**: no-props forms first (`varchar()`, `varchar(name)`), then `(name, props)` and `(props)`
   with `const C extends Only<C, XConfig & XIn>` and return `Built<'varchar', C, Data>`
   (wrapped in `NamedColumn<N, ...>` when named).
   Name overloads MUST come first: a plain name tried against the props overload is the expensive path (TYPE-COST.md).
4. **Implementation**: one line, `return dialectColumn('fnName', args)`. It calls `recordColumn`:
   config keys go to drizzle's builder, modifier keys replay as its method calls in key order.
5. Add the builder to the package's column-helpers record (the table factory's callback overload).

## Props interfaces + new modifier

- Props interfaces (`PgColIn`, `PgDateIn`, ...) group builders by drizzle's own METHOD SETS
  (pg four: common / +defaultNow / +defaultRandom / +identity; mysql three; sqlite one).
- They are the builder's twin of the `*ColMods` bags, with function-carrying keys in runtime shape
  (`references: [() => tableRef(...)]`, `$defaultFn: [() => ...]`).
- New drizzle modifier needs ALL of:
  - a key in core `ColMods` (`packages/drizzle-orm/src/types.ts`) and in `colModNames` (`src/columns.ts`);
  - the name in `drizzleModNames` (`ts-go-runtypes/internal/convert/drizzle.go`);
  - a key in the `*ColMods` bags + props interfaces of builders that have it
    (the `*SharedColMods` base when both spell it alike);
  - its flag in the derivation key lists (`NotNullKeys` / `DefaultKeys` / `ExcludedKeys`).
- Value: `true` for a no-arg call, the args tuple otherwise.
- Four gates catch a half-done job: `colMods.spec.ts`, `TestDrizzleModNamesMatchManifests`,
  each dialect's `manifest-coverage.spec.ts`, and each dialect's `completeness.spec.ts`
  (diffs drizzle's builder methods against the props interfaces, both directions).

## Entry/value helper

`function` entries (index, uniqueIndex, unique, foreignKey, primaryKey, check, policies, enums, schemas, sequences,
table creators) wrap as:

- chainable table entries → `new RtEntryRecorder('fnName', args)` behind a typed entry interface
  (new chain method → add it to RtEntryRecorder + the interface);
- standalone value handles → `RtValueRecorder` attached under `rtValueKey`
  (toDrizzle materializes them; pgEnum shows the factory-of-columns shape).

## Tests (paired, per package)

- **Raw drizzle is the oracle**: `test/typeTables.spec.ts` + `test/index.spec.ts` build the slim table and the same
  table with drizzle's own builders, keep `project(toDrizzle(slim))` equal to `project(raw)` (getTableConfig = oracle).
- **Type pins** in `test/type-pins.stub.ts`: a builder table equals its hand-written twin;
  model rules for any new flag behavior.
- Shared test files hold the same titles in every dialect, checked by `packages/drizzle-orm/test/dialectParity.spec.ts`.
  A dialect-only test says so (`only pg, mysql: ...`).
- Validator specs run the models through `createValidateFn`. Extend them when the new column carries a format.
- Any test touching the marker API follows the Marker test coverage rule (both `getRunTypeId` shapes).
