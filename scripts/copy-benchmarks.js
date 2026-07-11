#!/usr/bin/env node

/**
 * Script to copy benchmark results from mion-benchmarks repo to website docs.
 *
 * Usage: node scripts/copy-benchmarks.js
 *
 * This script extracts the "## Benchmarks" section (with machine info) and
 * the "Results Table" from the benchmark markdown files and updates the
 * corresponding website documentation files.
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration: source -> destination mapping
const BENCHMARK_MAPPINGS = [
  {
    source: '../mion-benchmarks/HELLO-WORLD.md',
    dest: 'website/content/7.benchmarks/1.hello-world.md',
    benchmarkHeader: '## Benchmark Results',
    tableHeader: null, // Table is at the end without a header in hello-world
  },
  {
    source: '../mion-benchmarks/SIMPLE-USER.md',
    dest: 'website/content/7.benchmarks/2.light-validation.md',
    benchmarkHeader: '## Benchmark Results',
    tableHeader: null,
  },
  {
    source: '../mion-benchmarks/UPDATE-USER.md',
    dest: 'website/content/7.benchmarks/3.heavy-validation.md',
    benchmarkHeader: '## Benchmark Results',
    tableHeader: null,
  },
];

/**
 * Extracts the benchmark params section (Machine, Node, Run, Method) from source content
 */
function extractBenchmarkParams(content) {
  // Find the "## Benchmark Results" section
  const benchmarkMatch = content.match(/## Benchmark Results\s*\n([\s\S]*?)(?=\n####|\n##[^#]|$)/);
  if (!benchmarkMatch) {
    console.error("Could not find '## Benchmark Results' section");
    return null;
  }

  // Extract the bullet points with machine info
  const paramsSection = benchmarkMatch[1].trim();
  const lines = paramsSection.split('\n').filter((line) => line.startsWith('* __'));

  if (lines.length === 0) {
    console.error('Could not find benchmark params (Machine, Node, Run, Method)');
    return null;
  }

  return lines.join('\n');
}

/**
 * Extracts the results table from source content
 */
function extractResultsTable(content) {
  // Find the last markdown table in the file (the results table)
  const tableRegex = /(\|[^\n]+\|\n\|[\s:|-]+\|\n(?:\|[^\n]+\|\n?)+)/g;
  const tables = content.match(tableRegex);

  if (!tables || tables.length === 0) {
    console.error('Could not find results table');
    return null;
  }

  // Return the last table (which is the results table)
  return tables[tables.length - 1].trim();
}

/**
 * Updates the destination file with new benchmark data
 */
function updateDestinationFile(destPath, benchmarkParams, resultsTable) {
  if (!fs.existsSync(destPath)) {
    console.error(`Destination file not found: ${destPath}`);
    return false;
  }

  let content = fs.readFileSync(destPath, 'utf-8');

  // Update the benchmark params section
  // Find the "## Benchmarks" section and replace the params
  const benchmarkSectionRegex = /(## Benchmarks\s*\n\n)((?:\* __[^\n]+\n)+)/;
  const benchmarkMatch = content.match(benchmarkSectionRegex);

  if (benchmarkMatch) {
    content = content.replace(benchmarkSectionRegex, `$1${benchmarkParams}\n`);
  } else {
    console.error(`Could not find '## Benchmarks' section in ${destPath}`);
    return false;
  }

  // Update the results table
  // Find the "## Results Table" section and replace the table
  const resultsTableRegex = /(## Results Table\s*\n\n)(\|[^\n]+\|\n\|[\s:|-]+\|\n(?:\|[^\n]+\|\n?)+)/;
  const tableMatch = content.match(resultsTableRegex);

  if (tableMatch) {
    content = content.replace(resultsTableRegex, `$1${resultsTable}\n`);
  } else {
    console.error(`Could not find '## Results Table' section in ${destPath}`);
    return false;
  }

  fs.writeFileSync(destPath, content, 'utf-8');
  return true;
}

/**
 * Main function
 */
function main() {
  const rootDir = path.resolve(__dirname, '..');

  console.log('Copying benchmark results from mion-benchmarks to website docs...\n');

  let successCount = 0;
  let failCount = 0;

  for (const mapping of BENCHMARK_MAPPINGS) {
    const sourcePath = path.resolve(rootDir, mapping.source);
    const destPath = path.resolve(rootDir, mapping.dest);

    console.log(`Processing: ${mapping.source}`);
    console.log(`  -> ${mapping.dest}`);

    // Check if source file exists
    if (!fs.existsSync(sourcePath)) {
      console.error(`  ❌ Source file not found: ${sourcePath}`);
      failCount++;
      continue;
    }

    // Read source content
    const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

    // Extract benchmark params
    const benchmarkParams = extractBenchmarkParams(sourceContent);
    if (!benchmarkParams) {
      console.error(`  ❌ Failed to extract benchmark params`);
      failCount++;
      continue;
    }

    // Extract results table
    const resultsTable = extractResultsTable(sourceContent);
    if (!resultsTable) {
      console.error(`  ❌ Failed to extract results table`);
      failCount++;
      continue;
    }

    // Update destination file
    if (updateDestinationFile(destPath, benchmarkParams, resultsTable)) {
      console.log(`  ✅ Successfully updated`);
      successCount++;
    } else {
      console.error(`  ❌ Failed to update destination file`);
      failCount++;
    }

    console.log('');
  }

  console.log(`\nDone! ${successCount} succeeded, ${failCount} failed.`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main();
