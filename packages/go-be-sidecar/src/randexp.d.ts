// randexp 0.5.3 ships no types; this is the minimal surface the sidecar uses.
declare module 'randexp' {
  export default class RandExp {
    constructor(source: string | RegExp, flags?: string);
    // Generates one string conforming to the pattern (best effort — randexp
    // is lenient with impossible constructs, so callers self-check).
    gen(): string;
    // The documented override hook for a seedable PRNG: inclusive range.
    randInt: (from: number, to: number) => number;
    // Max repetitions applied to infinite quantifiers (*, +, {n,}).
    max: number;
  }
}
