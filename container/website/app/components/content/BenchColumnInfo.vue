<script setup lang="ts">
// The "what is this column" hint for the benchmark tables: a small info glyph
// beside a column name in the table header, plus the explanation it reveals.
// The glyph is only the visual cue, BenchTable makes the WHOLE header cell the
// hover target, so the reader does not have to find a 13px icon.
//
// Presentational only. BenchTable passes the note straight through from the bench
// index's `columnNotes`, so any bench opts in just by emitting that block, and a
// bench without one renders nothing at all.

interface ColumnNote {
  /** Plain-language explanation of the column. */
  text: string;
  /** Optional monospace detail line (serialization: the encoder / decoder pair). */
  detail?: string;
}

defineProps<{
  /** The column name, repeated as the tip's own heading. */
  label: string;
  /** What this column measures. */
  note: ColumnNote;
  /** Which edge the tip hangs from. Callers pick the side that keeps a wide tip
   *  inside the scrolling table: `left` for columns in the left half, `right` for
   *  the right half, so it always opens toward the middle. */
  align?: 'left' | 'right';
}>();
</script>

<template>
  <span class="bench-info" :class="align === 'right' ? 'bench-info--right' : 'bench-info--left'">
    <span class="bench-info-glyph" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="12" height="12" focusable="false">
        <circle cx="8" cy="8" r="6.9" fill="none" stroke="currentColor" stroke-width="1.3" />
        <circle cx="8" cy="4.7" r="0.95" fill="currentColor" />
        <path d="M8 7.2v4.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </span>
    <!-- Hidden with opacity alone, never `visibility`, so the explanation stays in
         the accessibility tree and is read with the column name. Nothing here is
         focusable: one tab stop per column across every section would swamp
         keyboard navigation for a hint. -->
    <span class="bench-info-tip">
      <span class="bench-info-name">{{ label }}</span>
      <span class="bench-info-text">{{ note.text }}</span>
      <span v-if="note.detail" class="bench-info-detail">{{ note.detail }}</span>
    </span>
  </span>
</template>

<style scoped>
.bench-info {
  position: relative;
  display: inline-flex;
  align-items: center;
  vertical-align: -0.12em;
  margin-left: 0.25rem;
}

.bench-info-glyph {
  display: inline-flex;
  color: var(--ui-text-dimmed, #9aa0a6);
  opacity: 0.75;
  transition: color 0.12s ease, opacity 0.12s ease;
}

/* Fully opaque surface: the tip overlays heat-mapped cells, and any show-through
   makes the text unreadable. Own token rather than --rt-surface / --rt-panel,
   both of which are deliberately translucent. */
.bench-info-tip {
  --rt-tip-bg: #14161a;
  position: absolute;
  top: calc(100% + 7px);
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: max-content;
  max-width: min(22rem, calc(100vw - 3rem));
  padding: 0.5rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: 0;
  text-transform: none;
  text-align: left;
  white-space: normal;
  color: var(--ui-text-muted, #b3b8bd);
  background: var(--rt-tip-bg);
  border: 1px solid var(--ui-border);
  border-radius: 0.4rem;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55);
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 0.12s ease, transform 0.12s ease;
  pointer-events: none;
}

:root.light .bench-info-tip {
  --rt-tip-bg: #ffffff;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.18);
}

/* Anchored to the glyph, opening toward the middle of the table so a wide tip
   never lands outside the horizontally scrolling wrapper. */
.bench-info--left .bench-info-tip {
  left: -0.4rem;
}

.bench-info--right .bench-info-tip {
  right: -0.4rem;
}

.bench-info-name {
  font-weight: 600;
  color: var(--ui-primary);
}

.bench-info-detail {
  font-size: 0.66rem;
  color: var(--ui-text-dimmed, #9aa0a6);
}
</style>
