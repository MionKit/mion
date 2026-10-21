// Stdio shell: one JSON request line in, one JSON response line out. Exits on stdin EOF, so the
// child can never outlive the Go process that spawned it. Request handling lives in
// handleRequestLine, shared with the WASM host hook.
import {createInterface} from 'node:readline';
import {createContext, Script} from 'node:vm';
import {handleRequestLine, MATCH_TIMED_OUT, setPatternMatcher} from './jobs.ts';

// Bound every match so a backtracking pattern cannot wedge this process (budgets live in jobs.ts).
// V8 checks interrupts inside regex, so a vm timeout suffices; JavaScriptCore does not, so under
// bun the guard never fires and only the resolver's round-trip timeout bounds a match.

interface MatchScope {
  tester: RegExp | null;
  sample: string;
  matched: boolean;
}

const matchScope = {tester: null, sample: '', matched: false} as MatchScope;
const matchContext = createContext(matchScope);
const matchScript = new Script('matched = tester.test(sample)');

setPatternMatcher((tester, sample, budgetMs) => {
  matchScope.tester = tester;
  matchScope.sample = sample;
  matchScope.matched = false;
  try {
    matchScript.runInContext(matchContext, {timeout: budgetMs});
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
