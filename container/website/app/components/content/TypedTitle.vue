<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  leading: {
    type: String,
    default: '',
  },
  // A word in `leading` to strike through (e.g. "fixed"), with `enhancedWord`
  // written as a handwritten correction over it. No HTML in the markdown.
  strikeWord: {
    type: String,
    default: '',
  },
  enhancedWord: {
    type: String,
    default: '',
  },
  suffix: {
    type: String,
    default: '',
  },
  titles: {
    type: Array,
    required: true,
  },
  // Shuffle the titles once per load (client-side). Off (default) → defined order.
  randomize: {
    type: Boolean,
    default: false,
  },
  level: {
    type: Number,
    default: 1,
    validator: (value) => value >= 1 && value <= 6,
  },
});

// Pause + speed timings (ms). Typing/erasing are time-based (TYPE_SPEED /
// ERASE_SPEED) so the pace is identical on 60 Hz and 120 Hz displays; the holds
// and the empty-line gap wait on the clock too.
const HOLD_DELAY = 3000; // hold a fully typed title before erasing it
const GAP_DELAY = 350; // pause on the empty line before the next title
const TYPE_SPEED = 55; // ms per character while typing
const ERASE_SPEED = 28; // ms per character while erasing
const REDUCED_HOLD_DELAY = 3500; // reduced motion: how long each instantly-swapped title shows

// Split `leading` around `strikeWord` so the struck word + its handwritten
// correction render as real elements (no v-html, no markup in the frontmatter).
const leadingParts = computed(() => {
  const text = props.leading;
  const word = props.strikeWord;
  if (!word || !text.includes(word)) return { before: text, after: '' };
  const index = text.indexOf(word);
  return { before: text.slice(0, index), after: text.slice(index + word.length) };
});

// The first title is rendered on the server and during hydration; on the client
// the requestAnimationFrame loop below takes over and cycles through the rest.
const initialText = computed(() => props.titles[0] ?? '');

const rootEl = ref(null);
const text = ref(''); // currently displayed substring: starts empty so the first title types in on load
const isTyping = ref(false); // caret stays solid while actively typing/erasing
const isPaused = ref(false); // off-screen → park the CSS gradient + caret blink

// Animation state: plain locals so the loop mutates without reactivity cost.
let sequence = props.titles; // play order: a shuffled copy replaces it on mount when `randomize` is set
let titleIndex = 0;
let charIndex = 0;
let phase = 'typing'; // typing → holding → erasing → waiting → typing … (first load types title 0 from empty)
let waitUntil = -1; // rAF-clock deadline for the holding / waiting pauses
let lastCharAt = 0; // rAF-clock time of the last typed/erased char (paces TYPE_SPEED/ERASE_SPEED)
let reduced = false; // reduced motion: swap whole titles on a timer, no per-character typing
let rafId = 0;
let running = false;
let observer = null;
let reduceMotion = null;

// Fisher-Yates shuffle over a copy: never mutate the prop array.
function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Typing/erasing advance one character once TYPE_SPEED / ERASE_SPEED ms have
// elapsed (time-based, so 60 Hz and 120 Hz displays run at the same speed and a
// resume after a pause advances a single char, never a burst). The holds and
// the empty-line gap wait on the clock too.
function frame(now) {
  if (!running) return;
  const titles = sequence;

  // Reduced motion: skip the typewriter, just swap whole titles on a timer so
  // the messages still rotate without any character-by-character motion.
  if (reduced) {
    if (waitUntil < 0) waitUntil = now + REDUCED_HOLD_DELAY;
    if (now >= waitUntil) {
      titleIndex = (titleIndex + 1) % titles.length;
      text.value = titles[titleIndex];
      waitUntil = now + REDUCED_HOLD_DELAY;
    }
    rafId = requestAnimationFrame(frame);
    return;
  }

  if (phase === 'holding') {
    if (waitUntil < 0) waitUntil = now + HOLD_DELAY;
    if (now >= waitUntil) {
      phase = 'erasing';
      lastCharAt = now;
      isTyping.value = true;
    }
  } else if (phase === 'erasing') {
    if (now - lastCharAt >= ERASE_SPEED) {
      lastCharAt = now;
      charIndex -= 1;
      text.value = titles[titleIndex].slice(0, Math.max(charIndex, 0));
      if (charIndex <= 0) {
        charIndex = 0;
        titleIndex = (titleIndex + 1) % titles.length;
        phase = 'waiting';
        waitUntil = now + GAP_DELAY;
        isTyping.value = false;
      }
    }
  } else if (phase === 'waiting') {
    if (now >= waitUntil) {
      phase = 'typing';
      lastCharAt = now;
      isTyping.value = true;
    }
  } else {
    if (now - lastCharAt >= TYPE_SPEED) {
      lastCharAt = now;
      charIndex += 1;
      const title = titles[titleIndex];
      text.value = title.slice(0, charIndex);
      if (charIndex >= title.length) {
        phase = 'holding';
        waitUntil = now + HOLD_DELAY;
        isTyping.value = false;
      }
    }
  }

  rafId = requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  rafId = requestAnimationFrame(frame);
}

