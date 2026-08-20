/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Measurement harness for the binary buffer lane (docs/todos/binary-buffer-strategy-redesign.md).
// Reports allocation churn, grow rate and prediction accuracy per payload profile so the
// buffer-strategy work is judged on numbers rather than intuition. Run with:
//   pnpm exec vitest bench --project router binaryBuffer

import {bench, describe} from 'vitest';
import {initMionRouter, resetRouter, getRouteExecutionChain} from '../router.ts';
import {route} from '../lib/handlers.ts';
import {Routes} from '../types/general.ts';
import {serializeBinaryBody, createDataViewSerializer} from '@mionjs/core';
import type {MethodWithJitFns} from '@mionjs/core';

interface Item {
    id: string;
    name: string;
    tags: string[];
    score: number;
}

const routes = {
    tiny: route((_ctx: any, n: number): number => n),
    small: route((_ctx: any, id: string): Item => ({id, name: 'n', tags: ['a'], score: 1})),
    skewed: route((): Item[] => []),
} satisfies Routes;

resetRouter();
initMionRouter(routes, {serializer: 'binary'});

/** Execution chain for a route path, as dispatch would build it. */
function chainFor(path: string): MethodWithJitFns[] {
    return getRouteExecutionChain(path)!.methods as unknown as MethodWithJitFns[];
}

/** One serialization, capturing what it cost. */
function measureOnce(path: string, chain: MethodWithJitFns[], routeId: string, value: unknown) {
    // A probe serializer reads the prediction WITHOUT recording anything, so it reflects
    // exactly what the real call is about to allocate.
    const predicted = createDataViewSerializer(path).buffer.byteLength;
    const {serializer} = serializeBinaryBody(path, chain, {[routeId]: value}, true);
    const payload = serializer.getLength();
    const final = serializer.buffer.byteLength;
    return {predicted, payload, final, grew: final > predicted};
}

function pct(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Runs a profile N times and prints the allocation/accuracy table. */
function profile(name: string, path: string, make: (i: number) => unknown, n = 2000) {
    const chain = chainFor(path);
    const routeId = name;
    const payloads: number[] = [];
    let grows = 0;
    let allocated = 0;
    let copied = 0;
    for (let i = 0; i < n; i++) {
        const m = measureOnce(path, chain, routeId, make(i));
        payloads.push(m.payload);
        if (m.grew) grows++;
        // every request allocates its working buffer, plus the getBuffer() slice copy the
        // router currently makes, plus whatever growth added on top
        allocated += m.final;
        copied += m.payload;
    }
    const sorted = [...payloads].sort((a, b) => a - b);
    const mean = payloads.reduce((a, b) => a + b, 0) / payloads.length;
    console.log(
        `${name.padEnd(10)} n=${n} payload(mean/p50/p90/p99/max)=` +
            `${mean.toFixed(0)}/${pct(sorted, 50)}/${pct(sorted, 90)}/${pct(sorted, 99)}/${sorted[sorted.length - 1]}` +
            ` grows=${grows} (${((grows / n) * 100).toFixed(1)}%)` +
            ` allocKB=${(allocated / 1024).toFixed(0)} copyKB=${(copied / 1024).toFixed(0)}`
    );
}

// Right-skewed: most responses small, a fat tail of large ones — the shape mean+2*stddev
// handles worst and the shape real APIs actually produce.
function skewedList(i: number): Item[] {
    const big = i % 20 === 0;
    const len = big ? 200 + (i % 300) : 1 + (i % 4);
    return Array.from({length: len}, (_, k) => ({
        id: `id-${k}`,
        name: `name-${k}`,
        tags: ['a', 'b'],
        score: k,
    }));
}

describe('binary buffer baseline', () => {
    bench(
        'measure profiles (table printed once)',
        () => {
            profile('tiny', '/tiny', () => 42);
            profile('small', '/small', (i) => ({id: `id-${i}`, name: 'name', tags: ['a', 'b'], score: i}));
            profile('skewed', '/skewed', skewedList, 1000);
        },
        {iterations: 1, warmupIterations: 0, time: 0}
    );
});
