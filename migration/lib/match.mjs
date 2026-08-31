// The two pattern families the scan looks for, and the token expansion that turns a raw
// hit into a whole decision unit.
//
// Family 1 is the name itself. A sweep for `run.{0,3}type` over the tree showed the ONLY
// separators that ever occur between "run" and "type" are: nothing (19169), `-` (436),
// `_` (46) and a space (14). So this one expression is exhaustive for the name.
const NAME = /run[ _-]?types?/gi;

// Family 2 is the `rt` abbreviations, which contain no "runtype" at all and would
// otherwise be invisible to the scan. EVERY one is anchored, because a bare `rt` matches
// `sort`, `start`, `part`, `assert` and `convert`.
const ABBREV = [
  /\bRT_[A-Z][A-Z0-9_]*/g, // env vars: RT_SITE, RT_WEBSITE_PORT
  /\btsrt[-_][a-z]*/gi, // container images: tsrt-website, tsrt-e2e
  /\brt\$[a-zA-Z]+/g, // enrichment DSL keys: rt$label, rt$errors
  /\brt(Formats)?::/g, // pure-fn namespaces: rt::, rtFormats::
  /__rt[A-Za-z_]+/g, // internal brands: __rtFormatName
  /\brtx\b/g, // the repo CLI
];

// A hit is widened to the whole surrounding token so `@ts-runtypes/core` is ONE decision
// rather than a bare `runtypes` fragment with its scope and subpath stranded either side.
const TOKEN_CHAR = /[A-Za-z0-9_@/.$-]/;

function expand(line, start, end) {
  let from = start;
  let to = end;
  while (from > 0 && TOKEN_CHAR.test(line[from - 1])) from--;
  while (to < line.length && TOKEN_CHAR.test(line[to])) to++;
  return [from, to];
}

// Every match on one line, as {token, start, end}, sorted by position. `apply` relies on
// start/end being real offsets into this exact line.
export function matchLine(line) {
  const found = [];

  for (const match of line.matchAll(NAME)) {
    const [from, to] = expand(line, match.index, match.index + match[0].length);
    found.push({token: line.slice(from, to), start: from, end: to});
  }

  // The abbreviations are already whole tokens, so they are NOT expanded: widening
  // `rt$label` over the surrounding chars would swallow the object it hangs off.
  for (const pattern of ABBREV) {
    for (const match of line.matchAll(pattern)) {
      found.push({token: match[0], start: match.index, end: match.index + match[0].length});
    }
  }

  // Family 1 and family 2 can both claim one span (TS_RUNTYPES_BIN matches NAME via
  // "RUNTYPES" and ABBREV via the env pattern). Keep the longest at each start so the
  // token is the full one, and never emit the same span twice.
  const bestAtStart = new Map();
  for (const hit of found) {
    const previous = bestAtStart.get(hit.start);
    if (!previous || hit.end > previous.end) bestAtStart.set(hit.start, hit);
  }
  return [...bestAtStart.values()].sort((a, b) => a.start - b.start);
}
