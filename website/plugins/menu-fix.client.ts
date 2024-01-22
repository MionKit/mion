export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.hook('page:finish', () => {        
        setTimeout(() => {
            // commented code is not working so we need to use plain js
            // const menu: any = useMenu();
            // menu.close();
            const closeBtn: HTMLAnchorElement | null = document.querySelector("nav.dialog .wrapper button[aria-label='Menu']");
            if (closeBtn) closeBtn.click();
        }, 100)
    })
  });
  