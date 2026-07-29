// Stdio shell: one JSON request per line on stdin, one JSON response line
// on stdout — the same newline-delimited framing the resolver itself
// speaks to the bundler plugin. Exits on stdin EOF, so the child can
// never outlive the Go process that spawned it.
import {createInterface} from 'node:readline';
import {runJobs, type SidecarJob} from './jobs.ts';

interface SidecarRequest {
  v: number;
  jobs?: readonly SidecarJob[];
}

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

// JSON.stringify leaves U+2028/U+2029 raw (legal inside JSON strings), but
// they look like line breaks to newline-framed JS readers. A response can
// echo them inside offender samples, so escape both — mirroring what Go's
// encoding/json does on the request side — and no reader on either end can
// ever see a bogus line break.
function encodeLine(value: unknown): string {
  return JSON.stringify(value).split(LINE_SEPARATOR).join('\\u2028').split(PARAGRAPH_SEPARATOR).join('\\u2029');
}

const lines = createInterface({input: process.stdin, terminal: false});
lines.on('line', (line) => {
  if (line.trim() === '') return;
  let response: string;
  try {
    const request = JSON.parse(line) as SidecarRequest;
    response = encodeLine({v: 1, results: runJobs(request.jobs ?? [])});
  } catch (err) {
    response = encodeLine({v: 1, error: err instanceof Error ? err.message : String(err)});
  }
  process.stdout.write(response + '\n');
});
