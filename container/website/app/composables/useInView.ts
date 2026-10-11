import {onBeforeUnmount, onMounted, ref, type Ref} from 'vue';

/** True once the element has scrolled into view, and stays true: a bench bar grows on it. */
export function useInView(target: Ref<HTMLElement | null | undefined>, threshold = 0.2): Ref<boolean> {
  const inView = ref(false);
  let observer: IntersectionObserver | undefined;

  onMounted(() => {
    if (!target.value || typeof IntersectionObserver === 'undefined') {
      inView.value = true;
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        inView.value = true;
        observer?.disconnect();
      },
      {threshold}
    );
    observer.observe(target.value);
  });
  onBeforeUnmount(() => observer?.disconnect());

  return inView;
}
