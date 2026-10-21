<script setup lang="ts">
// The root landing's "Tested to the highest standard" tiles.
//
// It exists because the tile list cannot be authored in the page. On a DOCS page the
// `stat-tiles` component takes its tiles as component frontmatter, and that is how the
// runtypes about page used to carry them; on the LANDING collection the same block
// arrives as a single tile holding only its first key, silently, with nothing in the
// build log. So the homepage's tiles live here, in code, and the page names one
// component with no arguments.
//
// The numbers themselves still come from the generated counts StatTiles imports
// (scripts/website/gen-test-counts.mjs), never from anything typed here.
</script>

<template>
  <StatTiles
    :tiles="[
      {source: 'frontEndTests', label: 'front-end tests', sub: 'Vitest, every package', hue: 145},
      {source: 'goTests', label: 'Go tests', sub: 'go test, the type resolver', hue: 198},
      {
        value: '∞',
        label: 'Fuzzy Testing',
        sub: 'Random inputs and randomly-generated types, checked against invariants, with every finding replayable from a seed.',
        hue: 280,
        wide: true,
        action: {label: 'Fuzz harness on GitHub', to: 'https://github.com/MionKit/mion/tree/main/packages/run-types/test/fuzz'},
      },
    ]"
  />
</template>
