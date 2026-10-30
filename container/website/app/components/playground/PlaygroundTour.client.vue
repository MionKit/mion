<script setup lang="ts">
// PlaygroundTour - the first-visit walkthrough: dims the page, cuts a highlighted hole around one
// `data-tour` section of the playground, and explains it in a small card. Teleported to <body> so the
// dimmed layer covers the site header too; the stage owns when it opens and what gets stored.
import type {CSSProperties} from 'vue';
import type {TourStep} from '../../playground/tour.ts';

const props = defineProps<{steps: readonly TourStep[]; open: boolean; root?: HTMLElement}>();
const emit = defineEmits<{finish: []; dismiss: []}>();

const GAP = 12;
const EDGE = 16;
const HOLE_PAD = 6;
const NARROW = 640;

const index = ref(0);
const hole = ref<{top: number; left: number; width: number; height: number} | null>(null);
const cardPos = ref<CSSProperties>({});
const cardEl = ref<HTMLElement>();
let returnFocus: HTMLElement | null = null;
let frame = 0;

const step = computed(() => props.steps[index.value]);
const isLast = computed(() => index.value === props.steps.length - 1);

function target(): HTMLElement | null {
  const name = step.value?.target;
  return name ? (props.root?.querySelector<HTMLElement>(`[data-tour="${name}"]`) ?? null) : null;
}

// Places the card beside the target: below, above, right, left, else pinned to the viewport bottom.
function placeCard(rect: DOMRect): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < NARROW) return {left: `${EDGE}px`, right: `${EDGE}px`, bottom: `${EDGE}px`};
  const width = cardEl.value?.offsetWidth ?? 340;
  const height = cardEl.value?.offsetHeight ?? 180;
  const clampX = (x: number): number => Math.min(Math.max(x, EDGE), vw - width - EDGE);
  const clampY = (y: number): number => Math.min(Math.max(y, EDGE), vh - height - EDGE);
  if (rect.bottom + GAP + height <= vh - EDGE) return {top: `${rect.bottom + GAP}px`, left: `${clampX(rect.left)}px`};
  if (rect.top - GAP - height >= EDGE) return {top: `${rect.top - GAP - height}px`, left: `${clampX(rect.left)}px`};
  if (rect.right + GAP + width <= vw - EDGE) return {top: `${clampY(rect.top)}px`, left: `${rect.right + GAP}px`};
  if (rect.left - GAP - width >= EDGE) return {top: `${clampY(rect.top)}px`, left: `${rect.left - GAP - width}px`};
  return {bottom: `${EDGE}px`, left: `${(vw - width) / 2}px`};
}

function measure(): void {
  const el = target();
  if (!el) {
    hole.value = null;
    cardPos.value = {bottom: `${EDGE}px`, left: `${EDGE}px`};
    return;
  }
  const rect = el.getBoundingClientRect();
  // Clamped to the viewport so a section taller than the screen still shows its edges.
  const top = Math.max(rect.top - HOLE_PAD, 0);
  const left = Math.max(rect.left - HOLE_PAD, 0);
  const bottom = Math.min(rect.bottom + HOLE_PAD, window.innerHeight);
  const right = Math.min(rect.right + HOLE_PAD, window.innerWidth);
  hole.value = {top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0)};
  cardPos.value = placeCard(rect);
}

function scheduleMeasure(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
}

async function show(): Promise<void> {
  target()?.scrollIntoView({block: 'nearest'});
  await nextTick();
  measure();
  // Second pass: the card's real size is only known once it rendered with the new text.
  await nextTick();
  measure();
  cardEl.value?.focus();
}

function next(): void {
  if (isLast.value) emit('finish');
  else index.value++;
}

function back(): void {
  if (index.value > 0) index.value--;
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('dismiss');
  else if (event.key === 'ArrowRight') next();
  else if (event.key === 'ArrowLeft') back();
  else return;
  event.preventDefault();
}

function attach(): void {
  window.addEventListener('resize', scheduleMeasure, {passive: true});
  window.addEventListener('scroll', scheduleMeasure, {passive: true, capture: true});
  document.addEventListener('keydown', onKey);
}

