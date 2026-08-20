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
        expect(observationCount('/cold')).toBe(0);
        expect(predictSize('/cold', 0.9, 1.25, 100)).toBe(125);
    });

    it('tracks a real quantile rather than mean + stddev on a skewed distribution', () => {
        // 95 small responses, 5 large ones — the shape a symmetric predictor handles worst.
        for (let i = 0; i < 95; i++) recordSize('/skew', 100);
        for (let i = 0; i < 5; i++) recordSize('/skew', 10_000);

        const p90 = predictSize('/skew', 0.9, 1, 0);
        const p99 = predictSize('/skew', 0.99, 1, 0, true);

        // p90 sits with the bulk, so the common request is not sized for the tail...
        expect(p90).toBe(100);
        // ...while the pooled quantile still covers the largest observed payload.
        expect(p99).toBe(10_000);
    });

    it('applies the pad multiplier', () => {
        recordSize('/pad', 80);
        expect(predictSize('/pad', 0.9, 1.25, 0)).toBe(100);
    });

    it('ages a regime shift out within the ring window', () => {
        configureSizeStats({ringSize: 8});
        for (let i = 0; i < 8; i++) recordSize('/shift', 10);
        expect(predictSize('/shift', 0.9, 1, 0)).toBe(10);

        // the payload size changes; after a full window the old regime is gone entirely
        for (let i = 0; i < 8; i++) recordSize('/shift', 5000);
        expect(predictSize('/shift', 0.5, 1, 0)).toBe(5000);
    });

    it('caps observations at the ring size', () => {
        configureSizeStats({ringSize: 4});
        for (let i = 0; i < 50; i++) recordSize('/cap', 1);
        expect(observationCount('/cap')).toBe(4);
    });

    it('evicts keys once the cap is hit, without throwing', () => {
        configureSizeStats({maxKeys: 10});
        for (let i = 0; i < 40; i++) recordSize(`/route-${i}`, 100);
        expect(stats_size()).toBeLessThanOrEqual(10);
        // the most recent key survives and still predicts
        expect(predictSize('/route-39', 0.9, 1, 0)).toBe(100);
    });
});

/** tracked-key count, via the only observable surface (there is no getter by design) */
function stats_size(): number {
    let n = 0;
    for (let i = 0; i < 40; i++) if (observationCount(`/route-${i}`) > 0) n++;
    return n;
}
