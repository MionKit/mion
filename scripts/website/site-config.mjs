// Which site the website scripts act on. A repo that owns a site keeps ONE `website.config.json` at
// its root; the scripts walk up to it from the working directory, else use this checkout's own, so one
// command builds mion.io from here and another site from a repo that has mion as a submodule.

import {existsSync, readdirSync, readFileSync, realpathSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {REPO_ROOT} from '../lib/env.mjs';
import {die} from '../lib/proc.mjs';

export const CONFIG_FILE = 'website.config.json';
const MION_SITE_DIR = join(REPO_ROOT, 'container/website');

/** The first website.config.json at or above `from`, else this checkout's own. */
function findSiteConfig(from = process.cwd()) {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return join(REPO_ROOT, CONFIG_FILE);
    dir = parent;
  }
}

function readConfig(configPath) {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    die(`${configPath}: not valid JSON (${err.message})`);
  }
}

const real = (path) => (existsSync(path) ? realpathSync(path) : resolve(path));

// A site layer with one of these names would sit on mion's own in the container.
const MION_LAYERS = ['shared', 'mion-io'];

/** Another repo's own layers: every folder under `<site>/site-layers/`. */
function ownLayers(siteDir, configPath) {
  const dir = join(siteDir, 'site-layers');
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    if (MION_LAYERS.includes(name)) die(`${configPath}: site layer '${join(dir, name)}' uses the name of a mion layer, rename it`);
  }
  return names.map((name) => ({name, dir: join(dir, name)}));
}

/** The site to run, every path absolute. Config paths resolve from the config file's folder. */
export function loadSite(env = process.env, from = process.cwd()) {
  const configPath = findSiteConfig(from);
  const raw = readConfig(configPath);
  const configDir = dirname(configPath);
  const siteDir = resolve(configDir, raw.site ?? 'container/website');
  const examples = raw.examples ?? {};
  for (const key of ['packages', 'exampleDirs', 'readRoots', 'externalDeps']) {
    if (examples[key] !== undefined && !Array.isArray(examples[key])) die(`${configPath}: examples.${key} must be a list`);
  }
  const isMion = real(siteDir) === real(MION_SITE_DIR);
  return {
    configPath,
    siteDir,
    // The repo whose code the docs show; MION_WEBSITE_REPO_CONTEXT points it at a sibling checkout.
    repoContext: env.MION_WEBSITE_REPO_CONTEXT ? resolve(env.MION_WEBSITE_REPO_CONTEXT) : configDir,
    containerBase: env.MION_WEBSITE_CONTAINER || raw.container || `${basename(configDir)}-website`,
    // Always this checkout's layers: another repo reaches them through its mion submodule.
    layersDir: join(MION_SITE_DIR, 'site-layers'),
    // Another repo's own layers, mounted beside mion's shared. mion.io's live in layersDir.
    siteLayers: isMion ? [] : ownLayers(siteDir, configPath),
    benchData: raw.benchData ? resolve(configDir, raw.benchData) : '',
    // mion's own site gets the mion-only stages (its package dists, playground assets, benchmarks).
    isMion,
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
