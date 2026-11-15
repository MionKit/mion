# Website components

Vue components the docs pages and layouts use. Read before adding or editing a component.
They live in the `shared` layer (paths below are relative to it); the playground ones in `mion-io`
([which layer](../../../AGENTS.md)).

## Components

- `app/components/content/` of every layer: auto-imported, usable directly in MDC.
  - `BenchTable`: full per-case table. No live page renders it; kept for the parked correctness page.
  - `RuntypesBenchBars` (runtypes bench pages): one titled card per group with its geometric mean as HTML bars,
    one bar per competitor, one card per metric, linking that group's cases on GitHub.
  - `ServerBenchBars` (rpc bench pages): one metric as HTML bars, one row per server, no chart library.
    Twin lanes (`twinOf` in the bench app registry) show only where `twins="<base app>"` asks,
    each with its change vs the base.
  - `HomeBenchTable` (root landing summary): fastest servers + validators, from the bench pages' generated datasets.
  - All three draw each bar with `app/components/BenchBar.vue`: full-width track, fill grows on first scroll into view.
  - The three geometric-mean ones read `app/utils/benchAggregate.js`. The two bench-page ones format numbers via
    `app/utils/benchFormat.ts`: one measurement never reads two ways.
  - `HomeTestTiles` (root landing test tiles): tile list lives in the component (else on the landing collection
    a frontmatter list silently collapses to its first key).
  - `TwoslashCode`: usage in [server](../../server/AGENTS.md).
  - `CodeCard` (`::code-card{name="…"}`): a card from `tools/code-card/`, as the HTML `pnpm miondevx card export`
    wrote to `app/data/cards/`; it plays the card's own animation on scroll. Never hand-edit `app/data/cards/`,
    `app/assets/css/code-card.css`, `app/utils/codeCardPlayer.ts` or `public/fonts/code-card/`: export again.
  - `VerticalIntegration` (rpc home): replaced libraries beside the mion logo, hover shows what mion does instead.
    Library list + icons: `app/utils/replacedLibraries.ts`.
  - `PlatformTiles` (rpc home): logos from `public/platform-logos/`, a `dark` twin for black-ink logos.
    Never `public/platforms/`: the old `/platforms/*` redirect would capture it.
  - Also here: `StatTiles`, `DiagnosticCatalog`, `RealWorldScenario`, `TypeSafeAnimation`, `MionType`, `MionLogo`.
    Shell: `DetailPanel`, `SlidedTitle`, `StylishList`, `HoverList`, `Spacer`, `CodeSplit`.
    Playground: `RuntypesPlayground`.
- Docus overrides live beside Docus' own paths: `app/components/app/` (here: `AppHeaderLogo`, `AppFooterNote`;
  shell: header body + centre, footer), shell `app/components/docs/`.
- Shell `app/components/global/`: the `mermaid` component.
- `app/components/content/go-generated/`: machine-generated data (e.g. diagnostics catalog JSON from
  `pnpm miondevx core codegen`). NEVER hand-edit.
- Docus built-ins usable in MDC: `::code-group`, `::note`, `::card`, `::card-group`, `::alert`, `::div{class="..."}`.
