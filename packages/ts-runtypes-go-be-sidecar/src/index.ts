// Stdio shell: one JSON request per line on stdin, one JSON response line
// on stdout — the same newline-delimited framing the resolver itself
// speaks to the bundler plugin. Exits on stdin EOF, so the child can
// never outlive the Go process that spawned it. All request handling
// lives in handleRequestLine (shared with the WASM host hook).
import {createInterface} from 'node:readline';
import {handleRequestLine} from './jobs.ts';

const lines = createInterface({input: process.stdin, terminal: false});
lines.on('line', (line) => {
  if (line.trim() === '') return;
  process.stdout.write(handleRequestLine(line) + '\n');
});
