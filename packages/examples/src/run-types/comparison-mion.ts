import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

interface Article {
  id: string;
  title: string;
  body: string;
}

type NewArticle = Omit<Article, 'id'>;

declare function generateId(): string;

// ✅ Types are extracted directly from the function signature
const routes = {
  createArticle: mion.route((ctx, article: NewArticle): Article => {
    return {id: generateId(), ...article};
  }),
} satisfies Routes;
