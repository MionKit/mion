/// <reference types="vite/client" />
// Renders components the way `card` does, without a file: a bad prop or a Vue warning throws.
import {type Component, createSSRApp, h} from 'vue';
import {renderStrict} from '../src/render.ts';

const modules = import.meta.glob<{default: Component}>('../components/*.vue', {eager: true});

export async function renderCard(render: () => ReturnType<typeof h>): Promise<string> {
  const app = createSSRApp({render});
  for (const [path, module] of Object.entries(modules)) app.component(path.split('/').pop()!.slice(0, -4), module.default);
  return renderStrict(app, 'test card');
}

export const component = (name: string) => modules[`../components/${name}.vue`].default;
