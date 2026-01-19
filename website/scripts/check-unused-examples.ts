#!/usr/bin/env npx tsx
/**
 * Script to find example files that are not referenced by any code-import in website docs.
 * Scans packages/examples/src for all TypeScript files and checks if they are used
 * in any <code-import> tag in website/content.
 *
 * Usage: npx tsx website/scripts/check-unused-examples.ts
 */

import {readdirSync, readFileSync, statSync} from 'fs';
import {join, resolve} from 'path';

const WEBSITE_CONTENT_DIR = resolve(__dirname, '../content');
const EXAMPLES_DIR = resolve(__dirname, '../../packages/examples/src');
const MONOREPO_ROOT = resolve(__dirname, '../..');

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

function extractAllCodeImportPaths(contentDir: string): Set<string> {
  const paths = new Set<string>();
  const mdFiles = findFiles(contentDir, '.md');

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
  const usedPaths = extractAllCodeImportPaths(WEBSITE_CONTENT_DIR);
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

  console.log('\nThese files are not referenced by any <code-import> tag in website/content/');
  process.exit(0); // Exit 0 since unused files are not necessarily errors
}