function stop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

// React if the user flips the reduced-motion preference mid-session: re-seed to
// the current title fully shown, then resume in the matching mode.
function onReduceChange(event) {
  reduced = event.matches;
  stop();
  text.value = sequence[titleIndex] ?? initialText.value;
  charIndex = text.value.length;
  phase = 'holding';
  waitUntil = -1;
  isTyping.value = false;
  start();
}

onMounted(() => {
  if (props.titles.length < 2) return; // nothing to cycle through

  sequence = props.randomize ? shuffled(props.titles) : props.titles; // freeze the play order for this load
  reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  reduced = !!reduceMotion?.matches; // reduced motion → rotate titles without typing
  reduceMotion?.addEventListener?.('change', onReduceChange);

  if (reduced) {
    text.value = sequence[titleIndex]; // reduced motion: show the first title at once (no typing)
  } else {
    phase = 'typing'; // start from the empty line (text is '') and type the first title in
    charIndex = 0;
    isTyping.value = true; // solid caret while it types
  }

  // Only run the loop while the hero is on screen; pausing also parks the CSS
  // gradient sweep + caret blink (see `.is-paused` below) so nothing repaints
  // once the hero is scrolled away.
  if (typeof IntersectionObserver !== 'undefined' && rootEl.value) {
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? true;
        isPaused.value = !visible;
        if (visible) start();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(rootEl.value);
  } else {
    start();
  }
});

onBeforeUnmount(() => {
  stop();
  observer?.disconnect();
  reduceMotion?.removeEventListener?.('change', onReduceChange);
});
</script>

<template>
  <div ref="rootEl" class="typed-title-container" :class="{ 'is-paused': isPaused }">
    <component :is="`h${level}`" class="typed-title-heading">
      <span v-if="leading" class="typed-title-leading">{{ leadingParts.before }}<span v-if="strikeWord" class="title-strike"><span class="title-strike-word">{{ strikeWord }}</span><span class="title-strike-line" aria-hidden="true" /><span v-if="enhancedWord" class="title-enhanced">{{ enhancedWord }}</span></span>{{ leadingParts.after }}</span>
      <span class="typed-title">
        <span class="is-typed">
          <span class="typed">{{ text }}</span>
          <span class="underscore" :class="{ typing: isTyping }" aria-hidden="true" />
        </span>
      </span>
      <span v-if="suffix" class="typed-title-suffix">{{ suffix }}</span>
    </component>
    <p v-if="$slots.description" class="typed-title-description">
      <slot name="description" />
    </p>
  </div>
</template>

<style scoped>
.typed-title-container {
  display: block;
  width: 100%;
  text-align: center;
}

/* Match u-page-hero title styling: text-5xl sm:text-7xl text-pretty tracking-tight font-bold text-highlighted */
.typed-title-heading {
  display: block;
  width: 100%;
  font-size: 3rem; /* text-5xl */
  line-height: 1.3;
  font-weight: 700; /* font-bold */
  text-wrap: pretty;
  color: var(--ui-text-highlighted, var(--color-gray-900));
}

@media (min-width: 640px) {
  .typed-title-heading {
    font-size: 4.5rem; /* sm:text-7xl */
  }
}

