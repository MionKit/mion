// Split a tsc run's error lines into the ones the baseline EXPECTS and the ones
// it does not. The baseline is reason-tagged patterns, not a count: a number
// cannot say why, and a new failure of a known shape must still show up.
export function splitBaseline(baseline, lines) {
  const allowed = (baseline.allowed ?? []).map((row) => new RegExp(row.pattern));
  const environmental = (baseline.environmental ?? []).map((row) => new RegExp(row.pattern));
  const expected = [];
  const skipped = [];
  const unexpected = [];
  for (const line of lines) {
    if (environmental.some((pattern) => pattern.test(line))) skipped.push(line);
    else if (allowed.some((pattern) => pattern.test(line))) expected.push(line);
    else unexpected.push(line);
  }
  return {expected, skipped, unexpected};
}
