// The mion site's config. Consumed by container/website/app/app.config.ts
// through the `#site` alias, so this file exports a plain object rather than
// calling defineAppConfig itself.
export default {
  // Docus' AppHeader/AppFooterRight read this top-level `github` (not `docus.github`)
  // to render the GitHub icon in the top nav and footer. Docus normally auto-derives
  // it from the local `.git/config`, but the site runs inside a container that only
  // bind-mounts container/website/, so the .git dir is invisible from Nuxt's rootDir
  // and the auto-derivation returns undefined. Set it explicitly here.
  github: {
    owner: 'MionKit',
    name: 'mion',
    url: 'https://github.com/MionKit/mion',
    branch: 'main',
  },
  seo: {
    title: 'mion - Full Stack APIs at the speed of light',
    description: 'mion is the definitive TypeScript framework for Full Stack APIs, built for exceptional developer experience.',
    image: '/banners/mion-v2-website-banner.png',
  },
  docus: {
    title: 'Full Stack APIs at the speed of light 🚀',
    description: 'Speed up API development and say hello to a smoother development experience.',
    image: '/banners/mion-v2-website-banner.png',
    socials: {
      github: 'MionKit/mion',
      twitter: '@Ma_jrz',
    },
    github: {
      dir: 'container/website/sites/mion/content',
      branch: 'main',
      repo: 'mion',
      owner: 'MionKit',
      edit: false
    },
    aside: {
      level: 0,
      collapsed: false,
      exclude: []
    },
    main: {
      padded: true,
      fluid: false
    },
    header: {
      padded: true,
      logo: true,
      showLinkIcon: true,
      exclude: [],
      fluid: false
    },
    footer: {
      textLinks: [
        {
          text: 'Developed by Ma Jerez & Contributors',
          href: 'https://github.com/M-jerez',
          target: '_blank'
        },
      ],
      credits: {
        icon: 'icon-park-outline:copyright',
        text: `MIT license - Copyright ${new Date().getFullYear()} Mion`,
        href: 'https://github.com/MionKit/mion/blob/main/LICENSE',
      },
    }
  },
  ui: {
    colors: {
      // The site's own palette, defined in sites/mion/theme.css (--color-brand-*).
      primary: 'brand',
    },
  },
};
