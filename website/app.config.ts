export default defineAppConfig({
  docus: {
    title: 'Type Safe APIs at the speed of light 🚀',
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
          text: 'Developed by Ma_jrz & Contributors',
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
  }
})
