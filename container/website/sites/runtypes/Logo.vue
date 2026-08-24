<template>
  <span class="rt-logo" role="img" aria-label="ts-runtypes"
    ><span class="rt-logo-primary">@ts-run</span><span class="rt-logo-clear">types</span></span>
</template>

<style scoped>
.rt-logo {
  display: inline-block;
  font-size: 1.6rem;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

/* paint-order draws the stroke BEHIND the fill so the outline hugs each
   glyph without eating into its interior. Each half's stroke is the
   opposite half's color. */
.rt-logo-primary {
  color: var(--color-primary-500);
  /* -webkit-text-stroke: 10px var(--ui-text-highlighted);
  paint-order: stroke fill; */
}

.rt-logo-clear {
  color: var(--ui-text-highlighted);
  /* -webkit-text-stroke: 10px var(--color-primary-500);
  paint-order: stroke fill; */
}
</style>
