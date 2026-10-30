---
type: feature
spec: full-plan
status: shipped
created: 2026-10-30
---

# Playground Tour and Clearer Sections

## Problem

The RunTypes playground (`/runtypes/playground`) is hard to read on first visit:

- Nothing walks a new visitor through it. The only help is four tiny numbered badges with hover tips.
- The sections run into each other: the grid draws 1px hairlines between panes and no gaps, so
  "Source", "Transformed Src", "Generated Cache" and "Pick a Function" read as one block.
- The "Random valid" / "Random invalid" buttons are 11px grey outline text. People miss them.
- Section 3 is titled "Generated Cache", which says nothing about what it shows. It also always shows the
  whole generated file, while the part worth reading is the one function that builds the validator.

## Plan

All UI work is in `container/website/app/components/playground/PlaygroundStage.client.vue` (one component,
global styles nested under `.rt-playground`). Engine work in `container/website/app/playground/engine.ts`.
The playground is only rendered on `container/website/app/pages/runtypes/playground.vue`
(through `components/content/RuntypesPlayground.vue`); no docs page embeds it.

### 1. Tour overlay

A step-by-step tour that dims the page, cuts a highlighted hole around one section, and shows a small card
explaining it. Runs once per browser until finished or dismissed.

- **New pure module** `container/website/app/playground/tour.ts` (no Vue, no DOM, Node-testable):
  - `TOUR_STEPS`: ordered `{target, title, body}`. `target` is a `data-tour="…"` value in the template.
    Steps, in order:
    1. `mode`: TS type vs Type Builder switch.
    2. `presets`: the example types.
    3. `source`: edit `MyType`; the hatched lines above and below are read-only.
    4. `transformed`: what the build step changes in your file.
    5. `generated`: the generated code, and the Function / Full file switch (section 4 below).
    6. `picker`: pick which function to generate.
    7. `input`: the input value + Random valid / Random invalid.
    8. `run`: Run button + Result.
  - Move `STEP_TIPS` (`PlaygroundStage.client.vue:64-71`) here and reuse its text as the bodies of steps
    3-6, so the hover tips and the tour never say different things. Update the `cache` tip wording to
    "generated code", not "cache".
  - Storage: one key `mion.runtypes.playground.tour`, value `'completed' | 'dismissed'`.
    `readTourState(storage)` / `writeTourState(storage, state)` take a `Storage`-like object and wrap every
    access in `try/catch` (private mode, blocked storage → behaves as "never seen", never throws).
    `shouldAutoStart(state)` = no stored value.
- **New component** `container/website/app/components/playground/PlaygroundTour.client.vue`, rendered by
  the stage:
  - Props: `steps`, `open`. Emits `finish` (last step's "Done") and `dismiss` (Skip, close X, Esc).
  - Spotlight: a fixed full-viewport layer; the highlight box is positioned from the target's
    `getBoundingClientRect()` and dims everything else with a large `box-shadow` in a new `--rtpg-scrim` token.
    Recompute on step change, `resize` and `scroll` (passive listeners, removed on close).
  - On each step: `scrollIntoView({block: 'nearest'})` on the target first (one-column layout below 1000px
    puts targets off-screen).
  - Card: "Step n of N", title, body, Back / Next (Done on last), "Skip tour" link, close X.
    Placed below the target when it fits, else above; full width at the bottom on narrow screens.
    Focus moves to the card; Esc dismisses; Left / Right arrows go back / next.
  - Blocks clicks to the playground while open (the scrim takes pointer events).
  - z-index above the site's sticky header: check the Docus header's value, do not guess.
- **Stage wiring** (`PlaygroundStage.client.vue`):
  - Add `data-tour="…"` attributes on the matching elements (mode switch `:761`, presets `:794`,
    section cards, picker `:870`, input field `:891`, run button + result `:920-922`).
  - Auto-start only after `ready` turns true (loading overlay gone, `:927-937`) and never when
    `overlayError` is set. `watch(ready, …)` + `shouldAutoStart(readTourState(localStorage))`.
  - `finish` → write `'completed'`; `dismiss` → write `'dismissed'`. Either one stops auto-start forever.
  - A small "Tour" button at the right end of the toolbar (`:759-807`) replays it any time.
    Replay ignores the stored flag; finishing or dismissing it writes the flag again.
  - Step `input` is skipped while the picked function takes no input (`needsInput` false, e.g. getRunType).

### 2. Each section its own card

Today: `.rtpg-layout` (`:977-983`) is a grid with `gap: 1px` over a border-coloured background, so panes
touch. Section 2 ("Transformed Src") is a sub-header inside the Source pane (`:831-843`).

- Grid gets real gaps: `gap: 12px`, `padding: 12px`, background = page background.
- Each numbered section becomes a card with the site's one panel look (`container/website/app/AGENTS.md`
  → Styling): `--mion-panel-bg`, `1px solid var(--ui-border)`, `--mion-panel-radius`; header strip on
  `--mion-panel-head-bg`. Card body keeps `overflow: hidden` so Monaco and code blocks stay inside the corners.
