// site-config.mjs: which site the website scripts act on. A repo that owns a site keeps ONE
// `website.config.json` at its root; the scripts find it by walking up from the working directory
// and fall back to this checkout's own, so the same command builds mion.io from here and another
// site from a repo that reaches these scripts through its mion submodule.

import {existsSync, readFileSync, realpathSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {REPO_ROOT} from '../lib/env.mjs';

export const CONFIG_FILE = 'website.config.json';
const MION_SITE_DIR = join(REPO_ROOT, 'container/website');
const MION_LAYERS_DIR = join(MION_SITE_DIR, 'site-layers');

/** The first website.config.json at or above `from`, else this checkout's own. */
export function findSiteConfig(from = process.cwd()) {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return join(REPO_ROOT, CONFIG_FILE);
    dir = parent;
  }
}

const real = (path) => (existsSync(path) ? realpathSync(path) : resolve(path));

/** The site to run, every path absolute. Config paths resolve from the config file's folder. */
export function loadSite(env = process.env, from = process.cwd()) {
  const configPath = findSiteConfig(from);
  const raw = JSON.parse(readFileSync(configPath, 'utf8'));
  const configDir = dirname(configPath);
  const siteDir = resolve(configDir, raw.site ?? 'container/website');
  const examples = raw.examples ?? {};
  return {
    configPath,
    siteDir,
    // The repo whose code the docs show; MION_WEBSITE_REPO_CONTEXT points it at a sibling checkout.
    repoContext: env.MION_WEBSITE_REPO_CONTEXT ? resolve(env.MION_WEBSITE_REPO_CONTEXT) : configDir,
    containerBase: env.MION_WEBSITE_CONTAINER || raw.container || `${basename(configDir)}-website`,
    layersDir: raw.layers ? resolve(configDir, raw.layers) : MION_LAYERS_DIR,
    benchData: raw.benchData ? resolve(configDir, raw.benchData) : '',
    // mion's own site gets the mion-only stages (its package dists, playground assets, benchmarks).
    isMion: real(siteDir) === real(MION_SITE_DIR),
    examples: {
      packages: examples.packages ?? [],
      exampleDirs: examples.exampleDirs ?? [],
      readRoots: examples.readRoots ?? [],
      externalDeps: examples.externalDeps ?? [],
      importableDocs: examples.importableDocs ?? {},
    },
  };
}

/** Host dir the built site is copied to: `<site>/.output`. */
export const outputDir = (site = loadSite()) => join(site.siteDir, '.output');
/** The prerendered artifact: `<site>/.output/public`. */
export const publicRoot = (site = loadSite()) => join(outputDir(site), 'public');
