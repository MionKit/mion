/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Server B: A plus a route the client lacks, a route whose params changed and a route whose options changed.

import {createMionRouter} from '@mionjs/router';
import {count, handlerCalls, listen} from './driftShared.ts';

const mion = createMionRouter({syncRoutes: true, skipClientRoutes: false});

const routes = {
  same: mion.route((ctx, value: number): number => {
    count('same');
    return value + 1;
  }),
  changed: mion.route((ctx, name: string, age: number): string => {
    count('changed');
    return `B ${name} ${age}`;
  }),
  optionsOnly: mion.mutation((ctx, value: number): number => {
    count('optionsOnly');
    return value * 2;
  }),
  fetched: mion.route((ctx, value: number): number => {
    count('fetched');
    return value - 1;
  }),
  added: mion.route((): string => 'new'),
  fetchedChanged: mion.route((ctx, value: number): string => {
    count('fetchedChanged');
    return `B${value}`;
  }),
  secured: {
    token: mion.middleware((ctx, token: string): void => undefined),
    data: mion.route((): string => {
      count('secured/data');
      return 'secret';
    }),
  },
  handlerCalls: mion.route((): Record<string, number> => ({...handlerCalls})),
};

export const api = mion.initRoutes(routes);
export const start = listen;