- Column 1 holds TWO cards stacked with the same gap: card 1 Source, card 2 Transformed source (its own
  card with a full `.rtpg-head`, `h2` like the others; drop `.rtpg-subhead`). Keep the current 3:2 height
  split (`.rtpg-typestack` flex 3, `.rtpg-transformview` flex 2).
- Toolbar (mode switch + presets) becomes a card too, same look, so the top row reads as its own section.
  (Superseded while building: see What shipped, the controls moved into the Source card.)
- Step badge (`.rtpg-step`, `:1032-1056`) grows to ~20px and sits before the title so every card opens with
  its number. Titles move from muted grey to `--rtpg-text`.
- The outer `.rt-playground` border can go (cards carry their own). Recheck the page sizing rule
  `pages/runtypes/playground.vue:42-44` (`height: calc(100vh - 160px)`) so the gaps don't push a scrollbar.
- Below 1000px the grid is one column (`:984-988`): cards stack with the same gap.

### 3. Random valid / Random invalid as real buttons

Today `.rtpg-ghost-btn` (`:1289-1310`, template `:894-913`): transparent, 11px, muted grey.

- New `.rtpg-btn` style: 12.5px text, `5px 12px` padding, `8px` radius, solid fill, a small inline SVG icon
  each (like the mode-switch icons, `:769-790`).
  - Valid: accent wash (`color-mix(in srgb, var(--rtpg-accent) 15%, transparent)`), accent border + text;
    hover = full accent fill with `--rtpg-on-accent` text.
  - Invalid: same shape in `--rtpg-err`.
  - Disabled + busy text ("generating…") unchanged.
- Move them from the cramped label row to their own row under "Input (JS)", left-aligned, so they read as
  actions, not as decoration on the label.
- Delete `.rtpg-ghost-btn` / `.rtpg-ghost-invalid` (no other user).

### 4. Section 3 renamed + Function / Full file switch

**Title.** `<h2>Generated Cache</h2>` (`:849`) becomes "Generated RunType `<varName>` code", where
`varName` is the picked function's existing `Operation.varName` (`playground/operations.ts`): validate,
getErrors, toJson, fromJson, runType. The name renders in a `<code>` span (mono, accent, NO uppercase
transform, so `getErrors` keeps its case). The title may ellipsis on a narrow card; the switch must not.

**Switch.** Two-segment toggle in the card header: "Function" | "Full file". Reuse the existing
`.rtpg-modeswitch` / `.rtpg-mode` styles (`:1500-1542`), `role="group"`, `aria-pressed` per button.

- Default: **Function**. Choice remembered in `localStorage` key `mion.runtypes.playground.codeView`
  (`'function' | 'file'`), read/written through the same try/catch helpers in `tour.ts` (rename the module's
  helpers generically if both live there, e.g. `readPref` / `writePref`).
- **Full file** = what the card shows today (every `rtmod:/…` module, prettier-formatted).
- **Function** = only the generated factories: each `function g_<key>(utl){ … }` that builds and returns the
  live validator / encoder. One block per factory.
  A JSON codec spans several modules (`engine.test.ts` "one named module per family"), so it shows several.
