import type {MenuColumn, SubsiteEntry} from './utils/subsites'

// The shared look and the settings every site fills in; identity (github, seo, socials, footer text) is the site's.
// Nuxt merges app configs with `defu`, the site first per key, so Docus' defaults still apply under anything left out.
export default defineAppConfig({
  shared: {
    // The site's own address: a section link under it becomes local. Unset: the layer fills it from `site.url`.
    origin: undefined as string | undefined,
    // Extra menu entries only this site shows.
    sections: [] as SubsiteEntry[],
    // Regex sources tested on the route path: wide drops the prose width cap and the contents rail, flush keeps the rail.
    widePages: [] as string[],
    flushPages: [] as string[],
    // The section menu button's aria-label.
    menuLabel: 'Switch section',
    // The section menu's columns. Empty: one column of every entry.
    menuColumns: [] as MenuColumn[],
  },
  // `sub: 'aside'` makes Docus' useSubNavigation scope the sidebar to the route's top-level section.
  // The section anchors it would add are replaced by the header menu (DocsAsideLeftTop.vue is overridden to nothing).
  navigation: {
    sub: 'aside',
  },
  docus: {
    aside: {
      level: 0,
      collapsed: false,
      exclude: [],
    },
    main: {
      padded: true,
      fluid: false,
    },
    header: {
      padded: true,
      logo: true,
      showLinkIcon: true,
      exclude: [],
      fluid: false,
    },
  },
  ui: {
    prose: {
      // `inline`, not inline-block: inline-block makes the line taller.
      code: {
        base: 'px-[0.3em] py-0 text-[0.86em] leading-none font-mono font-normal rounded-[0.35em] inline',
        variants: {
          color: {
            neutral: 'border border-primary/20 bg-primary/10 text-brand-700 dark:text-brand-200',
          },
        },
      },
      // Class lists are literal per colour: Tailwind only builds classes it can read. Text stays neutral for every wash.
      callout: {
        variants: {
          color: {
            info: {
              base: 'border-0 border-s-4 border-info bg-[color-mix(in_srgb,var(--ui-info)_12%,var(--mion-panel-bg))] text-default dark:text-default [&_a]:text-brand-800 dark:[&_a]:text-primary [&_a]:hover:border-primary [&_a]:focus-visible:outline-primary [&_code]:text-highlighted dark:[&_code]:text-highlighted [&_code]:border-info/25',
              icon: 'text-info-700 dark:text-info',
            },
            success: {
              base: 'border-0 border-s-4 border-success bg-[color-mix(in_srgb,var(--ui-success)_12%,var(--mion-panel-bg))] text-default dark:text-default [&_a]:text-brand-800 dark:[&_a]:text-primary [&_a]:hover:border-primary [&_a]:focus-visible:outline-primary [&_code]:text-highlighted dark:[&_code]:text-highlighted [&_code]:border-success/25',
              icon: 'text-success-700 dark:text-success',
            },
            warning: {
              base: 'border-0 border-s-4 border-warning bg-[color-mix(in_srgb,var(--ui-warning)_12%,var(--mion-panel-bg))] text-default dark:text-default [&_a]:text-brand-800 dark:[&_a]:text-primary [&_a]:hover:border-primary [&_a]:focus-visible:outline-primary [&_code]:text-highlighted dark:[&_code]:text-highlighted [&_code]:border-warning/25',
              icon: 'text-warning-700 dark:text-warning',
            },
            error: {
              base: 'border-0 border-s-4 border-error bg-[color-mix(in_srgb,var(--ui-error)_12%,var(--mion-panel-bg))] text-default dark:text-default [&_a]:text-brand-800 dark:[&_a]:text-primary [&_a]:hover:border-primary [&_a]:focus-visible:outline-primary [&_code]:text-highlighted dark:[&_code]:text-highlighted [&_code]:border-error/25',
              icon: 'text-error-700 dark:text-error',
            },
          },
        },
      },
      // TwoslashCode.vue reads this same `pre` config, so every code block looks alike.
      pre: {
        slots: {
          header: 'border-default bg-(--mion-panel-head-bg) px-4 py-2',
          filename: 'text-muted text-xs/5 font-mono',
          icon: 'hidden',
          base: 'border-default bg-(--mion-panel-bg)',
        },
        variants: {
          filename: {
            true: {
              root: '[&>pre]:border-t-0',
            },
          },
        },
      },
      codeGroup: {
        slots: {
          list: 'border-default bg-(--mion-panel-head-bg) gap-3 px-4 py-2',
          indicator: 'hidden',
          trigger: 'px-0 py-0 text-xs/5 font-mono text-dimmed data-[state=active]:text-muted hover:bg-transparent hover:text-muted',
          triggerIcon: 'hidden',
        },
      },
    },
    colors: {
      // The `brand` palette every section fills in (sites/<id>/theme.css --site-brand-*).
      primary: 'brand',
    },
  },
});
