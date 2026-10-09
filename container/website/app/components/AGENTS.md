# Website components

Vue components the docs pages and layouts use. Read before adding or editing a component.

## Components

- `app/components/content/`: auto-imported, usable directly in MDC.
  - `BenchTable`: full per-case table. No live page renders it; kept for the parked correctness page.
  - `RuntypesBenchBars` (runtypes bench pages): one titled card per group with its geometric mean as HTML bars,
    one bar per competitor, one card per metric, linking that group's cases on GitHub.
  - `ServerBenchBars` (rpc bench pages): one metric as HTML bars, one row per server, no chart library.
  - `HomeBenchTable` (root landing summary): fastest servers + validators, from the bench pages' generated datasets.
  - The three geometric-mean ones read `app/utils/benchAggregate.ts`. The two bench-page ones format numbers via
    `app/utils/benchFormat.ts`: one measurement never reads two ways.
  - `HomeTestTiles` (root landing test tiles): tile list lives in the component (else on the landing collection
    a frontmatter list silently collapses to its first key).
  - `TwoslashCode`: usage in [server/AGENTS.md](../../server/AGENTS.md).
  - Also: `StatTiles`, `DiagnosticCatalog`, `DetailPanel`, `RealWorldScenario`, `RuntypesPlayground`, `SlidedTitle`,
    `TypeSafeAnimation`, `StylishList`, `HoverList`, `PlatformTiles`, `MionType`, `GradientBg`, `Spacer`,
    `AppHeaderLogo`, `MionLogo`.
- Docus overrides live beside Docus' own paths: `app/components/app/`, `app/components/docs/`.
- `app/components/global/`: the `mermaid` component.
- `app/components/content/go-generated/`: machine-generated data (e.g. diagnostics catalog JSON from
  `pnpm miondevx core codegen`). NEVER hand-edit.
- Docus built-ins usable in MDC: `::code-group`, `::note`, `::card`, `::card-group`, `::alert`, `::div{class="..."}`.