- **File names stay visible in BOTH views.** Every block keeps the sticky file header (`.rtpg-cache-file-head`,
  `:1333-1344`) with the module's `rtmod:/….js` name. In Function view the header shows the file name the
  factory lives in, plus the factory name beside it (e.g. `rtmod:/fns/jdCL.js · g_jdCL…`), so switching views
  never hides which file the code comes from.
- `getRunType` ships a data bundle with no factory: the switch is disabled with a tooltip
  ("getRunType ships data, not a function") and the card shows the full file.
- Header hint (`codeHint`, `:625`) counts what is shown: "1 function" / "3 modules".
- Switching is instant: both views are computed in the same `updateSelectedCode()` pass (`:601-636`) and kept
  in two refs; the toggle only picks which `v-html` to show. No extra resolver run.

**Engine** (`container/website/app/playground/engine.ts`):

- Generalize `linkRootTuple` (`:122-129`) into `linkBindings(entryModules)`: same strip-imports + concat, but
  returns an object of every `__rt_*` const (collect names with `/^\s*export\s+const\s+(__rt_\w+)/gm`).
  `linkRootTuple` becomes `linkBindings(...)[binding]`.
- New export `generatedFactories(modules: CacheModule[]): GeneratedFactory[]`, pure and sync, where
  `GeneratedFactory = {file: string; name: string; code: string}`: links the modules, walks each tuple's
  slots, keeps functions whose `.name` starts with `g_`, returns `{file: <owning module's rtmod:/… name>,
  name: fn.name, code: fn.toString()}`. Never calls a factory. To know the owning file, link per module
  binding name: map each `__rt_*` const back to the module whose code declares it.
  Why `g_`: every type-fn emitter names its factory `g_<entryKey>`
  (`ts-go-runtypes/internal/cachegen/typefunctions/module.go:125`, `json_composite.go:174`, `override.go:68`);
  pure fns are anonymous `function(…)` and dep thunks are arrows, so they never match.
  The WASM resolver emits in `functions` mode, so the live factory is always in the tuple
  (`ts-go-runtypes/internal/constants/constants.go:449`).
- The UI calls `generatedCache(...)` once, then `generatedFactories(modules)`; both go through
  `beautifyModule` + `highlight` (`:350`, `:328`).

## Tests

Playground vitest project: `packages/run-types/test/playground/` (Node env, real WASM resolver, skips
when `.cache/rt-wasm/` assets are missing: build them with `node container/website/scripts/build-playground.mjs`).

- `engine.test.ts`, new cases:
  - `generatedFactories` on `createValidateFn` → exactly one entry, name `/^g_/`, code starts with
    `function g_`, contains no `export const`, and is a substring of the full module code (the view is the
    real emitted text, not a reprint). Its `file` equals that module's `rtmod:/….js` name.
  - `createJsonDecoderFn` → more than one factory, every name `/^g_/`, every `file` one of the
    `generatedCache` module names, and each factory's code is a substring of THAT file's code.
  - `getRunType` → empty list.
  - Every preset (`PRESETS`) × every non-graph operation → at least one factory (guards a preset that
    silently loses its function view).
  - Update the comment at `engine.test.ts:294` ("Generated Cache" view) to the new title.
- New `tour.test.ts` (pure, no resolver):
  - Fresh storage → auto-start; after `'completed'` or `'dismissed'` → no auto-start.
  - A storage whose `getItem` / `setItem` throw → read = auto-start, write = no throw.
  - Every `TOUR_STEPS` target appears as a `data-tour="<target>"` literal in
    `PlaygroundStage.client.vue` (read the file as text, like `repo-contracts.test.ts` does), so a renamed
    section cannot orphan a tour step.
  - Code-view pref: default `'function'`, round-trips `'file'`, unknown stored value → default.
- `packages/devtools/test/website-theme-contracts.test.ts` already scans this component: the new
  `--rtpg-scrim` must be a token in `container/website/app/assets/css/mion.css` (`:root.dark` /
  `:root.light`, next to the other `--rtpg-*` tokens at `:934-949`), never a raw colour in the `.vue`.
