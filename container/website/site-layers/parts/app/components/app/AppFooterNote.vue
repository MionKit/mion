<!-- Overrides the shell's empty AppFooterNote: the project-lineage note before the footer icons. -->
<template>
  <p class="rt-lineage">
    By <a
      href="https://x.com/Ma_jrz"
      target="_blank"
      rel="noopener noreferrer"
      class="rt-author-link"
    ><strong>Ma Jerez</strong></a>. A long-running project born from
    <a
      href="https://deepkit.io/"
      target="_blank"
      rel="noopener noreferrer"
    >Deepkit</a>, matured through
    <a
      href="https://mion.io/"
      target="_blank"
      rel="noopener noreferrer"
    >mionjs</a>
    and RunTypes, now fully precompiled and powered by TypeScript-Go.
  </p>
</template>

<style scoped>
.rt-lineage {
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--elements-text-secondary-color-static, var(--ui-text-muted));
  margin: 0;
  max-width: 34rem;
  text-align: right;
}

.rt-lineage a {
  color: var(--ui-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.rt-lineage strong {
  color: var(--ui-text-highlighted);
  font-weight: 700;
}
</style>
