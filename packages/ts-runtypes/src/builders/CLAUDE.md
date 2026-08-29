# Value-first builders

Runtime builders in [atomic.ts](./atomic.ts) / [compose.ts](./compose.ts) /
[utility.ts](./utility.ts) are thin. The work is in the TYPE channel they brand:
[static.ts](./static.ts) here, format leaves in
[../runtypes/builderTypes.ts](../runtypes/builderTypes.ts).

- A builder and its type-first equivalent MUST converge on one structural id.
  [test/suites/id-integrity/](../../test/suites/id-integrity/) pins it.
- These types run on every keystroke in a consumer's editor. Read
  [TYPE-COST.md](./TYPE-COST.md) before optimising here or in
  [../formats/](../formats/) — several obvious rewrites are known losses.
