<script setup lang="ts">
// A card from tools/code-card, as the finished HTML `pnpm miondevx card export` wrote: the card brings its own
// look and animation. Imported, not fetched, so the card is in the prerendered HTML in its final state; on mount
// the player arms it and plays it the first time it scrolls into view (never under reduced motion).
import {arm, play} from '../../utils/codeCardPlayer'
import '../../assets/css/code-card.css'

const props = defineProps<{name: string}>()

const cards = import.meta.glob<string>('../../data/cards/*.html', {query: '?raw', import: 'default', eager: true})
const html = cards[`../../data/cards/${props.name}.html`]

const root = ref<HTMLElement>()
let observer: IntersectionObserver | undefined

onMounted(() => {
  const card = root.value?.querySelector('.code-card')
  if (!card || !arm(card)) return
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      play(card)
      observer?.disconnect()
    },
    {threshold: 0.25}
  )
  observer.observe(card)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div v-if="html" ref="root" class="code-card-embed" v-html="html" />
  <p v-else class="code-card-missing">No card named "{{ name }}": run <code>pnpm miondevx card export {{ name }}</code>.</p>
</template>

<style scoped>
.code-card-embed {
  margin: 1.5rem 0;
  border-radius: 12px;
  overflow: hidden;
}
.code-card-missing {
  padding: 1rem;
  border: 1px solid var(--ui-error);
  color: var(--ui-error);
  border-radius: 8px;
}
</style>
