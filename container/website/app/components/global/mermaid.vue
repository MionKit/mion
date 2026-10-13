<template>
  <div class="mermaid-wrapper">
    <div ref="mermaidContainer" class="mermaid"></div>
    <div ref="sourceContent" style="display: none;">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';

const mermaidContainer = ref<HTMLElement | null>(null);
const sourceContent = ref<HTMLElement | null>(null);

onMounted(async () => {
  await nextTick();

  const mermaid = await import('mermaid');

  // Mermaid takes only literal colours, here and in a diagram's `style X color:…` lines: resolve every var() first.
  const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const accent = cssVar('--site-accent');

  mermaid.default.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: accent,
      primaryTextColor: cssVar('--mion-diagram-text'),
      primaryBorderColor: accent,
      lineColor: cssVar('--mion-diagram-line'),
      secondaryColor: cssVar('--mion-diagram-secondary'),
      tertiaryColor: cssVar('--mion-diagram-tertiary'),
    },
  });

  // Get the text content from the hidden slot
  if (sourceContent.value && mermaidContainer.value) {
    const text = (sourceContent.value.textContent?.trim() || '').replace(/var\((--[\w-]+)\)/g, (_, name: string) => cssVar(name));

    if (text) {
      try {
        const id = 'mermaid-' + Math.random().toString(36).substring(2, 11);
        const { svg } = await mermaid.default.render(id, text);
        mermaidContainer.value.innerHTML = svg;
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        mermaidContainer.value.textContent = 'Error rendering diagram';
      }
    }
  }
});
</script>

<style scoped>
.mermaid-wrapper {
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
  width: 100%;
}

.mermaid {
  width: 100%;
  min-width: 100%;
}

.mermaid :deep(svg) {
  width: 100%;
  max-width: 100%;
  height: auto;
  min-height: 80px;
}
</style>