- Browser pass (website-browser skill, `pnpm miondevx website dev --agent`, `/runtypes/playground`),
  dark + light, wide + 800px width:
  - Fresh profile: tour starts after loading, walks all steps, Done → reload → no tour.
  - Fresh profile, Skip → reload → no tour. "Tour" button replays it.
  - Cards visibly separated; Random buttons obvious; section 3 title follows the picker
    (validate → toJson → getRunType); switch flips views instantly and survives reload; switch disabled on
    getRunType; `rtmod:/…` file names visible in both views. Screenshot each state for the PR.

## Docs

None, because no docs page describes the playground's sections or controls (the RunTypes about page only
links to it), and `SETUP.md`'s playground paragraph names files, not section titles. The tour itself is the
user-facing explanation.

## Fuzzing

Not a candidate. The only new logic with inputs is `generatedFactories`, and its inputs are resolver output
for real types; the preset × operation table test covers that space with a strong oracle (factory text is a
substring of the module). The tour is UI state with three values.

## Out of scope

- New presets, new operations, or changes to what the resolver emits.
- Tour translations or analytics.
- Making the playground embeddable on docs pages (it is page-only today; the tour assumes that).
- Restyling the Result area beyond what the card change implies.

## Done when

- First visit: the tour starts once the playground has loaded, highlights each of the 8 steps in order, and
  stops for good after Done or Skip (flag in `localStorage`). "Tour" button replays it.
- Toolbar, Source, Transformed source, Generated code and Pick a Function are separate cards with visible
  gaps and borders, in dark and light, wide and one-column.
- Random valid / Random invalid look like buttons (filled, icon, readable size).
- Section 3 reads "Generated RunType `<varName>` code" and follows the picker; its switch shows the
  generated factory by default or the full file, remembers the choice, and is disabled for getRunType.
  Both views show each block's `rtmod:/…` file name.
- New engine + tour tests pass on a bootstrapped host (WASM assets built); `pnpm run lint` clean.
- Browser pass done with screenshots in the PR.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own (no page is expected to change, so the docs pass should have nothing to do).

## What shipped

Built as planned, with these differences found while building:

- **No-op entries.** A function can need no generated code for a type (the mutate JSON encoder on a type
  that is plain JSON already ships a no-op entry with no factory). So the switch is disabled ONLY for
  getRunType; for a no-op the Function view shows a short note pointing at the full file. Pinned by
  "generatedFactories is empty for a no-op entry" in `engine.test.ts`; the preset × function test requires
  a factory only for the validators.
- **Binding names can hold `$`.** The generated `__rt_*` names include `$` (pure fn modules), so
  `linkBindings` matches `__rt_[\w$]+`. A `\w`-only match broke every format type (`__rt_pf is not defined`).
- **One column (below 1000px).** The Source card collapsed to a strip, because a clipping card no longer
  inherits its body's min-height. Fixed with card min-heights, `height: auto` on the page's layout rule
  below 1000px, and a 520px cap on the generated-code view there.
- **Smaller UI choices:** the tip key is `generated` (was `cache`); section 2 is titled "Transformed Source";
  code blocks sit on the card background and the file header uses the card header shade; the section 3
  status row (count + switch) right-aligns when it wraps.
- **Type controls live in the Source card** (asked for during the build). The TS type / Type Builder switch
  and the example types sit in a compact row under the Source header, with smaller buttons; the separate top
  toolbar is gone and the Tour button sits in the Source header. The page's layout rule gains the toolbar's
  height (`calc(100vh - 100px)`).
- **Function column split into three cards** (asked for during the build): 4 Pick a Function (picker +
  what it does), 5 Input (the value, Generate valid data / Generate invalid data, and a plain note that the
  value comes from RunTypes mock data, linking the Mocking guide, instead of the `createMockDataFn<MyType>()`
  call), 6 Result (Run button + result). The Input card hides for getRunType and Result then takes number 5.
  The Run button names the picked function (`Run validate`, `Run toJson`, …). Tour titles drop their numbers,
  since the Result number moves.
- **Browser pass** ran with a Playwright script against `pnpm miondevx website dev --agent`: tour walks all 8
  steps, Done and Skip (Esc) both stop it after reload, the Tour button replays it; title follows the picker;
  switch remembered across reloads and disabled on getRunType; file names shown in both views; dark + light,
  1500px and 800px wide.
