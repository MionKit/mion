// Fetches server-rendered Shiki HTML for the small code snippets shown in the
// suite / benchmark hover panels. Highlighting runs on the server (POST
// /api/highlight) (plain syntax colors, no twoslash type hovers)so the
// browser ships no Shiki bundle and just injects the returned HTML. Results are
// memoized per (lang, code); '' signals the caller to render plain text.

type CodeLang = 'ts' | 'js';

const cache = new Map<string, string>();

export function useCodeHighlighter() {
  async function highlight(code: string, lang: CodeLang): Promise<string> {
    if (!code) return '';
    const key = `${lang}:${code}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    try {
      const res = await $fetch<{html: string}>('/api/highlight', {method: 'POST', body: {code, lang}});
      const html = res?.html ?? '';
      cache.set(key, html);
      return html;
    } catch {
      return '';
    }
  }

  return {highlight};
}
