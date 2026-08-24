<script setup lang="ts">
// Local override of docus/app/components/app/AppFooterRight.vue. Preserves the
// default icon row (socials + github + color-mode toggle) and prepends a short
// project-lineage note with an external link to mion.pages.dev.
const appConfig = useAppConfig()
const { forced: forcedColorMode } = useDocusColorMode()

interface FooterLink {
  'icon': string
  'to': string
  'target': '_blank'
  'aria-label': string
}

const links = computed<FooterLink[]>(() => {
  const socialLinks = Object.entries(appConfig.socials || {}).flatMap(([key, url]) => {
    if (typeof url !== 'string' || !url) return []
    return [{
      'icon': `i-simple-icons-${key}`,
      'to': url,
      'target': '_blank' as const,
      'aria-label': `${key} social link`,
    }]
  })

  const githubLink = appConfig.github && appConfig.github.url
    ? [{
        'icon': 'i-simple-icons-github',
        'to': appConfig.github.url,
        'target': '_blank' as const,
        'aria-label': 'GitHub repository',
      }]
    : []

  return [...socialLinks, ...githubLink]
})
</script>

<template>
  <div class="rt-footer-right">
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
        href="https://mion.pages.dev/"
        target="_blank"
        rel="noopener noreferrer"
      >mionjs</a>
      and RunTypes, now fully precompiled and powered by TypeScript-Go.
    </p>
    <div class="rt-footer-icons">
      <template v-if="links.length">
        <UButton
          v-for="(link, index) of links"
          :key="index"
          size="sm"
          v-bind="{ color: 'neutral', variant: 'ghost', ...link }"
        />
      </template>
      <UColorModeButton v-if="!forcedColorMode" />
    </div>
  </div>
</template>

<style scoped>
.rt-footer-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

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

.rt-footer-icons {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
