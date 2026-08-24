import {ref, onMounted, onBeforeUnmount} from 'vue';

// Shared interaction model for the bottom detail panels in BenchTable.
// Hover a row → a transient PREVIEW that auto-hides on mouse-out (after a short
// grace period). Click / tap / Enter a row → PIN the panel open (so it works on
// touch). A pinned panel IGNORES hover, so the cursor can travel down to it and
// scroll a code column without the content changing underneath. Escape or the
// close button dismisses it. `onShow` lazy-loads the row's detail on first view.
export function useDetailPanel<T>(onShow: (item: T) => void) {
  /** the row whose detail is currently shown, or null when hidden */
  const active = ref<T | null>(null);
  /** pinned (clicked / tapped) panels survive mouse-out; previews don't */
  const pinned = ref(false);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  /** "hover intent" debounce: a preview opens only after the cursor rests this long */
  const HOVER_DELAY = 150;
  const HIDE_DELAY = 220;

  function cancelHide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function cancelShow() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(() => {
      if (!pinned.value) active.value = null;
    }, HIDE_DELAY);
  }

  function close() {
    cancelHide();
    cancelShow();
    pinned.value = false;
    active.value = null;
  }

  // The detail panel is a desktop-only feature: below the website's `lg` breakpoint
  // (1024px) there isn't room for a docked side panel, so the WHOLE thing is off,
  // no preview, no pin. Evaluated per call so a resize toggles it without a listener.
  function featureDisabled() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
  }

  /** Hover / focus a row: debounced transient preview (ignored while pinned or below
   *  the desktop breakpoint). The open waits out HOVER_DELAY, so a cursor merely
   *  passing across rows never triggers a load for each one. */
  function preview(item: T) {
    if (featureDisabled()) return;
    cancelHide();
    if (pinned.value) return;
    cancelShow();
    showTimer = setTimeout(() => {
      showTimer = null;
      if (pinned.value) return;
      active.value = item;
      onShow(item);
    }, HOVER_DELAY);
  }

  /** Mouse / focus left a row: drop a pending open, hide unless pinned. */
  function leave() {
    if (featureDisabled()) return;
    cancelShow();
    if (!pinned.value) scheduleHide();
  }

  /** Click / tap / Enter a row, pin the panel open immediately (no-op below desktop). */
  function pin(item: T) {
    if (featureDisabled()) return;
    cancelHide();
    cancelShow();
    active.value = item;
    pinned.value = true;
    onShow(item);
  }

  /** Cursor entered the panel itself: keep it open while it's read / scrolled. */
  function panelEnter() {
    cancelHide();
  }

  /** Cursor left the panel: hide unless pinned. */
  function panelLeave() {
    if (!pinned.value) scheduleHide();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') close();
  }
  onMounted(() => window.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    cancelHide();
    cancelShow();
  });

  return {active, pinned, close, preview, leave, pin, panelEnter, panelLeave};
}
