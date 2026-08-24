// Stdio shell: one JSON request per line on stdin, one JSON response line
// on stdout — the same newline-delimited framing the resolver itself
// speaks to the bundler plugin. Exits on stdin EOF, so the child can
// never outlive the Go process that spawned it. All request handling
// lives in handleRequestLine (shared with the WASM host hook).
import {createInterface} from 'node:readline';
import {createContext, Script} from 'node:vm';
import {handleRequestLine, MATCH_TIMED_OUT, setPatternMatcher} from './jobs.ts';

// Bound every match so a catastrophically backtracking pattern answers with a
// verdict instead of wedging this process (see setPatternMatcher in jobs.ts).
// V8 checks for interrupts inside regex execution, so a vm timeout stops a
// runaway match with no worker and no second process. JavaScriptCore does not,
// so under bun the script runs to completion and the guard never fires — that
// host is left exactly as it was, still bounded by the resolver's own
// round-trip timeout.
const MATCH_BUDGET_MS = 250;

interface MatchScope {
  tester: RegExp | null;
  sample: string;
  matched: boolean;
}

const matchScope = {tester: null, sample: '', matched: false} as MatchScope;
const matchContext = createContext(matchScope);
const matchScript = new Script('matched = tester.test(sample)');

setPatternMatcher((tester, sample) => {
  matchScope.tester = tester;
  matchScope.sample = sample;
  matchScope.matched = false;
  try {
    matchScript.runInContext(matchContext, {timeout: MATCH_BUDGET_MS});
  } catch {
    return MATCH_TIMED_OUT;
  }
  return matchScope.matched;
});

const lines = createInterface({input: process.stdin, terminal: false});
lines.on('line', (line) => {
  if (line.trim() === '') return;
  process.stdout.write(handleRequestLine(line) + '\n');
});