function detach(): void {
  cancelAnimationFrame(frame);
  window.removeEventListener('resize', scheduleMeasure);
  window.removeEventListener('scroll', scheduleMeasure, {capture: true});
  document.removeEventListener('keydown', onKey);
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      returnFocus = document.activeElement as HTMLElement | null;
      index.value = 0;
      attach();
      void show();
    } else {
      detach();
      returnFocus?.focus?.();
      returnFocus = null;
    }
  },
);

watch(index, () => void show());

onBeforeUnmount(detach);
</script>

<template>
  <Teleport to="body">
    <div v-if="open && step" class="rtpg-tour">
      <!-- Takes every click, so the playground cannot be used mid-tour. -->
      <div class="rtpg-tour-scrim" :class="{'is-dim': !hole}" />
      <div
        v-if="hole"
        class="rtpg-tour-hole"
        :style="{top: `${hole.top}px`, left: `${hole.left}px`, width: `${hole.width}px`, height: `${hole.height}px`}"
      />
      <div
        ref="cardEl"
        class="rtpg-tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rtpg-tour-title"
        tabindex="-1"
        :style="cardPos"
      >
        <div class="rtpg-tour-top">
          <span class="rtpg-tour-count">Step {{ index + 1 }} of {{ steps.length }}</span>
          <button type="button" class="rtpg-tour-close" aria-label="Close the tour" @click="emit('dismiss')">✕</button>
        </div>
        <div id="rtpg-tour-title" class="rtpg-tour-title">{{ step.title }}</div>
        <p class="rtpg-tour-body">{{ step.body }}</p>
        <div class="rtpg-tour-actions">
          <button type="button" class="rtpg-tour-skip" @click="emit('dismiss')">Skip tour</button>
          <span class="rtpg-tour-nav">
            <button v-if="index > 0" type="button" class="rtpg-tour-back" @click="back">Back</button>
            <button type="button" class="rtpg-tour-next" @click="next">{{ isLast ? 'Done' : 'Next' }}</button>
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<!-- Non-scoped like the stage's styles, nested under .rtpg-tour. Teleported outside .rt-playground, so
     the colour tokens it needs are re-derived here from the site tokens. -->
<style>
.rtpg-tour {
  position: fixed;
  inset: 0;
  /* Above the site's sticky header. */
  z-index: 100;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.rtpg-tour .rtpg-tour-scrim {
  position: absolute;
  inset: 0;
}
.rtpg-tour .rtpg-tour-scrim.is-dim {
  background: var(--rtpg-scrim);
}
.rtpg-tour .rtpg-tour-hole {
  position: absolute;
  border: 2px solid var(--site-accent);
  border-radius: var(--mion-panel-radius);
  box-shadow: 0 0 0 9999px var(--rtpg-scrim);
  pointer-events: none;
  transition: top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease;
}
.rtpg-tour .rtpg-tour-card {
  position: absolute;
  width: min(340px, calc(100vw - 32px));
  padding: 14px 16px;
  border: 1px solid var(--ui-border);
  border-radius: var(--mion-panel-radius);
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
  box-shadow: 0 10px 30px var(--rtpg-shadow);
  outline: none;
}
@media (max-width: 639px) {
  .rtpg-tour .rtpg-tour-card {
    width: auto;
  }
}
.rtpg-tour .rtpg-tour-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rtpg-tour .rtpg-tour-count {
  color: var(--site-accent);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.rtpg-tour .rtpg-tour-close {
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 14px;
  cursor: pointer;
}
.rtpg-tour .rtpg-tour-close:hover {
  color: var(--ui-text-highlighted);
}
.rtpg-tour .rtpg-tour-title {
  margin-top: 6px;
  font-size: 15px;
  font-weight: 600;
}
.rtpg-tour .rtpg-tour-body {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.5;
}
.rtpg-tour .rtpg-tour-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}
.rtpg-tour .rtpg-tour-nav {
  display: flex;
  gap: 8px;
}
.rtpg-tour .rtpg-tour-skip {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 12.5px;
  text-decoration: underline;
  cursor: pointer;
}
.rtpg-tour .rtpg-tour-back,
.rtpg-tour .rtpg-tour-next {
  border-radius: var(--ui-radius);
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.rtpg-tour .rtpg-tour-back {
  border: 1px solid var(--ui-border);
  background: transparent;
  color: var(--ui-text-highlighted);
}
.rtpg-tour .rtpg-tour-next {
  border: 1px solid var(--site-accent);
  background: var(--site-accent);
  color: var(--rtpg-on-accent);
}
</style>
