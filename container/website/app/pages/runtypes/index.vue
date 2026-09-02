<!-- /runtypes is the subsite root and redirects to its home page, /runtypes/home: the home is a
     docs page (content/*.runtypes/00.home.md) so it renders inside the docs layout, with the
     subsite's sidebar. public/_redirects carries the same redirect for the static host. -->
<script setup lang="ts">
definePageMeta({redirect: '/runtypes/home'})
</script>

<template>
  <div />
</template>
