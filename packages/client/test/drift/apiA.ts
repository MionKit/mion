/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Server A: the API the drift client is built against.

import {createMionRouter} from '@mionjs/router';
import {count, handlerCalls, listen} from './driftShared.ts';

const mion = createMionRouter({syncRoutes: true, skipClientRoutes: false});

const routes = {
  same: mion.route((ctx, value: number): number => {
    count('same');
    return value + 1;
  }),
  changed: mion.route((ctx, name: string): string => {
    count('changed');
    return `A ${name}`;
  }),
  optionsOnly: mion.query((ctx, value: number): number => {
    count('optionsOnly');
    return value * 2;
  }),
  fetched: mion.route((ctx, value: number): number => {
    count('fetched');
    return value - 1;
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
