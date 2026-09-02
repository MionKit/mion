<!-- /benchmarks is the subsite root and redirects to its home page, /benchmarks/home: the home is a
     docs page (content/*.benchmarks/00.home.md) so it renders inside the docs layout, with the
     subsite's sidebar. public/_redirects carries the same redirect for the static host. -->
<script setup lang="ts">
definePageMeta({redirect: '/benchmarks/home'})
</script>

<template>
  <div />
</template>
