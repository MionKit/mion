/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach} from 'vitest';
import {configureSizeStats, observationCount, predictSize, recordSize, resetSizeStats} from './sizeStats.ts';

describe('binary sizeStats', () => {
    beforeEach(() => resetSizeStats());

    it('falls back to the given cold-start size (padded) until the key is observed', () => {
        expect(observationCount('cold', true)).toBe(0);
        expect(predictSize('cold', true, 0.9, 1.25, 100)).toBe(125);
    });

    it('tracks a real quantile rather than mean + stddev on a skewed distribution', () => {
        // 95 small responses, 5 large ones — the shape a symmetric predictor handles worst.
        for (let i = 0; i < 95; i++) recordSize('skew', 100, true);
        for (let i = 0; i < 5; i++) recordSize('skew', 10_000, true);

        const p90 = predictSize('skew', true, 0.9, 1, 0);
        const max = predictSize('skew', true, 1, 1, 0);

        // p90 sits with the bulk, so the common request is not sized for the tail...
        expect(p90).toBe(100);
        // ...while the pooled quantile still covers the largest observed payload.
        expect(max).toBe(10_000);
    });

    it('honours the quantile it is given', () => {
        configureSizeStats({ringSize: 10});
        for (let i = 1; i <= 10; i++) recordSize('q', i * 100, true);
        expect(predictSize('q', true, 0, 1, 0)).toBe(100);
        expect(predictSize('q', true, 0.5, 1, 0)).toBe(600);
        expect(predictSize('q', true, 1, 1, 0)).toBe(1000);
    });

    it('applies the pad multiplier', () => {
        recordSize('pad', 80, true);
        expect(predictSize('pad', true, 0.9, 1.25, 0)).toBe(100);
    });

    it('ages a regime shift out within the ring window', () => {
        configureSizeStats({ringSize: 8});
        for (let i = 0; i < 8; i++) recordSize('shift', 10, true);
        expect(predictSize('shift', true, 0.9, 1, 0)).toBe(10);

        // the payload size changes; after a full window the old regime is gone entirely
        for (let i = 0; i < 8; i++) recordSize('shift', 5000, true);
        expect(predictSize('shift', true, 0.5, 1, 0)).toBe(5000);
    });

    it('caps observations at the ring size', () => {
        configureSizeStats({ringSize: 4});
        for (let i = 0; i < 50; i++) recordSize('cap', 1, true);
        expect(observationCount('cap', true)).toBe(4);
    });

    it('keeps request and response sizes apart for the same method id', () => {
        // a mion client inside a mion server writes both directions for the same id; params and
        // return values are different distributions and must not share a ring
        for (let i = 0; i < 4; i++) recordSize('getUser', 20, false);
        for (let i = 0; i < 4; i++) recordSize('getUser', 9000, true);
        expect(predictSize('getUser', false, 1, 1, 0)).toBe(20);
        expect(predictSize('getUser', true, 1, 1, 0)).toBe(9000);
        expect(observationCount('getUser', false)).toBe(4);
    });

    it('keeps the window ordered through wrap-around, for every quantile', () => {
        // the sorted view is maintained on insert (no per-call sort), so eviction has to remove the
        // value that actually aged out — cross-checked against the naive implementation
        configureSizeStats({ringSize: 16});
        const seen: number[] = [];
        let seed = 7;
        for (let i = 0; i < 200; i++) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            const bytes = (seed % 5000) + 1;
            recordSize('mix', bytes, true);
            seen.push(bytes);
            const window = seen.slice(-16).sort((a, b) => a - b);
            for (const q of [0, 0.25, 0.5, 0.9, 1]) {
                const expected = window[Math.min(window.length - 1, Math.floor(q * window.length))];
                expect(predictSize('mix', true, q, 1, 0)).toBe(expected);
            }
        }
    });

    it('evicts keys once the cap is hit, without throwing', () => {
        configureSizeStats({maxKeys: 10});
        for (let i = 0; i < 40; i++) recordSize(`route-${i}`, 100, true);
        expect(stats_size()).toBeLessThanOrEqual(10);
        // the most recent key survives and still predicts
        expect(predictSize('route-39', true, 0.9, 1, 0)).toBe(100);
    });
});

/** tracked-key count, via the only observable surface (there is no getter by design) */
function stats_size(): number {
    let n = 0;
    for (let i = 0; i < 40; i++) if (observationCount(`route-${i}`, true) > 0) n++;
    return n;
}
