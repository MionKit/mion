<script setup lang="ts">
// Overrides docus/app/components/app/AppFooterRight.vue: same icon row, plus the footer note (AppFooterNote.vue).
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
    <AppFooterNote />
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

.rt-footer-icons {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
