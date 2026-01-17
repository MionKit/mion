export default defineAppConfig({
  seo: {
    title: 'mion - Full Stack APIs at the speed of light',
    description: 'mion is a lightweight typescript framework designed to build Full Stack APIs, and offer the best developer experience.',
    image: 'https://mion.io/banners/mion-website-banner-1-2.png',
  },
  docus: {
    title: 'Full Stack APIs at the speed of light 🚀',
    description: 'Speed up API development and say hello to a smoother development experience.',
    image: 'https://mion.io/banners/mion-website-banner-1-2.png',
    socials: {
      github: 'MionKit/mion',
      twitter: '@Ma_jrz',
    },
    github: {
      dir: 'docs/site',
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
        href: 'https://github.com/MionKit/mion/blob/master/LICENSE',
      },
    }
  },
  ui: {
    colors: {
      primary: 'green',
      white: {
        value: "#f7f7ff",
        raw: "#f7f7ff"
      },
      black: {
        value: "#15131a",
        raw: "#15131a"
      },
  }
  },
})
