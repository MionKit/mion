export default defineNuxtPlugin(() => {
  // Load billboard.js CSS theme from CDN
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/billboard.js/dist/theme/datalab.min.css';
  document.head.appendChild(link);

  // Load billboard.js (packaged version with all chart types) from CDN
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/billboard.js/dist/billboard.pkgd.min.js';
  script.async = true;
  document.head.appendChild(script);
});