.typed-title-leading {
  --gradient-color: var(--ui-saturated);
  display: block;
  /* Gradient text effect - continuous left to right movement */
  background: linear-gradient(
    90deg,
    var(--gradient-color, #22c55e) 0%,
    color-mix(in srgb, var(--gradient-color, #22c55e) 55%, #60a5fa) 25%,
    var(--gradient-color, #22c55e) 50%,
    color-mix(in srgb, var(--gradient-color, #22c55e) 55%, #60a5fa) 75%,
    var(--gradient-color, #22c55e) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% 100%;
  animation: gradient-flow 6s linear infinite;
}

/* "We fixed → enhanced" hero correction: "fixed" is struck through and
   "enhanced" is written over it as a smaller, tilted handwritten label
   (absolutely positioned relative to the struck word). */
.title-strike {
  position: relative;
  display: inline-block;
}

/* the struck word, a touch smaller than the rest of the title */
.title-strike-word {
  color: var(--ui-text-dimmed);
  -webkit-text-fill-color: var(--ui-text-dimmed);
}

/* a real strike line (not text-decoration) so it can tilt, round its ends and
   bow into a gentle curve for a hand-drawn feel */
.title-strike-line {
  position: absolute;
  left: -7%;
  right: -7%;
  top: 54%;
  height: 4px;
  border-radius: 4px;
  transform: rotate(-4.5deg);
  pointer-events: none;
  background-color: #daa520;
}

.title-enhanced {
  transform: translateX(-55%) rotate(-3.5deg);
  position: absolute;
  left: 50%;
  bottom: 1.6em;
  font-family: 'Comic Sans MS', 'Brush Script MT', 'Caveat', cursive;
  font-size: 0.62em;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  color: #daa520;
  -webkit-text-fill-color: #daa520;
  text-decoration: none;
  pointer-events: none;
}

@keyframes gradient-flow {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: -200% center;
  }
}

.typed-title {
  display: block;
  min-height: 1.2em;
  min-width: 1rem;
  font-size: 0.7em;
}

.typed-title-suffix {
  display: block;
}

/* Match u-page-hero description styling: text-lg sm:text-xl/8 text-muted mt-6 text-balance */
.typed-title-description {
  margin-top: 1.5rem; /* mt-6 */
  font-size: 1.5rem; /* text-lg */
  line-height: 1.75rem;
  text-wrap: balance;
}

@media (min-width: 640px) {
  .typed-title-description {
    font-size: 1.25rem; /* sm:text-xl */
    line-height: 2rem; /* /8 */
  }
}

:deep(.is-typed) {
  display: inline;
}

/* Style for both SSR fallback and the caret, a vertical typing bar.
   (Swapped the underscore's width/height so it stands upright, rather than a
   rotate() which would leave a wide, mis-aligned layout box.) */
:deep(.is-typed span.underscore),
.typed-title :deep(.is-typed span.underscore) {
  display: inline-block;
  width: 0.08em;
  height: 1em;
  background-color: var(--ui-primary, #4ade80);
  color: var(--ui-primary0, #4ade80);
  animation: blink 1.5s infinite;
  margin-left: 0.12em;
  vertical-align: text-bottom;
}

/* Hold the caret solid while characters are being typed or erased. */
:deep(.is-typed span.underscore.typing),
:deep(.is-typed span.cursor.typing) {
  animation: none;
}

@keyframes blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 99% {
    opacity: 0;
  }
}

/* While the hero is scrolled off screen the IntersectionObserver adds
   `is-paused`; freeze the gradient sweep + caret blink so they stop repainting
   when nobody can see them. */
.typed-title-container.is-paused .typed-title-leading,
.typed-title-container.is-paused :deep(.is-typed span.underscore) {
  animation-play-state: paused;
}

/* Honour reduced motion: freeze the gradient sweep and the caret blink (the
   typewriter itself is skipped in script). */
@media (prefers-reduced-motion: reduce) {
  .typed-title-leading {
    animation: none;
  }
  :deep(.is-typed span.underscore) {
    animation: none;
  }
}

@media screen and (max-width: 600px) {
  .typed-title-heading {
    font-size: 2.5rem;
  }
  .typed-title-leading {
    padding-bottom: 0.5rem;
  }
  .typed-title {
    font-size: 1.5rem;

  }
  .is-typed span.underscore {
    display: none;
  }
}
</style>
