#!/usr/bin/env node
// Build-time pre-highlighter for the benchmark hover-panel code snippets.
//
// The panels normally fetch Shiki HTML from the /api/highlight server route, but a
// STATIC deploy (nuxt generate -> Cloudflare Pages) has no server, so that route
// 404s and the panels fall back to plain, unhighlighted text. This step bakes the
// Shiki HTML straight into the per-case JSON the panels fetch, so they render
// highlighted with no server at runtime and still no Shiki bundle in the browser.
//
// Mirrors server/utils/highlighter.ts (github-dark + github-light dual theme, ts/js
// grammars, prettier pre-format). Keep the two in sync. The components prefer the
// baked-in HTML and fall back to /api/highlight when it is absent (dev server).
//
//   node scripts/embed-panel-highlights.mjs [publicDir]   # default .output/public

import {createHighlighter} from 'shiki';
import {readdirSync, readFileSync, writeFileSync, statSync} from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = process.argv[2] ?? path.resolve('.output/public');

const highlighter = await createHighlighter({
  themes: ['github-dark', 'github-light'],
  langs: ['typescript', 'javascript'],
});

let prettier = null;
try {
  prettier = await import('prettier');
} catch {
  // prettier missing -> highlight the raw snippet (still colored, just not reflowed)
}

// Reflow dense single-line bodies before highlighting, like the server util does.
async function prettify(code, lang) {
  if (!prettier) return code;
  try {
    const formatted = await prettier.format(code, {
      parser: lang === 'js' ? 'babel' : 'typescript',
      printWidth: 80,
      semi: true,
      singleQuote: true,
      tabWidth: 2,
    });
    return formatted.trimEnd();
  } catch {
    return code;
  }
}

const cache = new Map();

async function toHtml(code, lang) {
  if (!code) return '';
  const langId = lang === 'js' ? 'javascript' : 'typescript';
  const key = `${langId}:${code}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const pretty = await prettify(code, lang);
  // Dual theme: dark inlined, light rides CSS variables a `:root.light` rule swaps.
  const html = highlighter.codeToHtml(pretty, {
    lang: langId,
    themes: {dark: 'github-dark', light: 'github-light'},
    defaultColor: 'dark',
  });
  cache.set(key, html);
  return html;
}

// Every per-case JSON (skip index.json) under <root>/<group>/*.json.
function caseFiles(root) {
  const out = [];
  let groups;
  try {
    groups = readdirSync(root);
  } catch {
    return out;
  }
  for (const group of groups) {
    const dir = path.join(root, group);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.json') && file !== 'index.json') out.push(path.join(dir, file));
    }
  }
  return out;
}

let benchCount = 0;

// Benchmark cases: { competitors: [{ name, sources?: {validate, validationErrors}, source? }], samplesCode? }
for (const file of caseFiles(path.join(PUBLIC_DIR, 'bench-data'))) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(data.competitors)) continue;
  for (const competitor of data.competitors) {
    if (competitor.sources) {
      competitor.sourcesHtml = {};
      if (competitor.sources.validate) competitor.sourcesHtml.validate = await toHtml(competitor.sources.validate, 'ts');
      if (competitor.sources.validationErrors)
        competitor.sourcesHtml.validationErrors = await toHtml(competitor.sources.validationErrors, 'ts');
    }
    if (competitor.source) competitor.sourceHtml = await toHtml(competitor.source, 'ts');
  }
  // The shared tested-data block (validation + correctness) rides the same pipeline.
  if (data.samplesCode) data.samplesCodeHtml = await toHtml(data.samplesCode, 'ts');
  writeFileSync(file, JSON.stringify(data));
  benchCount++;
}

process.stdout.write(`embed-panel-highlights: baked Shiki HTML into ${benchCount} bench case files under ${PUBLIC_DIR}\n`);
