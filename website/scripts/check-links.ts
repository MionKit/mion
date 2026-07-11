#!/usr/bin/env npx tsx
/**
 * Script to detect broken code-import links in website content.
 * Scans all markdown files in website/content for <code-import> tags
 * and verifies that the referenced files exist.
 *
 * Usage: npx tsx website/scripts/check-links.ts
 */

import {readdirSync, readFileSync, existsSync, statSync} from 'fs';
import {join, resolve} from 'path';

const WEBSITE_CONTENT_DIR = resolve(__dirname, '../content');
const MONOREPO_ROOT = resolve(__dirname, '../..');

interface BrokenLink {
  mdFile: string;
  path: string;
  line: number;
}

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractCodeImports(content: string): Array<{path: string; line: number}> {
  const imports: Array<{path: string; line: number}> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match <code-import path="..." />
    const match = line.match(/<code-import[^>]+path="([^"]+)"/);
    if (match) {
      imports.push({path: match[1], line: i + 1});
    }
  }

  return imports;
}

function checkLinks(): BrokenLink[] {
  const brokenLinks: BrokenLink[] = [];
  const mdFiles = findMarkdownFiles(WEBSITE_CONTENT_DIR);

  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, 'utf-8');
    const imports = extractCodeImports(content);

    for (const imp of imports) {
      const absolutePath = resolve(MONOREPO_ROOT, imp.path);
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        brokenLinks.push({
          mdFile: mdFile.replace(MONOREPO_ROOT + '/', ''),
          path: imp.path,
          line: imp.line,
        });
      }
    }
  }

  return brokenLinks;
}

// Main execution
const brokenLinks = checkLinks();

if (brokenLinks.length === 0) {
  console.log('✅ All code-import links are valid!');
  process.exit(0);
} else {
  console.log(`❌ Found ${brokenLinks.length} broken code-import link(s):\n`);

  for (const link of brokenLinks) {
    console.log(`  📄 ${link.mdFile}:${link.line}`);
    console.log(`     ❌ ${link.path}\n`);
  }

  process.exit(1);
}

