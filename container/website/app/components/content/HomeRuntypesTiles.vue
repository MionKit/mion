<script setup lang="ts">
// Kept in code like HomeTestTiles: on the LANDING collection a page-authored tile list arrives as a single tile.
</script>

<template>
  <StatTiles
    plain
    :tiles="[
      {value: 'Validation', label: 'Type guards and error lists'},
      {value: 'Serialization', label: 'JSON round trip for any type, including Map, Set, Temporal and many more'},
      {value: 'Mocking', label: 'Sample data that fits the type'},
      {value: 'Reflection', label: 'Walk your types at runtime'},
    ]"
  />
</template>
