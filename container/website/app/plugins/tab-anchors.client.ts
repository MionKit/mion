// A link to a heading in a hidden `::tabs` panel opens its tab first, or the browser stays at the page top.
export default defineNuxtPlugin((nuxtApp) => {
  const reveal = (hash: string): void => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    const panel = target?.closest<HTMLElement>('[role="tabpanel"]');
    if (!target || !panel || panel.dataset.state === 'active') return;
    const triggerId = panel.getAttribute('aria-labelledby');
    const trigger = triggerId ? document.getElementById(triggerId) : null;
    if (!trigger) return;
    // the tabs switch on mousedown, not on click
    trigger.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    requestAnimationFrame(() => target.scrollIntoView());
  };

  // a page load or another page linking in, once the new page is in the DOM
  nuxtApp.hook('page:finish', () => setTimeout(() => reveal(window.location.hash), 0));
  // an in-page link (the table of contents, a `#heading` link in the text)
  nuxtApp.$router.afterEach((to, from) => {
    if (to.path === from.path) setTimeout(() => reveal(to.hash), 0);
  });
});
