# Value-first builders

The builder surface a consumer writes instead of a hand-written type: the atomic leaves
([atomic.ts](./atomic.ts)), the composers and property modifiers ([compose.ts](./compose.ts)),
and the stdlib utility wrappers ([utility.ts](./utility.ts)). Each is runtime-thin, it
brands the type off its trailing `InjectRunTypeId<…>` marker and hands the carrier to
`builderResult`; the Go binary, not the type system, is the validation engine. The TYPE
channel that turns a builder config into the type it models (`ObjectType`, `MapTuple`,
`UnionOf`, `AssembleTemplate`, the `Self` / `Recursive` machinery) lives in
[static.ts](./static.ts), with the format-leaf helpers in
[../runtypes/builderTypes.ts](../runtypes/builderTypes.ts). A builder and its type-first
equivalent must converge on the same structural id, which is what
[test/suites/id-integrity/](../../test/suites/id-integrity/) pins.

**Before optimising anything in here or in [../formats/](../formats/), read
[TYPE-COST.md](./TYPE-COST.md).** These types are instantiated on every keystroke in a
consumer's editor, they have been measured call site by call site, and several obvious
looking rewrites are already known losses.
