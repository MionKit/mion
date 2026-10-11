<script setup lang="ts">
// Kept in code like HomeTestTiles: on the LANDING collection a page-authored tile list arrives as a single tile.
</script>

<template>
  <StatTiles
    :tiles="[
      {value: 'Validation', label: 'Type guards and error lists', hue: 200},
      {value: 'Serialization', label: 'JSON round trip for any type, including Map, Set, Temporal and many more', hue: 255},
      {value: 'Mocking', label: 'Sample data that fits the type', hue: 310},
      {value: 'Reflection', label: 'Walk your types at runtime', hue: 30},
    ]"
  />
</template>
