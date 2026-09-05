import {Routes} from '@mionjs/router';
import {mion} from './full-example.app.ts';

const routes = {
  sayHello: mion.route((ctx, name: string): string => {
    return `Hello ${name}.`;
  }),
  greetings: mion.route((ctx, name1: string, name2: string): string => {
    return `Hello ${name1} and ${name2}.`;
  }),
} satisfies Routes;
