/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Server C: the changed route now changes its return type, and the middleware of an unchanged route changes.

import {createMionRouter} from '@mionjs/router';
import {count, handlerCalls, listen} from './driftShared.ts';

const mion = createMionRouter({syncRoutes: true, skipClientRoutes: false});

const routes = {
  same: mion.route((ctx, value: number): number => {
    count('same');
    return value + 1;
  }),
  changed: mion.route((ctx, name: string): number => {
    count('changed');
    return name.length;
  }),
  optionsOnly: mion.route(
    (ctx, value: number): number => {
      count('optionsOnly');
      return value * 2;
    },
    {description: 'options changed, types did not'}
  ),
  fetched: mion.route((ctx, value: number): number => {
    count('fetched');
    return value - 1;
  }),
  fetchedChanged: mion.route((ctx, value: number): string => {
    count('fetchedChanged');
    return `B${value}`;
  }),
  secured: {
    token: mion.middleware((ctx, token: number): void => undefined),
    data: mion.route((): string => {
      count('secured/data');
      return 'secret';
    }),
  },
  handlerCalls: mion.route((): Record<string, number> => ({...handlerCalls})),
};

export const api = mion.initRoutes(routes);
export const start = listen;
