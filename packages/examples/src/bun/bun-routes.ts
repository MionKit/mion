import {createMionRouter, Routes} from '@mionjs/router';

export const mion = createMionRouter();

export const routes = {
  sayHello: mion.route((ctx, name: string): string => {
    return `Hello ${name}!`;
  }),
} satisfies Routes;
