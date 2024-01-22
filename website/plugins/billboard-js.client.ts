export default defineNuxtPlugin((nuxtApp) => {
    // load a css file from a cdn (billboard.js) when the ap is loading on the client side
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/billboard.js/dist/theme/datalab.min.css';
    document.head.appendChild(link);

    // load a javascript file from a cdn (billboard.js) when the ap is loading on the client side
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/billboard.js/dist/billboard.pkgd.min.js';
    script.async = true;
    document.head.appendChild(script);
  });