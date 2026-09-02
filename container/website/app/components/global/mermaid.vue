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

  // The site's accent, read from the theme tokens (sites/<site>/theme.css) so the
  // diagrams follow the site's colour scheme. Mermaid wants literal colours, both
  // here and in a diagram's own `style X color:…` lines, so `var(--name)` in the
  // slot text is substituted with the computed value before rendering.
  const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const accent = cssVar('--site-accent') || '#888888';

  mermaid.default.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: accent,
      primaryTextColor: '#fff',
      primaryBorderColor: accent,
      lineColor: '#a1a1aa',
      secondaryColor: '#27272a',
      tertiaryColor: '#18181b',
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