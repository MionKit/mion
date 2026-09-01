#!/usr/bin/env node
/**
 * Script to find example files that are not referenced by any code-import in website docs.
 * Scans packages/examples/src for all TypeScript files and checks if they are used
 * in any <code-import> tag in EITHER site's content tree.
 *
 * Usage: node container/website/scripts/check-unused-examples.mts
 */

import {readdirSync, readFileSync, statSync} from 'fs';
import {join, resolve} from 'path';

const SITES_DIR = resolve(import.meta.dirname, '../sites');
// Same convention as server/utils/repo-root.ts: MION_REPO_ROOT is the mounted
// repo context inside the container; the fallback covers host runs.
const MONOREPO_ROOT = process.env.MION_REPO_ROOT
  ? resolve(process.env.MION_REPO_ROOT)
  : resolve(import.meta.dirname, '../../..');
const EXAMPLES_DIR = resolve(MONOREPO_ROOT, 'packages/examples/src');
// Discovered, not listed: adding a site cannot silently mark its examples unused.
const CONTENT_DIRS = readdirSync(SITES_DIR, {withFileTypes: true})
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(SITES_DIR, entry.name, 'content'));

function findFiles(dir: string, extension: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, {withFileTypes: true});

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findFiles(fullPath, extension));
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files;
}

function extractAllCodeImportPaths(contentDirs: string[]): Set<string> {
  const paths = new Set<string>();
  const mdFiles = contentDirs.flatMap((dir) => findFiles(dir, '.md'));

  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Match <code-import path="..." />
      const match = line.match(/<code-import[^>]+path="([^"]+)"/);
      if (match) {
        paths.add(match[1]);
      }
    }
  }

  return paths;
}

function findUnusedExamples(): string[] {
  const usedPaths = extractAllCodeImportPaths(CONTENT_DIRS);
  const exampleFiles = findFiles(EXAMPLES_DIR, '.ts');
  const unusedFiles: string[] = [];

  for (const exampleFile of exampleFiles) {
    const relativePath = exampleFile.replace(MONOREPO_ROOT + '/', '');
    if (!usedPaths.has(relativePath)) {
      unusedFiles.push(relativePath);
    }
  }

  return unusedFiles.sort();
}

// Main execution
const unusedExamples = findUnusedExamples();

if (unusedExamples.length === 0) {
  console.log('✅ All example files are referenced in website documentation!');
  process.exit(0);
} else {
  console.log(`📋 Found ${unusedExamples.length} unused example file(s):\n`);

  for (const file of unusedExamples) {
    console.log(`  📄 ${file}`);
  }

  console.log('\nThese files are not referenced by any <code-import> tag in either site's content tree');
  process.exit(0); // Exit 0 since unused files are not necessarily errors
}

